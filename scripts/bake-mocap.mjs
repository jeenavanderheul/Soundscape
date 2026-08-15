/**
 * §176 MOCAP BAKE — turn a BVH dance clip into a vertex animation texture.
 *
 * The obvious way to render a mocap crowd is to give every dancer a skeleton
 * and a SkinnedMesh, and sample the deformed surface each frame. That works for
 * one dancer and dies at twenty: the deformed positions only exist on the GPU,
 * so sampling them means a readback per dancer per frame — and it is work that
 * is IDENTICAL every time round. The same clip, the same points, the same
 * frames, recomputed sixty times a second.
 *
 * So it happens once, here. Same shape as `bake-land` and `bake-trees`: heavy
 * work offline, a binary next to it, something dumb and fast at runtime.
 *
 * Output is a texture POINTS wide and FRAMES tall. Every texel is where one
 * body point is at one moment. At runtime the vertex shader reads it directly:
 * no skinning, no bone matrices, one draw call for the whole crowd. Three
 * things the spec asks for separately fall out for free —
 *   - phase variation per dancer  → a row offset. Costs nothing.
 *   - motion persistence (§15)    → read rows -2, -4, -8. No history buffer.
 *   - level of detail (§21)       → a stride along the point axis.
 *
 * Run: npm run mocap:bake
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const MOCAP_DIR = 'assets/mocap';
const OUT_DIR = 'public/mocap';

/** Texture height. 128 frames at 30fps is a 4.3s loop — long enough not to read as a loop. */
const FRAMES = 128;
/** Texture width: body points per dancer. The near-LOD count; mid and far stride over it. */
const POINTS = 1024;
/** Frames blended head-to-tail so the loop does not pop. */
const STITCH = 14;
/**
 * The cgspeed BVH conversion of the CMU database prepends one artificial T-pose
 * to every file. It is not recorded motion, and left in it is a body snapping
 * to attention once per loop. Skip it — but measure the dancer's height from
 * it, because a T-pose is the cleanest height reference a skeleton ever has.
 */
const TPOSE_FRAMES = 1;

/* ---------------------------------------------------------------- BVH parse */

/**
 * BVH is two sections: a nested joint hierarchy with offsets and channel
 * declarations, then one row of numbers per frame. Nothing here is clever; it
 * only has to be strict, because a 404 page saved as .bvh is the failure this
 * is most likely to meet.
 */
function parseBvh(text) {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  let i = 0;
  const next = () => tokens[i++];
  const expect = (word) => {
    const got = next();
    if (got !== word) throw new Error(`BVH: expected ${word}, got ${got} at token ${i}`);
  };

  if (next() !== 'HIERARCHY') throw new Error('BVH: no HIERARCHY section — is this really a BVH file?');

  const joints = [];

  function parseJoint(parent) {
    const name = next();
    expect('{');
    const index = joints.length;
    const joint = { name, parent, offset: [0, 0, 0], channels: [], children: [] };
    joints.push(joint);
    if (parent >= 0) joints[parent].children.push(index);

    for (;;) {
      const word = next();
      if (word === '}') break;
      if (word === 'OFFSET') {
        joint.offset = [Number(next()), Number(next()), Number(next())];
      } else if (word === 'CHANNELS') {
        const count = Number(next());
        for (let c = 0; c < count; c++) joint.channels.push(next());
      } else if (word === 'JOINT') {
        parseJoint(index);
      } else if (word === 'End') {
        next(); // "Site"
        expect('{');
        expect('OFFSET');
        const tip = { name: `${name}_tip`, parent: index, offset: [Number(next()), Number(next()), Number(next())], channels: [], children: [] };
        joints[index].children.push(joints.length);
        joints.push(tip);
        expect('}');
      } else {
        throw new Error(`BVH: unexpected token "${word}" inside joint ${name}`);
      }
    }
    return index;
  }

  expect('ROOT');
  parseJoint(-1);

  expect('MOTION');
  expect('Frames:');
  const frameCount = Number(next());
  expect('Frame');
  expect('Time:');
  const frameTime = Number(next());
  if (!Number.isFinite(frameCount) || frameCount < 2) throw new Error(`BVH: bad frame count ${frameCount}`);
  if (!Number.isFinite(frameTime) || frameTime <= 0) throw new Error(`BVH: bad frame time ${frameTime}`);

  const channelCount = joints.reduce((sum, j) => sum + j.channels.length, 0);
  const motion = new Float64Array(frameCount * channelCount);
  for (let f = 0; f < frameCount * channelCount; f++) {
    const value = Number(tokens[i++]);
    if (!Number.isFinite(value)) throw new Error(`BVH: non-numeric motion value at frame ${Math.floor(f / channelCount)}`);
    motion[f] = value;
  }

  return { joints, frameCount, frameTime, channelCount, motion };
}

/* ------------------------------------------------------------------- matrix */

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a, b) {
  const out = new Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      out[r * 4 + c] =
        a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + a[r * 4 + 3] * b[12 + c];
    }
  }
  return out;
}

function translation(x, y, z) {
  const m = identity();
  m[3] = x;
  m[7] = y;
  m[11] = z;
  return m;
}

function rotation(axis, degrees) {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const m = identity();
  if (axis === 'X') {
    m[5] = c; m[6] = -s; m[9] = s; m[10] = c;
  } else if (axis === 'Y') {
    m[0] = c; m[2] = s; m[8] = -s; m[10] = c;
  } else {
    m[0] = c; m[1] = -s; m[4] = s; m[5] = c;
  }
  return m;
}

function apply(m, p) {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
    m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
    m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
  ];
}

/** Forward kinematics: one world matrix per joint for one frame. */
function poseAt(clip, frame) {
  const { joints, channelCount, motion } = clip;
  const base = frame * channelCount;
  const world = new Array(joints.length);
  let channel = 0;

  for (let j = 0; j < joints.length; j++) {
    const joint = joints[j];
    let local = translation(joint.offset[0], joint.offset[1], joint.offset[2]);
    for (const name of joint.channels) {
      const value = motion[base + channel++];
      if (name === 'Xposition') local = multiply(local, translation(value, 0, 0));
      else if (name === 'Yposition') local = multiply(local, translation(0, value, 0));
      else if (name === 'Zposition') local = multiply(local, translation(0, 0, value));
      else local = multiply(local, rotation(name[0], value));
    }
    world[j] = joint.parent < 0 ? local : multiply(world[joint.parent], local);
  }
  return world;
}

/* --------------------------------------------------------------- body build */

/**
 * §09 asks for a mapping layer rather than one hardcoded mocap provider, and
 * §13 asks for density where human perception actually reads movement. Both are
 * the same problem: recognise what a joint IS from its name. CMU's two common
 * conversions disagree on almost every name but agree on the words inside them,
 * so match on substrings and fall back to something reasonable.
 *
 * `weight` is how many of the body's points land on this bone, relative to the
 * others. Hands and head carry the read of a dancing body far past the point
 * where the torso has dissolved into noise.
 */
const REGIONS = [
  { match: ['head', 'skull'], radius: 0.085, weight: 3.2, region: 0 },
  { match: ['neck'], radius: 0.04, weight: 0.5, region: 0 },
  { match: ['hand', 'finger', 'thumb', 'wrist'], radius: 0.045, weight: 2.6, region: 1 },
  { match: ['forearm', 'lowerarm', 'elbow'], radius: 0.05, weight: 1.6, region: 1 },
  { match: ['arm', 'shoulder', 'clavicle'], radius: 0.062, weight: 1.8, region: 1 },
  { match: ['foot', 'toe', 'ankle'], radius: 0.055, weight: 1.5, region: 2 },
  { match: ['leg', 'knee', 'shin', 'thigh'], radius: 0.075, weight: 1.2, region: 2 },
  { match: ['spine', 'chest', 'thorax', 'back'], radius: 0.115, weight: 1.0, region: 3 },
  { match: ['hip', 'pelvis', 'root'], radius: 0.11, weight: 1.0, region: 3 },
];

function classify(name) {
  const lower = name.toLowerCase();
  for (const entry of REGIONS) {
    if (entry.match.some((word) => lower.includes(word))) return entry;
  }
  return { radius: 0.07, weight: 0.8, region: 3 };
}

/** Deterministic scatter — the same clip bakes to the same body, every time. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Distribute POINTS body points over the bones. Each point is stored in its
 * PARENT joint's local frame, so animating it is one matrix multiply — this is
 * single-bone skinning, which for a point cloud is indistinguishable from the
 * real thing and costs nothing.
 */
function buildBody(clip, scale) {
  const random = makeRandom(0x5eed);
  const bones = [];
  for (let j = 0; j < clip.joints.length; j++) {
    const joint = clip.joints[j];
    for (const child of joint.children) {
      const offset = clip.joints[child].offset;
      const length = Math.hypot(offset[0], offset[1], offset[2]) * scale;
      if (length < 1e-4) continue;
      const info = classify(clip.joints[child].name);
      bones.push({ joint: j, offset, length, ...info });
    }
  }
  if (bones.length === 0) throw new Error('BVH: skeleton has no bones with length');

  const total = bones.reduce((sum, b) => sum + b.weight * b.length, 0);
  const points = [];
  for (const bone of bones) {
    const share = Math.max(1, Math.round((POINTS * bone.weight * bone.length) / total));
    for (let k = 0; k < share && points.length < POINTS; k++) {
      // Along the bone, then off it: a capsule of points, not a line of them.
      const t = random();
      const radial = Math.cbrt(random()) * bone.radius;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      points.push({
        joint: bone.joint,
        local: [
          bone.offset[0] * t + (radial * Math.sin(phi) * Math.cos(theta)) / scale,
          bone.offset[1] * t + (radial * Math.cos(phi)) / scale,
          bone.offset[2] * t + (radial * Math.sin(phi) * Math.sin(theta)) / scale,
        ],
        region: bone.region,
      });
    }
  }
  // Top up from the head down if rounding left us short: never a partial texture row.
  while (points.length < POINTS) points.push(points[points.length % Math.max(1, points.length)] ?? { joint: 0, local: [0, 0, 0], region: 3 });
  return points.slice(0, POINTS);
}

/* ---------------------------------------------------------------- the bake */

const HALF_VIEW = new DataView(new ArrayBuffer(4));

/** IEEE 754 binary32 to binary16, round-to-nearest. Values here are all small. */
function toHalf(value) {
  HALF_VIEW.setFloat32(0, value);
  const bits = HALF_VIEW.getUint32(0);
  const sign = (bits >>> 16) & 0x8000;
  const exponent = (bits >>> 23) & 0xff;
  const mantissa = bits & 0x7fffff;
  if (exponent === 0xff) return sign | 0x7c00 | (mantissa ? 0x200 : 0);
  const shifted = exponent - 127 + 15;
  if (shifted >= 0x1f) return sign | 0x7c00;
  if (shifted <= 0) return sign; // Underflow to zero; a body point this small is at the origin.
  return sign | (shifted << 10) | ((mantissa + 0x1000) >>> 13);
}

function bakeClip(path, name) {
  const clip = parseBvh(readFileSync(path, 'utf8'));

  // Normalise scale: the dancer comes out exactly 1.0 tall, and the runtime
  // decides what a person is worth in world units. BVH files disagree wildly
  // about units (inches, centimetres, arbitrary), so measuring is the only
  // thing that survives a change of source.
  const rest = poseAt(clip, 0);
  let low = Infinity;
  let high = -Infinity;
  for (const m of rest) {
    high = Math.max(high, m[7]);
    low = Math.min(low, m[7]);
  }
  const rawHeight = high - low;
  if (!(rawHeight > 0)) throw new Error(`${name}: skeleton has no height — the file is probably not mocap`);
  const scale = 1 / rawHeight;

  const points = buildBody(clip, scale);

  // Resample the clip onto FRAMES rows. Nearest frame, not interpolated: mocap
  // is dense enough that a lerp buys nothing and rotation lerp in Euler space
  // is where limbs go through torsos.
  const available = clip.frameCount - TPOSE_FRAMES;
  const usable = Math.min(available, Math.round(4.3 / clip.frameTime));
  if (usable < 30) throw new Error(`${name}: only ${usable} usable frames — too short to loop`);
  // FRAMES rows to keep, plus STITCH more to fold back over the start. A dance
  // clip does not end where it began, and these clips are two to four times
  // longer than the loop, so the overlap costs nothing.
  const rows = [];
  for (let f = 0; f < FRAMES + STITCH; f++) {
    const source = TPOSE_FRAMES + Math.min(available - 1, Math.round((f / FRAMES) * usable));
    const world = poseAt(clip, source);
    const row = new Float32Array(POINTS * 3);
    for (let p = 0; p < POINTS; p++) {
      const point = points[p];
      const w = apply(world[point.joint], point.local);
      row[p * 3] = w[0] * scale;
      row[p * 3 + 1] = w[1] * scale;
      row[p * 3 + 2] = w[2] * scale;
    }
    rows.push(row);
  }

  // Feet on the floor and hips over the origin. The drift is removed, the sway
  // is not: subtracting the per-frame centre would delete the weight shift,
  // which is most of what makes a dancer read as dancing.
  let floor = Infinity;
  let sumX = 0;
  let sumZ = 0;
  for (const row of rows) {
    for (let p = 0; p < POINTS; p++) {
      floor = Math.min(floor, row[p * 3 + 1]);
      sumX += row[p * 3];
      sumZ += row[p * 3 + 2];
    }
  }
  const meanX = sumX / (rows.length * POINTS);
  const meanZ = sumZ / (rows.length * POINTS);
  for (const row of rows) {
    for (let p = 0; p < POINTS; p++) {
      row[p * 3] -= meanX;
      row[p * 3 + 1] -= floor;
      row[p * 3 + 2] -= meanZ;
    }
  }

  // Close the loop. With sixty dancers on screen, a pop every 4.3 seconds is
  // sixty pops, and the first attempt at this measured a seam of a quarter of a
  // body height — it blended the tail towards the head, which leaves row 127
  // matching row 13 and the wrap still jumping.
  //
  // The overlap rows are what row 0 would have been if the clip had kept going,
  // so fold THEM over the start: row 0 becomes the continuation of row 127, and
  // the influence falls off across the window until the untouched motion
  // resumes. Now the wrap is a frame like any other.
  for (let s = 0; s < STITCH; s++) {
    const weight = 0.5 + 0.5 * Math.cos((Math.PI * s) / STITCH);
    const head = rows[s];
    const beyond = rows[FRAMES + s];
    for (let v = 0; v < POINTS * 3; v++) {
      head[v] = head[v] * (1 - weight) + beyond[v] * weight;
    }
  }
  rows.length = FRAMES;

  // RGBA because three dropped RGBFormat; the fourth channel carries the body
  // region, which is what lets the shader put the flicker where it belongs.
  //
  // Half precision, not full. The body is normalised to 1.0 tall and drawn at
  // nine world units, so half-float resolves it to under a centimetre — far
  // below anything visible — and it halves what the visitor has to download.
  // At five clips that is the difference between 10 MB and 5 MB.
  const texture = new Uint16Array(POINTS * FRAMES * 4);
  for (let f = 0; f < FRAMES; f++) {
    for (let p = 0; p < POINTS; p++) {
      const dst = (f * POINTS + p) * 4;
      texture[dst] = toHalf(rows[f][p * 3]);
      texture[dst + 1] = toHalf(rows[f][p * 3 + 1]);
      texture[dst + 2] = toHalf(rows[f][p * 3 + 2]);
      texture[dst + 3] = toHalf(points[p].region);
    }
  }

  writeFileSync(join(OUT_DIR, `${name}.vat`), Buffer.from(texture.buffer));
  return {
    name,
    file: `${name}.vat`,
    points: POINTS,
    frames: FRAMES,
    seconds: Number((usable * clip.frameTime).toFixed(3)),
    joints: clip.joints.length,
    sourceFrames: clip.frameCount,
    bytes: texture.byteLength,
  };
}

function main() {
  if (!existsSync(MOCAP_DIR)) throw new Error(`${MOCAP_DIR} does not exist — no mocap to bake`);
  mkdirSync(OUT_DIR, { recursive: true });
  const files = readdirSync(MOCAP_DIR).filter((f) => f.toLowerCase().endsWith('.bvh'));
  if (files.length === 0) throw new Error(`no .bvh files in ${MOCAP_DIR}`);

  const clips = [];
  for (const file of files) {
    const name = file.replace(/\.bvh$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const clip = bakeClip(join(MOCAP_DIR, file), name);
    clips.push(clip);
    console.log(`${name}: ${clip.points} points x ${clip.frames} frames, ${clip.seconds}s, ${(clip.bytes / 1024 / 1024).toFixed(2)} MB`);
  }

  writeFileSync(
    join(OUT_DIR, 'manifest.json'),
    JSON.stringify({ points: POINTS, frames: FRAMES, clips }, null, 2),
  );
  console.log(`\n${clips.length} clips -> ${OUT_DIR}/manifest.json`);
}

// Only bake when run as a script; the parser and the kinematics are pure and
// the tests import them directly.
if (process.argv[1] && process.argv[1].endsWith('bake-mocap.mjs')) main();

export { parseBvh, poseAt, buildBody, classify, POINTS, FRAMES };
