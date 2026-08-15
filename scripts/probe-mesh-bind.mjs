/**
 * §178 PROEF — kan een echt mensmesh op het CMU-skelet gebonden worden?
 *
 * Meet, bouwt niets. Antwoord moet een getal zijn: hoe ver ligt een
 * oppervlaktepunt gemiddeld van het bot waaraan het gebonden wordt, uitgedrukt
 * in lichaamslengte. Ligt dat in de orde van een ledemaatstraal (~0,03-0,10)
 * dan werkt de binding; ligt het in de orde van een lichaamsdeel dan niet.
 */
import { readFileSync } from 'node:fs';
import { parseBvh, poseAt, classify } from '/Users/jeenavanderheul/Documents/00_AI-APPS/Soundscape/scripts/bake-mocap.mjs';

const ROOT = '/Users/jeenavanderheul/Documents/00_AI-APPS/Soundscape';

function parseObj(text) {
  const verts = [];
  const tris = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.split(/\s+/);
      verts.push([+x, +y, +z]);
    } else if (line.startsWith('f ')) {
      const ids = line.trim().split(/\s+/).slice(1).map((f) => parseInt(f.split('/')[0], 10) - 1);
      for (let i = 2; i < ids.length; i++) tris.push([ids[0], ids[i - 1], ids[i]]);
    }
  }
  return { verts, tris };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

/** Kleinste afstand van punt p tot lijnstuk a-b, plus waar langs (0..1). */
function toSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return { d: len(sub(p, a)), t: 0 };
  let t = dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  const near = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  return { d: len(sub(p, near)), t };
}

const mesh = parseObj(readFileSync(`${ROOT}/assets/human/makehuman_base_body.obj`, 'utf8'));
const clip = parseBvh(readFileSync(`${ROOT}/assets/mocap/143_35.bvh`, 'utf8'));
const pose = poseAt(clip, 0);

// Skelet naar dezelfde schaal en stand als het mesh.
const ys = pose.map((w) => w[7]);
const skelLow = Math.min(...ys);
const skelHigh = Math.max(...ys);
const meshHigh = Math.max(...mesh.verts.map((v) => v[1]));
const k = meshHigh / (skelHigh - skelLow);
const cx = (Math.max(...pose.map((w) => w[3])) + Math.min(...pose.map((w) => w[3]))) / 2;
const cz = pose[0][11];
const joint = (i) => [(pose[i][3] - cx) * k, (pose[i][7] - skelLow) * k, (pose[i][11] - cz) * k];

// Armhoek van het mesh: schouderhoogte versus de verste vingertop.
const shoulderY = joint(clip.joints.findIndex((j) => j.name === 'LeftArm'))[1];
let tip = mesh.verts[0];
for (const v of mesh.verts) if (v[0] > tip[0]) tip = v;
const meshArm = (Math.atan2(tip[1] - shoulderY, tip[0]) * 180) / Math.PI;
console.log(`mesh hoogte ${meshHigh.toFixed(3)} m · skelet geschaald met ${k.toFixed(4)}`);
console.log(`mesh armhoek ${meshArm.toFixed(1)}°  (skelet staat op -8°, T-pose = 0°)`);

// DE ARMEN IN DE A-POSE ZETTEN. Zonder dit ligt een armvertex dichter bij de
// romp dan bij de arm, en krijgt geen enkel armbot ook maar één punt.
const armRoots = { LeftArm: 1, RightArm: -1 };
const swing = ((meshArm - -8) * Math.PI) / 180; // hoe ver de arm omlaag moet
const subtree = (name) => {
  const start = clip.joints.findIndex((j) => j.name === name);
  const out = [];
  const walk = (i) => { out.push(i); for (const c of clip.joints[i].children) walk(c); };
  walk(start);
  return { start, out };
};
const posed = clip.joints.map((_, i) => joint(i));
for (const [name, side] of Object.entries(armRoots)) {
  const { start, out } = subtree(name);
  const pivot = posed[start];
  const a = swing * side; // gespiegeld, want +X is links
  const cs = Math.cos(a), sn = Math.sin(a);
  for (const i of out) {
    const dx = posed[i][0] - pivot[0], dy = posed[i][1] - pivot[1];
    posed[i] = [pivot[0] + dx * cs - dy * sn, pivot[1] + dx * sn + dy * cs, posed[i][2]];
  }
}

// Botsegmenten in wereldruimte.
const bones = [];
for (let j = 0; j < clip.joints.length; j++) {
  for (const child of clip.joints[j].children) {
    const a = posed[j];
    const b = posed[child];
    if (len(sub(b, a)) < 1e-4) continue;
    bones.push({ a, b, name: clip.joints[child].name, info: classify(clip.joints[child].name) });
  }
}

// Bemonster het OPPERVLAK, gewogen op driehoeksoppervlak — anders domineert de
// dichte geometrie van het gezicht de meting terwijl het weinig huid is.
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const areas = mesh.tris.map(([i, j2, k2]) => {
  const e1 = sub(mesh.verts[j2], mesh.verts[i]), e2 = sub(mesh.verts[k2], mesh.verts[i]);
  const c = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]];
  return len(c) / 2;
});
const cum = []; let run = 0;
for (const a of areas) { run += a; cum.push(run); }
const samples = [];
for (let n = 0; n < 20000; n++) {
  const target = rnd() * run;
  let lo2 = 0, hi2 = cum.length - 1;
  while (lo2 < hi2) { const mid = (lo2 + hi2) >> 1; if (cum[mid] < target) lo2 = mid + 1; else hi2 = mid; }
  const [i, j2, k2] = mesh.tris[lo2];
  let u = rnd(), v2 = rnd();
  if (u + v2 > 1) { u = 1 - u; v2 = 1 - v2; }
  const A = mesh.verts[i], B = mesh.verts[j2], C = mesh.verts[k2];
  samples.push([A[0]+(B[0]-A[0])*u+(C[0]-A[0])*v2, A[1]+(B[1]-A[1])*u+(C[1]-A[1])*v2, A[2]+(B[2]-A[2])*u+(C[2]-A[2])*v2]);
}

const dists = [];
const perBone = new Map();
for (const v of samples) {
  let best = null;
  for (const bone of bones) {
    const hit = toSegment(v, bone.a, bone.b);
    if (!best || hit.d < best.d) best = { d: hit.d, bone };
  }
  dists.push(best.d / meshHigh);
  perBone.set(best.bone.name, (perBone.get(best.bone.name) ?? 0) + 1);
}
dists.sort((a, b) => a - b);
const mean = dists.reduce((s, d) => s + d, 0) / dists.length;

console.log(`\n${samples.length} oppervlaktemonsters uit ${mesh.tris.length} driehoeken`);
console.log('afstand tot toegewezen bot, in lichaamslengtes:');
console.log(`  mediaan ${dists[Math.floor(dists.length / 2)].toFixed(4)}`);
console.log(`  gemiddeld ${mean.toFixed(4)}`);
console.log(`  p95 ${dists[Math.floor(dists.length * 0.95)].toFixed(4)}`);
console.log(`  slechtste ${dists[dists.length - 1].toFixed(4)}`);
console.log('  (ledemaatstraal is 0,026-0,092 — daar hoort dit in te liggen)');

const ranked = [...perBone.entries()].sort((a, b) => b[1] - a[1]);
console.log('\nvertices per bot, top 12:');
for (const [name, n] of ranked.slice(0, 12)) {
  console.log(`  ${name.padEnd(20)} ${String(n).padStart(5)}  ${((n / samples.length) * 100).toFixed(1)}%`);
}
console.log(`botten zonder enkel vertex: ${bones.length - perBone.size} van ${bones.length}`);

// Waar zit de resterende misfit? Per bot de gemiddelde afstand tegen de straal
// die we voor dat bot aannemen. Ratio ~1 = het mesh past om het bot heen.
const stat = new Map();
for (const v of samples) {
  let best = null;
  for (const bone of bones) {
    const hit = toSegment(v, bone.a, bone.b);
    if (!best || hit.d < best.d) best = { d: hit.d, bone };
  }
  const e = stat.get(best.bone.name) ?? { n: 0, sum: 0, r: best.bone.info.radius };
  e.n += 1; e.sum += best.d / meshHigh;
  stat.set(best.bone.name, e);
}
console.log('\nbot                  n     afstand  aangenomen straal  ratio');
for (const [name, e] of [...stat.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 14)) {
  const d = e.sum / e.n;
  console.log(`  ${name.padEnd(18)} ${String(e.n).padStart(5)}  ${d.toFixed(4)}   ${e.r.toFixed(3)}   ${(d / e.r).toFixed(2)}x`);
}
console.log('\nlege botten:', bones.filter((b) => !stat.has(b.name)).map((b) => b.name).join(' · '));
