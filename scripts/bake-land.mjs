// §132 BAKE THE LAND — real Dutch elevation into a field the game can fly over.
//
// Fetches AHN (Actueel Hoogtebestand Nederland) from PDOK's WCS and writes a
// square height field plus a manifest into public/land/. Same pattern as
// `npm run sounds:vendor`: fetched once, kept out of git, so the game itself
// never depends on a network.
//
// Why AHN and not Google: the Google Maps Platform terms forbid exactly this —
// "build terrain models based on elevation values from the Elevation API"
// (ToS 3.2.2c). AHN is open data with no such restriction.
//
// dsm_05m is the SURFACE model: buildings and trees are in the height, which
// is what makes a city read as a city from the air (user decision). dtm_05m is
// the bare ground if you ever want the polder without its buildings.
//
//   npm run land:bake                     -- Amsterdam centre, 20 km, 1024²
//   npm run land:bake -- --place rotterdam
//   npm run land:bake -- --bbox 121000,487000,141000,507000 --size 2048
//
// Coordinates are RD (Rijksdriehoek, EPSG:28992) and in METRES, which is why
// they map onto world units by a single scale factor.

import { mkdir, writeFile } from 'node:fs/promises';
import { fromArrayBuffer } from 'geotiff';

const WCS = 'https://service.pdok.nl/rws/ahn/wcs/v1_0';
const OUT = new URL('../public/land/', import.meta.url);

/** RD centres of a few places worth flying over, in metres. */
const PLACES = {
  amsterdam: { x: 121_000, y: 487_000, label: 'Amsterdam' },
  rotterdam: { x: 92_500, y: 436_500, label: 'Rotterdam' },
  utrecht: { x: 136_000, y: 456_000, label: 'Utrecht' },
  denhaag: { x: 81_000, y: 455_000, label: 'Den Haag' },
  groningen: { x: 233_500, y: 582_000, label: 'Groningen' },
  veluwe: { x: 185_000, y: 460_000, label: 'Veluwe' },
};

/**
 * PDOK caps how much it will render in one request, so a large area is fetched
 * as tiles and stitched. Each tile is asked for at the resolution it will
 * occupy in the final field, so nothing is resampled twice.
 */
const TILE = 512;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    args[argv[i].slice(2)] = argv[i + 1];
  }
  const size = Number(args.size ?? 1024);
  const span = Number(args.span ?? 20_000);
  const layer = args.layer ?? 'dsm_05m';
  if (args.bbox) {
    const [minX, minY, maxX, maxY] = args.bbox.split(',').map(Number);
    return { minX, minY, maxX, maxY, size, layer, label: args.label ?? 'custom' };
  }
  const place = PLACES[args.place ?? 'amsterdam'];
  if (!place) throw new Error(`unknown --place; try ${Object.keys(PLACES).join(', ')}`);
  return {
    minX: place.x - span / 2, minY: place.y - span / 2,
    maxX: place.x + span / 2, maxY: place.y + span / 2,
    size, layer, label: place.label,
  };
}

/** One WCS window, decoded to a Float32Array of metres above NAP. */
async function fetchTile(layer, minX, minY, maxX, maxY, width, height) {
  const url = `${WCS}?service=WCS&version=2.0.1&request=GetCoverage`
    + `&coverageId=${layer}&format=image/tiff`
    + `&subset=x(${minX},${maxX})&subset=y(${minY},${maxY})`
    + `&scalesize=x(${width}),y(${height})`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`WCS ${response.status} for ${minX},${minY}`);
  const buffer = await response.arrayBuffer();
  // The GeoTIFF is Deflate-compressed WITH the floating point predictor (tag
  // 317 = 3). A hand-rolled reader that skips the predictor returns numbers
  // that look plausible and are wrong — every region came out with the same
  // range and a median of exactly 0. Hence the library.
  const image = await (await fromArrayBuffer(buffer)).getImage();
  const [raster] = await image.readRasters();
  return raster;
}

async function main() {
  const { minX, minY, maxX, maxY, size, layer, label } = parseArgs(process.argv.slice(2));
  const metresPerSample = (maxX - minX) / size;
  console.log(`${label}: ${(maxX - minX) / 1000}×${(maxY - minY) / 1000} km`
    + ` → ${size}² samples (${metresPerSample.toFixed(1)} m per sample), layer ${layer}`);

  const field = new Float32Array(size * size);
  const water = new Uint8Array(size * size);
  const tiles = Math.ceil(size / TILE);
  let lowest = Infinity;
  let highest = -Infinity;
  let waterSamples = 0;

  for (let ty = 0; ty < tiles; ty += 1) {
    for (let tx = 0; tx < tiles; tx += 1) {
      const x0 = tx * TILE;
      const y0 = ty * TILE;
      const w = Math.min(TILE, size - x0);
      const h = Math.min(TILE, size - y0);
      const raster = await fetchTile(
        layer,
        minX + x0 * metresPerSample, maxY - (y0 + h) * metresPerSample,
        minX + (x0 + w) * metresPerSample, maxY - y0 * metresPerSample,
        w, h,
      );
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const value = raster[y * w + x];
          const index = (y0 + y) * size + x0 + x;
          // AHN is a LASER measurement, and water returns nothing — so the
          // holes in the data ARE the water. The Netherlands hands us its
          // coastline, its rivers and its canals for free (user decision:
          // water as a surface of its own).
          if (!Number.isFinite(value) || value < -100 || value > 500) {
            water[index] = 1;
            field[index] = 0;
            waterSamples += 1;
            continue;
          }
          field[index] = value;
          if (value < lowest) lowest = value;
          if (value > highest) highest = value;
        }
      }
      console.log(`  tile ${ty * tiles + tx + 1}/${tiles * tiles}`);
    }
  }

  // Water reads as the local water level rather than as a pit, so a river is a
  // flat sheet and not a canyon. Nothing is invented: it is the low end of the
  // land that was actually measured around it.
  for (let i = 0; i < field.length; i += 1) if (water[i]) field[i] = lowest;

  await mkdir(OUT, { recursive: true });
  const name = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await writeFile(new URL(`${name}.height.bin`, OUT), Buffer.from(field.buffer));
  await writeFile(new URL(`${name}.water.bin`, OUT), Buffer.from(water.buffer));
  await writeFile(new URL(`${name}.json`, OUT), `${JSON.stringify({
    label, layer, size,
    rd: { minX, minY, maxX, maxY },
    metresPerSample,
    lowest, highest,
    waterFraction: waterSamples / field.length,
    source: 'AHN via PDOK (open data)',
    attribution: '© AHN / PDOK',
  }, null, 2)}\n`);

  console.log(`\n${name}: ${lowest.toFixed(1)} m .. ${highest.toFixed(1)} m NAP`
    + ` · ${(100 * waterSamples / field.length).toFixed(1)}% water`);
  console.log(`written to public/land/${name}.*`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
