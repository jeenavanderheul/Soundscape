import { BufferAttribute, BufferGeometry, Points, ShaderMaterial } from 'three';
import { createRng } from '../core/rng';
import type { FrequencyState } from '../player/FrequencyState';
import { createWindParticleMaterial } from './Materials';

/**
 * Wind particles representing the player-as-wind (spec §13, M1).
 * One THREE.Points; buffer attributes are mutated in place (GPU buffers
 * are runtime objects, not store data). Positions live in world space in
 * a cube around the player and wrap when the player moves past them.
 */

export type ParticleSnapshot = Readonly<
  Pick<FrequencyState, 'position' | 'direction' | 'velocity' | 'amplitude' | 'hz'>
>;

export const PARTICLE_CONFIG = {
  count: 2000,
  radius: 40,
  minPointSize: 0.8,
  maxPointSize: 4,
  minHz: 20,
  maxHz: 16000,
  minBrightness: 0.06,
  maxBrightness: 0.5,
  driftSpeed: 0.6,
  followFactor: 0.35,
} as const;

// Deterministic initial distribution: uniform cube around the origin.
export function seedParticlePositions(count: number, radius: number, seed: string): Float32Array {
  const rng = createRng(seed);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < positions.length; i++) {
    positions[i] = (rng.next() * 2 - 1) * radius;
  }
  return positions;
}

// §3.1: low frequency = mass, high frequency = detail → higher hz, finer points.
// Logarithmic mapping, clamped to the configured hz range.
export function hzToPointSize(hz: number): number {
  const { minHz, maxHz, minPointSize, maxPointSize } = PARTICLE_CONFIG;
  const clamped = Math.min(Math.max(hz, minHz), maxHz);
  const t = Math.log(clamped / minHz) / Math.log(maxHz / minHz);
  return Math.max(minPointSize, maxPointSize - t * (maxPointSize - minPointSize));
}

// §3.2: amplitude = force → brighter/denser feel. Never fully dark, capped at 1.
export function amplitudeToBrightness(amplitude: number): number {
  const { minBrightness, maxBrightness } = PARTICLE_CONFIG;
  const t = Math.min(Math.max(amplitude, 0), 1);
  return minBrightness + t * (maxBrightness - minBrightness);
}

// Wraps one coordinate into the [center - radius, center + radius] band.
export function wrapAxis(value: number, center: number, radius: number): number {
  const delta = value - center;
  if (delta > radius) return value - 2 * radius;
  if (delta < -radius) return value + 2 * radius;
  return value;
}

export class ParticleSystem {
  readonly points: Points;
  private readonly geometry: BufferGeometry;
  private readonly material: ShaderMaterial;
  private readonly positionAttribute: BufferAttribute;
  private readonly drift: Float32Array;
  private pulse = 0;

  /** Beat/onset modulation from BeatSync — already depth-capped (§23). */
  setPulse(value: number): void {
    this.pulse = value;
  }

  constructor(seed = 'frequency-wind') {
    const { count, radius } = PARTICLE_CONFIG;
    const positions = seedParticlePositions(count, radius, seed);
    // Per-particle constants from the same seeded stream: drift vector + size/grey seed.
    const rng = createRng(`${seed}:variance`);
    this.drift = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.drift[i * 3] = rng.next() * 2 - 1;
      this.drift[i * 3 + 1] = rng.next() * 2 - 1;
      this.drift[i * 3 + 2] = rng.next() * 2 - 1;
      seeds[i] = rng.next();
    }

    this.geometry = new BufferGeometry();
    this.positionAttribute = new BufferAttribute(positions, 3);
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));

    this.material = createWindParticleMaterial();
    this.points = new Points(this.geometry, this.material);
    // Particles surround the camera; never let frustum culling drop the cloud.
    this.points.frustumCulled = false;
  }

  update(snapshot: ParticleSnapshot, dt: number): void {
    const { radius, driftSpeed, followFactor } = PARTICLE_CONFIG;
    const { position, direction, velocity } = snapshot;
    // Wind streams past the player: slow ambient drift plus counter-motion
    // along the player's heading so speed reads as flow.
    const flowX = -direction.x * velocity * followFactor * dt;
    const flowY = -direction.y * velocity * followFactor * dt;
    const flowZ = -direction.z * velocity * followFactor * dt;
    const step = driftSpeed * dt;

    const positions = this.positionAttribute.array as Float32Array;
    const drift = this.drift;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = wrapAxis(positions[i]! + drift[i]! * step + flowX, position.x, radius);
      positions[i + 1] = wrapAxis(
        positions[i + 1]! + drift[i + 1]! * step + flowY,
        position.y,
        radius,
      );
      positions[i + 2] = wrapAxis(
        positions[i + 2]! + drift[i + 2]! * step + flowZ,
        position.z,
        radius,
      );
    }
    this.positionAttribute.needsUpdate = true;

    // §29.6: hats live in the particles — a fast shimmer once unlocked.
    this.sparklePhase += dt * 26;
    const sparkle = this.sparkle ? 1 + Math.sin(this.sparklePhase) * 0.3 : 1;
    this.material.uniforms.uSize!.value =
      hzToPointSize(snapshot.hz) * sparkle * (1 + this.growth * 0.4);
    this.material.uniforms.uBrightness!.value =
      amplitudeToBrightness(snapshot.amplitude) *
      (1 + this.pulse) *
      (this.sparkle ? 1.25 : 1) *
      (1 + this.growth * 0.6);
  }

  private sparkle = false;
  private sparklePhase = 0;
  private growth = 0;

  /** §29.6: a fuller track thickens the cloud the player flies through. */
  setGrowth(value: number): void {
    this.growth = Math.min(1, Math.max(0, value));
  }

  /** "Those particles are my hats" (§29.6). */
  setSparkle(on: boolean): void {
    this.sparkle = on;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
