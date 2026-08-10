import { createRng } from '../core/rng';

/**
 * §35: ONE height field, evaluated identically on the CPU and the GPU.
 *
 * The landscape is solid — the orb may never pass through it — so the shape
 * the player SEES and the shape the player HITS must be the same shape. That
 * rules out the usual `fract(sin(dot(...)))` hash: GPU sin is approximate, JS
 * sin is exact, and multiplying the difference by 43758 turns a rounding
 * error into completely different terrain.
 *
 * So both sides read the same 256-entry table with integer lattice lookups
 * and the same smoothstep. No trigonometric hashing anywhere.
 */

export const NOISE_TABLE_SIZE = 256;

/** Deterministic per-world noise table, uploaded to the shader as a uniform. */
export function createNoiseTable(seed: string): Float32Array {
  const rng = createRng(`${seed}:terrain`);
  const table = new Float32Array(NOISE_TABLE_SIZE);
  for (let i = 0; i < NOISE_TABLE_SIZE; i++) table[i] = rng.next();
  return table;
}

const lookup = (table: Float32Array, x: number, y: number): number =>
  table[(((x * 57 + y * 131) % NOISE_TABLE_SIZE) + NOISE_TABLE_SIZE) % NOISE_TABLE_SIZE]!;

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Value noise in [0,1]. Must stay identical to `terrainNoise` in the GLSL below. */
export function valueNoise(table: Float32Array, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = lookup(table, ix, iy);
  const b = lookup(table, ix + 1, iy);
  const c = lookup(table, ix, iy + 1);
  const d = lookup(table, ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

export const TERRAIN_FIELD = {
  /** Barely-there breathing of the void. */
  idleAmplitude: 0.18,
  /** Distance from spawn at which relief starts and finishes growing in. */
  reliefStart: 20,
  reliefSpan: 120,
  /** Height of a full-relief region, in world units. */
  reliefHeight: 26,
  /**
   * §35 (user decision): the grid IS the ground, so everything that lifts it
   * must lift the floor with it. These are the amplitudes of the moving part —
   * the bass ridge and the excitation waves — kept modest exactly because they
   * are now solid.
   */
  bassAmplitude: 1.4,
  exciteAmpLow: 4,
  exciteAmpHigh: 1.2,
} as const;

/** One excitation source, in world space, as both shader and collision see it. */
export interface FieldSource {
  x: number;
  z: number;
  /** 0..1 how strongly it is exciting the field. */
  strength: number;
  /** 0..1 pitch: low is a broad slow hill, high a tight fast ripple (§3.1). */
  hzn: number;
}

/**
 * Everything ON TOP of the standing shape: the bass ridge and the excitation
 * waves. Mirrors the loop in the terrain shader exactly — this is what makes
 * the drawn grid and the solid ground the same surface.
 */
export function terrainMotion(
  x: number,
  z: number,
  timeSeconds: number,
  bass: number,
  pulse: number,
  sources: readonly FieldSource[],
): number {
  let h =
    bass *
    TERRAIN_FIELD.bassAmplitude *
    Math.sin(x * 0.028 + timeSeconds * 0.55) *
    Math.cos(z * 0.021 - timeSeconds * 0.4);
  for (const source of sources) {
    const dx = x - source.x;
    const dz = z - source.z;
    const d = Math.hypot(dx, dz);
    const radius = 46 + (14 - 46) * source.hzn;
    const k = 0.12 + (0.85 - 0.12) * source.hzn;
    const speed = 0.6 + (2.4 - 0.6) * source.hzn;
    const envelope = Math.exp(-(d * d) / (radius * radius)) * source.strength;
    const wave = Math.sin(d * k - timeSeconds * speed) * 0.5 + 0.72;
    const amp =
      TERRAIN_FIELD.exciteAmpLow +
      (TERRAIN_FIELD.exciteAmpHigh - TERRAIN_FIELD.exciteAmpLow) * source.hzn;
    h += envelope * wave * amp * (1 + pulse * 0.35);
  }
  return h;
}

/**
 * Landscape height above the terrain plane at a world position.
 *
 * The STANDING shape: the idle ripple and the region's relief. What moves on
 * top of it lives in `terrainMotion` — and since the grid is solid (§35, user
 * decision), the collision adds both together.
 */
export function terrainHeight(
  table: Float32Array,
  x: number,
  z: number,
  timeSeconds: number,
  relief: number,
): number {
  const idle =
    TERRAIN_FIELD.idleAmplitude *
    Math.sin(x * 0.045 + timeSeconds * 0.35) *
    Math.sin(z * 0.06 + timeSeconds * 0.22);
  const fromSpawn = Math.min(
    1,
    Math.max(0, (Math.hypot(x, z) - TERRAIN_FIELD.reliefStart) / TERRAIN_FIELD.reliefSpan),
  );
  const ridge =
    valueNoise(table, x * 0.012, z * 0.012) * 0.75 + valueNoise(table, x * 0.034, z * 0.034) * 0.25;
  return idle + Math.pow(ridge, 1.6) * relief * fromSpawn * TERRAIN_FIELD.reliefHeight;
}

/**
 * The same field as GLSL, injected into the terrain shader. Any change here
 * must be mirrored in `terrainHeight` above — that is the whole point of
 * keeping them in one file.
 */
export const TERRAIN_FIELD_GLSL = /* glsl */ `
uniform float uNoise[${NOISE_TABLE_SIZE}];

float noiseLookup(int x, int y) {
  int i = int(mod(float(x) * 57.0 + float(y) * 131.0, ${NOISE_TABLE_SIZE}.0));
  if (i < 0) i += ${NOISE_TABLE_SIZE};
  return uNoise[i];
}

float terrainNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  int ix = int(i.x);
  int iy = int(i.y);
  float a = noiseLookup(ix, iy);
  float b = noiseLookup(ix + 1, iy);
  float c = noiseLookup(ix, iy + 1);
  float d = noiseLookup(ix + 1, iy + 1);
  return (a + (b - a) * u.x) * (1.0 - u.y) + (c + (d - c) * u.x) * u.y;
}

float terrainRelief(vec2 world, float relief) {
  float fromSpawn = clamp(
    (length(world) - ${TERRAIN_FIELD.reliefStart.toFixed(1)}) / ${TERRAIN_FIELD.reliefSpan.toFixed(1)},
    0.0, 1.0);
  float ridge = terrainNoise(world * 0.012) * 0.75 + terrainNoise(world * 0.034) * 0.25;
  return pow(ridge, 1.6) * relief * fromSpawn * ${TERRAIN_FIELD.reliefHeight.toFixed(1)};
}
`;
