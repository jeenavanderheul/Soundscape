// §137 REAL TREES, AS POINTS.
//
//   npm run trees:bake
//
// Downloads Kenney's Nature Kit (CC0, kenney.nl/assets/nature-kit), takes the
// tree models out of it and samples each one into a cloud of surface points,
// written to public/trees/.
//
// Why points and not the models themselves: §136 says the world is a signal,
// not a set of rendered surfaces, and a low-poly toy tree rendered normally
// would look like a different game. The MODEL gives us what we cannot invent —
// the real proportions and silhouette of a tree — and the RENDERING keeps it a
// measurement. It also means the runtime never loads a glTF, a texture or a
// material: it loads a few hundred kilobytes of Float32 positions.
//
// The zip is fetched, never committed. Only the point clouds are.

import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const ZIP = 'https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip';
const OUT = 'public/trees';

/**
 * The eight the worlds are built from. Kenney has 61; these carry the widest
 * range of silhouettes, which is what tells one forest from another from far
 * away (§55).
 */
const SPECIES = [
  { id: 'pine-tall', file: 'tree_pineTallA_detailed.glb', points: 1400 },
  { id: 'pine-round', file: 'tree_pineRoundA.glb', points: 1200 },
  { id: 'pine-small', file: 'tree_pineSmallD.glb', points: 700 },
  { id: 'thin', file: 'tree_thin.glb', points: 1100 },
  { id: 'tall', file: 'tree_tall.glb', points: 1300 },
  { id: 'fat', file: 'tree_fat.glb', points: 1200 },
  { id: 'detailed', file: 'tree_detailed.glb', points: 1600 },
  { id: 'plateau', file: 'tree_plateau.glb', points: 900 },
];

/** Minimal GLB reader: JSON chunk plus binary chunk, no extensions. */
function readGlb(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < view.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(buffer.subarray(start, start + length)));
    if (type === 0x004e4942) bin = buffer.subarray(start, start + length);
    offset = start + length + ((4 - (length % 4)) % 4);
  }
  return { json, bin };
}

const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const Type = COMPONENT[accessor.componentType];
  const size = COUNT[accessor.type];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  // Kenney's exports are tightly packed; interleaved views would need a stride
  // walk, and if one ever shows up it is better to fail loudly than silently
  // sample garbage.
  if (view.byteStride && view.byteStride !== size * Type.BYTES_PER_ELEMENT) {
    throw new Error('interleaved accessor, not supported');
  }
  return new Type(bin.buffer.slice(bin.byteOffset + start, bin.byteOffset + start + accessor.count * size * Type.BYTES_PER_ELEMENT));
}

/** World matrix of a node: Kenney uses TRS, no skinning. */
function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

const multiply = (a, b) => {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = sum;
  }
  return out;
};

const apply = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

/** Every triangle in the file, in model space. */
function triangles(gltf, bin) {
  const out = [];
  const walk = (index, parent) => {
    const node = gltf.nodes[index];
    const world = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        if (primitive.mode !== undefined && primitive.mode !== 4) continue; // triangles only
        const position = readAccessor(gltf, bin, primitive.attributes.POSITION);
        const index16 = primitive.indices !== undefined ? readAccessor(gltf, bin, primitive.indices) : null;
        const count = index16 ? index16.length : position.length / 3;
        for (let i = 0; i < count; i += 3) {
          const tri = [];
          for (let k = 0; k < 3; k++) {
            const v = (index16 ? index16[i + k] : i + k) * 3;
            tri.push(apply(world, position[v], position[v + 1], position[v + 2]));
          }
          out.push(tri);
        }
      }
    }
    for (const child of node.children ?? []) walk(child, world);
  };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const index of gltf.scenes[gltf.scene ?? 0].nodes) walk(index, identity);
  return out;
}

const area = ([a, b, c]) => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return Math.hypot(...cross) / 2;
};

/**
 * Points spread over the surface, area-weighted so a big trunk facet does not
 * get the same handful of points as a tiny leaf facet. Deterministic: the same
 * tree every time the script runs.
 */
function samplePoints(tris, count, seed = 1) {
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const areas = tris.map(area);
  const total = areas.reduce((a, b) => a + b, 0);
  const cumulative = [];
  let running = 0;
  for (const a of areas) { running += a; cumulative.push(running / total); }
  const out = new Float32Array(count * 3);
  let lowest = Infinity, highest = -Infinity, widest = 0;
  for (let i = 0; i < count; i++) {
    const pick = random();
    let lo = 0, hi = cumulative.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < pick) lo = mid + 1; else hi = mid; }
    const [a, b, c] = tris[lo];
    let u = random(), v = random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const x = a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]);
    const y = a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]);
    const z = a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]);
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
    lowest = Math.min(lowest, y); highest = Math.max(highest, y);
    widest = Math.max(widest, Math.hypot(x, z));
  }
  // Normalise: base at 0, tip at 1. The renderer scales by the height the
  // ecology asks for, and the base sitting exactly at 0 is what makes the
  // hard rule (never floating) a property of the data.
  const span = highest - lowest || 1;
  for (let i = 0; i < count; i++) out[i * 3 + 1] = (out[i * 3 + 1] - lowest) / span;
  for (let i = 0; i < count; i++) { out[i * 3] /= span; out[i * 3 + 2] /= span; }
  return { points: out, radius: widest / span };
}

const work = join(tmpdir(), 'frequency-trees');
mkdirSync(work, { recursive: true });
mkdirSync(OUT, { recursive: true });

console.log('fetching Kenney Nature Kit (CC0)…');
const zip = Buffer.from(await (await fetch(ZIP)).arrayBuffer());
writeFileSync(join(work, 'kit.zip'), zip);
console.log(`  ${(zip.length / 1e6).toFixed(1)} MB`);
execFileSync('unzip', ['-o', '-q', join(work, 'kit.zip'), '-d', join(work, 'kit')]);

const manifest = [];
for (const species of SPECIES) {
  const path = join(work, 'kit', 'Models', 'GLTF format', species.file);
  const { json, bin } = readGlb(readFileSync(path));
  const tris = triangles(json, bin);
  const { points, radius } = samplePoints(tris, species.points, species.id.length * 7919);
  writeFileSync(join(OUT, `${species.id}.bin`), Buffer.from(points.buffer));
  manifest.push({ id: species.id, source: species.file, points: species.points, radius: Number(radius.toFixed(4)) });
  console.log(`  ${species.id.padEnd(11)} ${String(tris.length).padStart(5)} tris → ${species.points} points · radius ${radius.toFixed(2)}`);
}

writeFileSync(join(OUT, 'trees.json'), `${JSON.stringify({
  source: "Kenney Nature Kit (kenney.nl/assets/nature-kit)",
  license: 'CC0 1.0 Universal — public domain',
  species: manifest,
}, null, 2)}\n`);
console.log(`\nwritten to ${OUT}/`);
