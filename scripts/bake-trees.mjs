// §137 REAL TREES, AS POINTS.
//
//   npm run trees:bake
//
// Two sources, one output format. Kenney's Nature Kit (CC0,
// kenney.nl/assets/nature-kit) gives us real modelled trees; ez-tree (MIT,
// github.com/dgreenheck/ez-tree) grows them procedurally so each world can have
// a silhouette of its own and three growth stages of it. Both end up as clouds
// of surface points in public/trees/.
//
// Why points and not the models themselves: §136 says the world is a signal,
// not a set of rendered surfaces, and a low-poly toy tree rendered normally
// would look like a different game. The MODEL gives us what we cannot invent —
// the real proportions and silhouette of a tree — and the RENDERING keeps it a
// measurement. It also means the runtime never loads a glTF, a texture or a
// material: it loads a few hundred kilobytes of Float32 positions.
//
// The zip is fetched, never committed. Only the point clouds are.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * One grown species per world. The ecology (ForestEcology.ts) already says how
 * DENSE and how TALL and how IRREGULAR each forest is; these say what a single
 * growth in it actually looks like, because density alone cannot tell the
 * machine forest from the riot at a hundred metres.
 *
 * Each entry is an ez-tree preset plus the handful of parameters that pull it
 * away from the preset, with the reason it is pulled.
 */
const WORLDS = [
  {
    world: 'techno',
    preset: 'Pine Medium',
    seed: 1370,
    tune: {
      // irregularity 0.05: techno is the metronome world, so its tree is a
      // column — no gnarl, no twist, branches at one repeated angle.
      branch: { levels: 2, gnarliness: { 0: 0.0, 1: 0.02, 2: 0.05 }, twist: { 0: 0, 1: 0, 2: 0 }, angle: { 1: 62, 2: 62 } },
      leaves: { count: 8, size: 1.4 },
    },
  },
  {
    world: 'sub-pressure',
    preset: 'Oak Medium',
    seed: 1371,
    tune: {
      // Sub is weight pressing down: a short thick trunk carrying a crown that
      // spreads sideways instead of reaching up.
      branch: { levels: 3, angle: { 1: 78, 2: 74, 3: 70 }, length: { 0: 16, 1: 14, 2: 8, 3: 3 }, radius: { 0: 1.6, 1: 0.7, 2: 0.7, 3: 0.7 } },
      leaves: { count: 14, size: 1.6 },
    },
  },
  {
    world: 'heavy-signal',
    preset: 'Ash Large',
    seed: 1372,
    tune: {
      // A signal is read from far away, so the mass has to sit high: bare
      // trunk for the first half, then everything at once.
      branch: { levels: 3, start: { 1: 0.5, 2: 0.4, 3: 0.35 }, children: { 0: 9, 1: 5, 2: 3 }, angle: { 1: 55, 2: 50, 3: 45 } },
      leaves: { count: 16, start: 0.3 },
    },
  },
  {
    world: 'broken-machine',
    preset: 'Aspen Medium',
    seed: 1373,
    tune: {
      // irregularity 0.68: nothing here grew straight. High gnarl plus a
      // sideways force gives a lean, and thin leaves make it read half-dead.
      branch: { levels: 3, gnarliness: { 0: 0.35, 1: 0.4, 2: 0.5, 3: 0.6 }, twist: { 0: 0.1, 1: 0.12, 2: 0.14, 3: 0.16 }, force: { direction: { x: 0.6, y: 0.35, z: 0.2 }, strength: 0.06 }, angle: { 1: 85, 2: 95, 3: 80 } },
      leaves: { count: 5, size: 1.1 },
    },
  },
  {
    world: 'percussion-riot',
    preset: 'Oak Large',
    seed: 1374,
    tune: {
      // density 1.35 and heightScale 0.7: many short strokes rather than few
      // long ones. Maximum branch levels, wide angles, small dense leaves.
      branch: { levels: 3, children: { 0: 14, 1: 8, 2: 5 }, angle: { 1: 88, 2: 96, 3: 100 }, length: { 0: 14, 1: 10, 2: 6, 3: 2.5 }, gnarliness: { 0: 0.2, 1: 0.25, 2: 0.3, 3: 0.35 } },
      leaves: { count: 20, size: 0.9, sizeVariance: 0.9 },
    },
  },
  {
    world: 'void-crusher',
    preset: 'Pine Large',
    seed: 1375,
    tune: {
      // density 0.6, motion 0.25: the void world is nearly empty and nearly
      // still. One near-vertical line with the barest crown left on it.
      branch: { levels: 2, children: { 0: 5, 1: 2, 2: 1 }, angle: { 1: 40, 2: 35 }, length: { 0: 34, 1: 10, 2: 4, 3: 2 }, gnarliness: { 0: 0.02, 1: 0.03, 2: 0.04 } },
      leaves: { count: 4, size: 1.2 },
    },
  },
];

/**
 * A growth becoming what it is: the same seed grown three ways, so the runtime
 * can show a species arriving when its layer is earned instead of popping in
 * finished. Earlier stages lose branch levels and children, which is how a real
 * sapling differs from its own adult — not by being a smaller copy.
 */
const STAGES = [
  { stage: 'sapling', points: 450, levels: -2, children: 0.35, leaves: 0.3 },
  { stage: 'half', points: 850, levels: -1, children: 0.6, leaves: 0.6 },
  { stage: 'full', points: 1200, levels: 0, children: 1, leaves: 1 },
];

/** Share of the points that go to leaves — the crown is what makes a tree read. */
const LEAF_SHARE = 0.55;

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
 *
 * `weights` multiplies a triangle's area, which is how the grown trees hand the
 * crown more points than its bare surface area would earn.
 */
function samplePoints(tris, count, seed = 1, weights = null) {
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const areas = tris.map((tri, i) => area(tri) * (weights ? weights[i] : 1));
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

/** Triangles out of one of ez-tree's raw vertex/index arrays. */
function meshTriangles(verts, indices) {
  const out = [];
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [];
    for (let k = 0; k < 3; k++) {
      const v = indices[i + k] * 3;
      tri.push([verts[v], verts[v + 1], verts[v + 2]]);
    }
    out.push(tri);
  }
  return out;
}

/** Deep-merge the world's tuning over a preset; only leaves are replaced. */
function merge(base, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) merge(base[key], value);
    else base[key] = value;
  }
  return base;
}

const scaleCounts = (counts, factor) => {
  for (const key of Object.keys(counts)) counts[key] = Math.max(1, Math.round(counts[key] * factor));
};

async function growWorlds() {
  // ez-tree builds three.js meshes, and three.js reaches for the DOM the moment
  // a texture is constructed. Nothing is ever rendered here — we only read the
  // vertex arrays — so the thinnest possible stand-in is enough.
  globalThis.self = globalThis;
  globalThis.document = {
    createElement: () => ({ style: {}, getContext: () => null, setAttribute() {}, addEventListener() {}, removeEventListener() {} }),
    createElementNS: () => ({ style: {}, setAttribute() {}, addEventListener() {}, removeEventListener() {} }),
  };
  const { Tree, TreePreset } = await import('@dgreenheck/ez-tree');

  const grown = [];
  for (const world of WORLDS) {
    for (const stage of STAGES) {
      const options = merge(structuredClone(TreePreset[world.preset]), world.tune);
      options.seed = world.seed;
      options.branch.levels = Math.max(1, options.branch.levels + stage.levels);
      scaleCounts(options.branch.children, stage.children);
      options.leaves.count = Math.max(1, Math.round(options.leaves.count * stage.leaves));

      const tree = new Tree();
      tree.loadFromJson(options);
      const branchTris = meshTriangles(tree.branches.verts, tree.branches.indices);
      const leafTris = meshTriangles(tree.leaves.verts, tree.leaves.indices);

      // Leaf quads carry far less area than the trunk, so left alone the crown
      // would be a rumour. Weight them up to a fixed share of the cloud.
      const branchArea = branchTris.reduce((sum, tri) => sum + area(tri), 0);
      const leafArea = leafTris.reduce((sum, tri) => sum + area(tri), 0);
      const leafWeight = leafArea > 0 ? (LEAF_SHARE / (1 - LEAF_SHARE)) * (branchArea / leafArea) : 1;
      const tris = [...branchTris, ...leafTris];
      const weights = tris.map((_, i) => (i < branchTris.length ? 1 : leafWeight));

      const id = `${world.world}-${stage.stage}`;
      const { points, radius } = samplePoints(tris, stage.points, world.seed + stage.points, weights);
      writeFileSync(join(OUT, `${id}.bin`), Buffer.from(points.buffer));
      grown.push({ id, source: 'ez-tree', model: world.preset, world: world.world, stage: stage.stage, points: stage.points, radius: Number(radius.toFixed(4)) });
      console.log(`  ${id.padEnd(24)} ${String(tris.length).padStart(5)} tris → ${stage.points} points · radius ${radius.toFixed(2)}`);
    }
  }
  return grown;
}

const work = join(tmpdir(), 'frequency-trees');
mkdirSync(work, { recursive: true });
// Rewritten whole, so a species that has been renamed or dropped cannot linger.
rmSync(OUT, { recursive: true, force: true });
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
  manifest.push({ id: species.id, source: 'kenney', model: species.file, world: null, stage: null, points: species.points, radius: Number(radius.toFixed(4)) });
  console.log(`  ${species.id.padEnd(24)} ${String(tris.length).padStart(5)} tris → ${species.points} points · radius ${radius.toFixed(2)}`);
}

console.log('\ngrowing one species per world with ez-tree (MIT)…');
manifest.push(...await growWorlds());

writeFileSync(join(OUT, 'trees.json'), `${JSON.stringify({
  sources: [
    { id: 'kenney', name: 'Kenney Nature Kit (kenney.nl/assets/nature-kit)', license: 'CC0 1.0 Universal — public domain' },
    { id: 'ez-tree', name: 'ez-tree (github.com/dgreenheck/ez-tree)', license: 'MIT' },
  ],
  species: manifest,
}, null, 2)}\n`);
console.log(`\nwritten to ${OUT}/`);
