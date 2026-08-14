/**
 * §132 THE LAND — real ground under the grid.
 *
 * `npm run land:bake` writes a square of AHN surface heights (metres above
 * NAP, buildings and trees included) into public/land/. This reads that field
 * at a world position.
 *
 * The sampling is written ONCE here and mirrored in the terrain shader
 * character for character, for the reason §35 exists: the drawn grid and the
 * solid ground have to be the same surface or you fall through it. That is
 * also why the bilinear blend is spelled out by hand instead of leaning on
 * texture filtering — hardware filtering is free to round differently than JS
 * does, and "nearly the same height" is exactly the bug §35 was.
 *
 * Rijksdriehoek is in METRES, so a world unit is a metre and the map needs no
 * projection: only an origin and a scale.
 */

export interface LandField {
  /** Samples per side. */
  size: number;
  /** Height in metres above NAP, row-major, north-west corner first. */
  height: Float32Array;
  /** 1 where AHN measured nothing — laser over water returns nothing (§132). */
  water: Uint8Array;
  /** World units between two samples. */
  unitsPerSample: number;
  /** World position of sample (0, 0). */
  originX: number;
  originZ: number;
  /** Metres subtracted so the water line sits on the terrain plane. */
  seaLevel: number;
  /** How much taller than life. 1 is metre for metre. */
  verticalScale: number;
}

export interface LandManifest {
  label: string;
  layer: string;
  size: number;
  rd: { minX: number; minY: number; maxX: number; maxY: number };
  metresPerSample: number;
  lowest: number;
  highest: number;
  waterFraction: number;
}

/**
 * How the baked square is laid over the world.
 *
 * `unitsPerMetre` 0.5 makes a world unit two metres, so the 20 km square is
 * 10 000 units across — a long flight, not an afternoon. `verticalScale` 0.25
 * turns AHN's 143 m of relief into ~36 units, which fits under the flight
 * ceiling (`FLIGHT_CONFIG.maxY` 70) and sits in the same order as the §33
 * region relief (26) instead of dwarfing it.
 */
export const LAND_CONFIG = {
  region: 'amsterdam',
  unitsPerMetre: 0.5,
  verticalScale: 0.25,
} as const;

/**
 * Reads the baked square. Returns null when it is not there — the void is a
 * valid world and the game must still start without the data.
 *
 * The manifest is parsed, not probed: the dev server answers a missing file
 * with index.html and status 200, so "ok" proves nothing (§43 lesson).
 */
export async function loadLandField(
  region: string = LAND_CONFIG.region,
  base = '/land',
): Promise<LandField | null> {
  try {
    const manifest = (await (await fetch(`${base}/${region}.json`)).json()) as LandManifest;
    const [heightBuffer, waterBuffer] = await Promise.all([
      fetch(`${base}/${region}.height.bin`).then((r) => r.arrayBuffer()),
      fetch(`${base}/${region}.water.bin`).then((r) => r.arrayBuffer()),
    ]);
    const samples = manifest.size * manifest.size;
    if (heightBuffer.byteLength !== samples * 4 || waterBuffer.byteLength !== samples) return null;
    return landFieldFrom(
      manifest,
      new Float32Array(heightBuffer),
      new Uint8Array(waterBuffer),
      LAND_CONFIG.unitsPerMetre,
      LAND_CONFIG.verticalScale,
    );
  } catch {
    return null;
  }
}

/** Clamped so flying past the edge of the data holds the border height. */
const clampIndex = (value: number, size: number): number =>
  value < 0 ? 0 : value > size - 1 ? size - 1 : value;

/**
 * Height in WORLD UNITS at a world position, above the terrain plane.
 *
 * Mirrored exactly by `LAND_FIELD_GLSL`.
 */
export function sampleLand(land: LandField, x: number, z: number): number {
  const fx = (x - land.originX) / land.unitsPerSample;
  const fz = (z - land.originZ) / land.unitsPerSample;
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = fx - x0;
  const tz = fz - z0;
  const cx0 = clampIndex(x0, land.size);
  const cz0 = clampIndex(z0, land.size);
  const cx1 = clampIndex(x0 + 1, land.size);
  const cz1 = clampIndex(z0 + 1, land.size);
  const h00 = land.height[cz0 * land.size + cx0]!;
  const h10 = land.height[cz0 * land.size + cx1]!;
  const h01 = land.height[cz1 * land.size + cx0]!;
  const h11 = land.height[cz1 * land.size + cx1]!;
  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return (top + (bottom - top) * tz - land.seaLevel) * land.verticalScale;
}

/** Whether this position is water — the holes AHN's laser left behind. */
export function isWater(land: LandField, x: number, z: number): boolean {
  const fx = Math.round((x - land.originX) / land.unitsPerSample);
  const fz = Math.round((z - land.originZ) / land.unitsPerSample);
  return land.water[clampIndex(fz, land.size) * land.size + clampIndex(fx, land.size)] === 1;
}

/**
 * Lay the baked square around the world origin, so spawn is the middle of the
 * region and flying in any direction is flying across it.
 */
export function landFieldFrom(
  manifest: LandManifest,
  height: Float32Array,
  water: Uint8Array,
  unitsPerMetre: number,
  verticalScale: number,
): LandField {
  const unitsPerSample = manifest.metresPerSample * unitsPerMetre;
  const half = (manifest.size * unitsPerSample) / 2;
  return {
    size: manifest.size,
    height,
    water,
    unitsPerSample,
    originX: -half,
    originZ: -half,
    // The lowest measured point, not zero: NAP is a datum, and half of this
    // country lives under it.
    seaLevel: manifest.lowest,
    verticalScale,
  };
}

/**
 * The same read, for the terrain shader. `uLandTexel` is 1/size, and the
 * texture MUST be sampled with NEAREST — the blend below is the filtering,
 * and letting the hardware do a second one would put the drawn ground and the
 * solid ground back out of step.
 */
export const LAND_FIELD_GLSL = /* glsl */ `
uniform sampler2D uLand;
uniform float uLandSize;
uniform float uLandUnitsPerSample;
uniform vec2 uLandOrigin;
uniform float uLandSeaLevel;
uniform float uLandVerticalScale;
uniform float uLandPresent;

float landTexel(vec2 cell) {
  vec2 c = clamp(cell, vec2(0.0), vec2(uLandSize - 1.0));
  return texture2D(uLand, (c + 0.5) / uLandSize).r;
}

float sampleLand(vec2 world) {
  vec2 f = (world - uLandOrigin) / uLandUnitsPerSample;
  vec2 base = floor(f);
  vec2 t = f - base;
  float h00 = landTexel(base);
  float h10 = landTexel(base + vec2(1.0, 0.0));
  float h01 = landTexel(base + vec2(0.0, 1.0));
  float h11 = landTexel(base + vec2(1.0, 1.0));
  float top = h00 + (h10 - h00) * t.x;
  float bottom = h01 + (h11 - h01) * t.x;
  return (top + (bottom - top) * t.y - uLandSeaLevel) * uLandVerticalScale;
}
`;
