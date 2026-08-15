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
const POINTS = 2048;
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
/**
 * `radius` is the limb's half-width at the joint it grows FROM, as a fraction
 * of stature; `taper` is what is left of that by the far end. Both were
 * measured against a 1.80 m body, because the first pass guessed them and the
 * arms came out 115% too thick, the hands 80% and the legs 80%. Point clouds
 * are unforgiving about this: a limb that is twice as fat as a limb reads as a
 * sausage no matter how good the motion driving it is.
 */
const REGIONS = [
  // §178: the boosts were tuned when area was faked from bone length. A real
  // mesh already carries the true area, so the perceptual multiplier only has
  // to lean — at 3.2 the head took a fifth of the whole body.
  { match: ['head', 'skull'], radius: 0.055, taper: 1, bulge: true, weight: 1.7, region: 0 },
  { match: ['neck'], radius: 0.031, taper: 1, weight: 0.5, region: 0 },
  { match: ['hand', 'finger', 'thumb', 'wrist'], radius: 0.026, taper: 0.7, weight: 2.0, region: 1 },
  { match: ['forearm', 'lowerarm', 'elbow'], radius: 0.028, taper: 0.72, weight: 1.8, region: 1 },
  // The bone from the spine out to the shoulder is not an arm: it is the
  // width of the chest and the mass of the deltoid, and building it at
  // upper-arm thickness is why the figures had no shoulders to speak of.
  { match: ['shoulder', 'clavicle'], radius: 0.058, taper: 0.66, weight: 1.4, region: 1 },
  { match: ['arm'], radius: 0.037, taper: 0.78, weight: 1.8, region: 1 },
  { match: ['foot', 'toe', 'ankle'], radius: 0.029, taper: 0.8, weight: 1.5, region: 2 },
  // Thigh before shin, and both matched on what actually distinguishes them.
  // CMU calls the thigh "LeftUpLeg" and the shin "LeftLeg", so a rule looking
  // for "shin" or "calf" matched neither and every shin fell through to the
  // thigh entry — calves were thigh-thick and ankles 80% over.
  { match: ['upleg', 'upperleg', 'thigh'], radius: 0.06, taper: 0.72, weight: 1.2, region: 2 },
  { match: ['leg', 'shin', 'calf', 'knee'], radius: 0.046, taper: 0.5, weight: 1.2, region: 2 },
  { match: ['spine', 'chest', 'thorax', 'back'], radius: 0.092, taper: 1.06, weight: 1.0, region: 3 },
  { match: ['hip', 'pelvis', 'root'], radius: 0.085, taper: 0.95, weight: 1.0, region: 3 },
];

function classify(name) {
  const lower = name.toLowerCase();
  for (const entry of REGIONS) {
    if (entry.match.some((word) => lower.includes(word))) return entry;
  }
  return { radius: 0.05, taper: 0.85, weight: 0.8, region: 3 };
}

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function normalise(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
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

  // Share by SURFACE AREA, not by length. Once the points sit on the skin, a
  // bone's claim on them is how much skin it has — length times girth — and
  // sharing by length alone starved the torso, which is most of a body's
  // surface, while a finger bone got the same handful. `weight` stays on top
  // of that as the perceptual multiplier §13 asks for: hands and heads are
  // where a moving body is read from, so they still get more than their area.
  const area = (b) => b.weight * b.length * b.radius * (1 + b.taper) * 0.5;
  const total = bones.reduce((sum, b) => sum + area(b), 0);
  const points = [];
  for (const bone of bones) {
    const share = Math.max(1, Math.round((POINTS * area(bone)) / total));
    // An orthonormal frame around the bone, so "off the bone" means
    // perpendicular to it. The first pass added a random spherical offset in
    // the parent's axes regardless of which way the bone pointed, which for an
    // arm meant scattering along its own length — limbs came out both fatter
    // and shorter than the skeleton says they are.
    const [ax, ay, az] = bone.offset;
    const length = Math.hypot(ax, ay, az);
    const dir = [ax / length, ay / length, az / length];
    const seed = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = normalise(cross(dir, seed));
    const v = cross(dir, u);

    for (let k = 0; k < share && points.length < POINTS; k++) {
      const t = random();
      // The limb's half-width where we are along it. A calf is not an ankle.
      let width = bone.radius * (1 + (bone.taper - 1) * t);
      // A head is an ellipsoid, not a tube with a cap.
      if (bone.bulge) width *= Math.sqrt(Math.max(0.08, 1 - (2 * t - 1) ** 2));

      // THE SURFACE, not the volume. This is what draws the outline: look at a
      // limb and its surface is frontal in the middle and grazing at the edges,
      // so grazing surface packs far more points into the same screen space and
      // the silhouette lights up on its own. Sampling the volume — which is
      // what `cbrt(random)` did — is precisely the distribution that has no
      // edge anywhere. A minority stay inside, which is the sparse scatter a
      // scanned body has under its skin.
      const depth = random() < 0.84 ? 1 : 0.3 + random() * 0.5;
      const radial = (width * depth) / scale;
      const theta = random() * Math.PI * 2;
      const c = Math.cos(theta) * radial;
      const s = Math.sin(theta) * radial;

      points.push({
        joint: bone.joint,
        local: [ax * t + u[0] * c + v[0] * s, ay * t + u[1] * c + v[1] * s, az * t + u[2] * c + v[2] * s],
        region: bone.region,
      });
    }
  }
  // Top up from the head down if rounding left us short: never a partial texture row.
  while (points.length < POINTS) points.push(points[points.length % Math.max(1, points.length)] ?? { joint: 0, local: [0, 0, 0], region: 3 });
  return points.slice(0, POINTS);
}

/* ------------------------------------------------------- the real human skin */

/**
 * §178. Capsules can never give a waist, a shoulder blade or a foot that points
 * somewhere, and those are what carry a silhouette. So when a human mesh is
 * present, the points come off its actual surface instead.
 *
 * The mesh's own skeleton is not needed and it does not have one. All the bake
 * ever stores per point is which bone owns it, where along that bone, and how
 * far off the axis — the capsule was only ever a way of INVENTING those three
 * numbers. Measuring them off a real surface is the same three numbers.
 */

function parseObj(text) {
  const verts = [];
  const tris = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/);
      verts.push([+p[1], +p[2], +p[3]]);
    } else if (line.startsWith('f ')) {
      const ids = line.trim().split(/\s+/).slice(1).map((f) => parseInt(f.split('/')[0], 10) - 1);
      for (let i = 2; i < ids.length; i++) tris.push([ids[0], ids[i - 1], ids[i]]);
    }
  }
  if (verts.length < 100 || tris.length < 100) {
    throw new Error(`OBJ: ${verts.length} vertices and ${tris.length} triangles — this is not a body`);
  }
  return { verts, tris };
}

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);

/** Inverse of a rigid transform: transpose the rotation, undo the translation. */
function inverseRigid(m) {
  const t = [m[3], m[7], m[11]];
  const out = [
    m[0], m[4], m[8], 0,
    m[1], m[5], m[9], 0,
    m[2], m[6], m[10], 0,
    0, 0, 0, 1,
  ];
  out[3] = -(out[0] * t[0] + out[1] * t[1] + out[2] * t[2]);
  out[7] = -(out[4] * t[0] + out[5] * t[1] + out[6] * t[2]);
  out[11] = -(out[8] * t[0] + out[9] * t[1] + out[10] * t[2]);
  return out;
}

/** Shortest distance from p to segment a-b, and where along it. */
function toSegment(p, a, b) {
  const ab = sub3(b, a);
  const l2 = dot3(ab, ab);
  if (l2 < 1e-12) return { d: len3(sub3(p, a)), t: 0 };
  const t = Math.max(0, Math.min(1, dot3(sub3(p, a), ab) / l2));
  return { d: len3(sub3(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t])), t };
}

/**
 * The pose the mesh is bound AGAINST — not the pose it is animated in.
 *
 * Two corrections, both measured rather than guessed:
 *
 * The arms. The mesh stands in A-pose with its arms 47 degrees down and the
 * skeleton's rest pose has them out at 8. Bound naively, an arm vertex is
 * nearer the torso than the arm, and TEN of twenty-seven bones receive not one
 * point — every arm bone among them. So the binding skeleton's arms are swung
 * down to meet the mesh.
 *
 * The legs. Against anthropometric standards the skeleton's hip sits 5.6% of
 * stature too high and its knee 3.6%, which pushes the leg bones up into the
 * mesh's pelvis and makes pelvis skin bind to a leg. Shortening the thigh and
 * shin is enough — everything above the hip then falls into place on its own,
 * because the bake re-floors and re-scales the body afterwards anyway.
 *
 * Both are rigid: the offsets change length but never direction, and the arm
 * swing is a rotation about the shoulder. That matters, because the frame the
 * off-axis offset is measured in is built from the bone's DIRECTION, so it
 * survives both corrections unchanged.
 */
const LIMB_FIT = { LeftLeg: 0.925, RightLeg: 0.925, LeftFoot: 0.83, RightFoot: 0.83 };

function bindingSkeleton(clip, armSwingDegrees) {
  const offsets = clip.joints.map((j) => {
    const k = LIMB_FIT[j.name] ?? 1;
    return [j.offset[0] * k, j.offset[1] * k, j.offset[2] * k];
  });

  const fitted = { ...clip, joints: clip.joints.map((j, i) => ({ ...j, offset: offsets[i] })) };
  const world = poseAt(fitted, 0);

  // Swing each arm subtree down about its own shoulder, in the frontal plane.
  const swing = (armSwingDegrees * Math.PI) / 180;
  for (const [name, side] of [['LeftArm', 1], ['RightArm', -1]]) {
    const start = clip.joints.findIndex((j) => j.name === name);
    if (start < 0) continue;
    const pivot = [world[start][3], world[start][7], world[start][11]];
    const a = swing * side; // mirrored, because +X is the body's left
    const rot = [
      Math.cos(a), -Math.sin(a), 0, 0,
      Math.sin(a), Math.cos(a), 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const move = multiply(translation(pivot[0], pivot[1], pivot[2]), multiply(rot, translation(-pivot[0], -pivot[1], -pivot[2])));
    const walk = (i) => {
      world[i] = multiply(move, world[i]);
      for (const c of clip.joints[i].children) walk(c);
    };
    walk(start);
  }
  return { offsets, world };
}

/** Sample the mesh surface, weighted by triangle area — not by vertex. */
function sampleSurface(mesh, count, random) {
  const cumulative = [];
  let running = 0;
  for (const [i, j, k] of mesh.tris) {
    const e1 = sub3(mesh.verts[j], mesh.verts[i]);
    const e2 = sub3(mesh.verts[k], mesh.verts[i]);
    running += len3([
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ]) / 2;
    cumulative.push(running);
  }
  const out = [];
  for (let n = 0; n < count; n++) {
    const target = random() * running;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const [i, j, k] = mesh.tris[lo];
    let u = random();
    let v = random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const A = mesh.verts[i];
    const B = mesh.verts[j];
    const C = mesh.verts[k];
    out.push([
      A[0] + (B[0] - A[0]) * u + (C[0] - A[0]) * v,
      A[1] + (B[1] - A[1]) * u + (C[1] - A[1]) * v,
      A[2] + (B[2] - A[2]) * u + (C[2] - A[2]) * v,
    ]);
  }
  return out;
}

/** Where the mesh actually holds its arms, so the binding pose can match it. */
function meshArmAngle(mesh, shoulderHeight) {
  let tip = mesh.verts[0];
  for (const v of mesh.verts) if (v[0] > tip[0]) tip = v;
  return (Math.atan2(tip[1] - shoulderHeight, tip[0]) * 180) / Math.PI;
}

function buildBodyFromMesh(clip, mesh) {
  const rest = poseAt(clip, 0);
  const restYs = rest.map((w) => w[7]);
  const low = Math.min(...restYs);
  const stature = Math.max(...restYs) - low;
  const meshHigh = Math.max(...mesh.verts.map((v) => v[1]));
  const k = meshHigh / stature;

  const centreX = (Math.max(...rest.map((w) => w[3])) + Math.min(...rest.map((w) => w[3]))) / 2;
  const centreZ = rest[0][11];
  const shoulder = clip.joints.findIndex((j) => j.name === 'LeftArm');
  const armAngle = meshArmAngle(mesh, (rest[shoulder][7] - low) * k);

  const { offsets, world } = bindingSkeleton(clip, armAngle);
  // Put the binding skeleton in the mesh's own space: same height, same origin.
  const place = (m) => [(m[3] - centreX) * k, (m[7] - low) * k, (m[11] - centreZ) * k];
  const bones = [];
  for (let j = 0; j < clip.joints.length; j++) {
    for (const child of clip.joints[j].children) {
      const offset = offsets[child];
      if (Math.hypot(offset[0], offset[1], offset[2]) < 1e-4) continue;
      bones.push({ joint: j, child, a: place(world[j]), b: place(world[child]), info: classify(clip.joints[child].name) });
    }
  }

  const random = makeRandom(0x5eed);
  // Sample generously, then keep POINTS of them weighted towards the landmarks
  // §13 says a moving body is read from — hands, head — which area alone
  // under-serves.
  const candidates = sampleSurface(mesh, POINTS * 6, random);
  // OWNERSHIP IS NOT NEAREST-BONE. In the A-pose the upper arms hang against
  // the ribs, so a quarter of the chest is physically closer to an arm bone
  // than to the spine — and a chest bound to an arm means a patch of ribcage
  // flying up whenever the dancer raises a hand.
  //
  // Distance divided by how thick that body part is meant to be settles it.
  // Chest skin sits about 0.11 out from a spine of radius 0.092, so 1.2 of a
  // torso; the same point may be 0.05 from an upper arm of radius 0.037, which
  // is 1.35 of an arm — and therefore a worse claim. This is the anatomical
  // table earning its keep a second time: not to build the body, but to decide
  // which limb a piece of skin plausibly belongs to.
  const bound = [];
  for (const sample of candidates) {
    let best = null;
    for (const bone of bones) {
      const hit = toSegment(sample, bone.a, bone.b);
      const score = hit.d / (bone.info.radius * meshHigh);
      if (!best || score < best.score) best = { score, d: hit.d, bone, t: hit.t };
    }
    bound.push({ sample, ...best });
  }

  const chosen = [];
  const totalWeight = bound.reduce((sum, b) => sum + b.bone.info.weight, 0);
  for (const entry of bound) {
    if (chosen.length >= POINTS) break;
    if (random() < (entry.bone.info.weight * POINTS) / totalWeight) chosen.push(entry);
  }
  // Deterministic top-up if the weighted pass came up short.
  for (let i = 0; chosen.length < POINTS; i++) chosen.push(bound[i % bound.length]);

  const points = [];
  for (const entry of chosen.slice(0, POINTS)) {
    const { joint, child } = entry.bone;
    // Into the owning joint's own frame, where the bone is just its offset.
    const local = apply(inverseRigid(world[joint]), [
      entry.sample[0] / k + centreX,
      entry.sample[1] / k + low,
      entry.sample[2] / k + centreZ,
    ]);
    const bind = offsets[child];
    const length = Math.hypot(bind[0], bind[1], bind[2]);
    const dir = [bind[0] / length, bind[1] / length, bind[2] / length];
    const seed = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = normalise(cross(dir, seed));
    const v = cross(dir, u);
    const off = sub3(local, [dir[0] * entry.t * length, dir[1] * entry.t * length, dir[2] * entry.t * length]);

    // Rebuilt against the REAL offset, so the point rides the mocap skeleton's
    // own bone length. The fitted proportions only ever decided OWNERSHIP.
    const real = clip.joints[child].offset;
    const pu = dot3(off, u);
    const pv = dot3(off, v);
    points.push({
      joint,
      local: [
        real[0] * entry.t + u[0] * pu + v[0] * pv,
        real[1] * entry.t + u[1] * pu + v[1] * pv,
        real[2] * entry.t + u[2] * pu + v[2] * pv,
      ],
      region: entry.bone.info.region,
    });
  }
  return points;
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

function bakeClip(path, name, mesh) {
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

  // §178: a real skin when one is available, capsules when it is not.
  const points = mesh ? buildBodyFromMesh(clip, mesh) : buildBody(clip, scale);

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

  // §178: the human skin, if it has been fetched. Without it the bake falls
  // back to capsules, which is a worse body but a working one.
  const meshPath = 'assets/human/makehuman_base_body.obj';
  const mesh = existsSync(meshPath) ? parseObj(readFileSync(meshPath, 'utf8')) : null;
  console.log(mesh ? `skin: ${mesh.tris.length} triangles` : 'skin: none, using capsules');

  const clips = [];
  for (const file of files) {
    const name = file.replace(/\.bvh$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const clip = bakeClip(join(MOCAP_DIR, file), name, mesh);
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

export { parseBvh, poseAt, buildBody, buildBodyFromMesh, parseObj, bindingSkeleton, classify, POINTS, FRAMES };
