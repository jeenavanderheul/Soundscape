import { BufferAttribute, BufferGeometry, IcosahedronGeometry } from 'three';
import type { Rng } from '../core/rng';
import type { StructureData } from '../world/StructureData';

export type { StructureData };

/**
 * Pure geometry builders for M3 form emergence (§3.1, §3.6, §3.7, §20 M3).
 * Imports three only for BufferGeometry math — no scene or renderer access.
 * Consumes the serializable world contract (StructureData): scale/detailLevel
 * are precomputed from hz by the world side (§3.1 log mapping).
 * Deterministic per data.seed: callers pass createRng(data.seed).
 */

export const STRUCTURE_GEOMETRY_CONFIG = {
  subdivisions: 3,
  /** Low detail → slow rounded undulation (mass); high detail → fine sharp bumps. */
  minNoiseFrequency: 1.5,
  maxNoiseFrequency: 9,
  minDisplacement: 0.05,
  maxDisplacement: 0.35,
  facetSteps: 4,
  /** Blocky vertex-snapping grid as a fraction of scale (§3.7 square). */
  snapFraction: 0.35,
  spikeAmount: 0.9,
  /** Noise-profile per-vertex jitter as a fraction of scale. */
  jitterFraction: 0.12,
  /** Instability jitter: scale × this × (1 - stability) (§3.6). */
  instabilityFraction: 0.25,
  instabilityThreshold: 0.5,
} as const;

export type SurfaceProfile = 'smooth' | 'faceted' | 'blocky' | 'spiked' | 'jittered';

/** §3.7 timbre = matter. Accepts waveform names and world matter names. */
const SURFACE_PROFILES: Record<string, SurfaceProfile> = {
  sine: 'smooth',
  glass: 'smooth',
  liquid: 'smooth',
  triangle: 'faceted',
  faceted: 'faceted',
  square: 'blocky',
  digital: 'blocky',
  blocky: 'blocky',
  saw: 'spiked',
  metallic: 'spiked',
  spiked: 'spiked',
  noise: 'jittered',
  fog: 'jittered',
  dust: 'jittered',
};

export function resolveSurfaceProfile(materialProfile: string): SurfaceProfile {
  return SURFACE_PROFILES[materialProfile] ?? 'smooth';
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

function randomUnitVector(rng: Rng): [number, number, number] {
  // Deterministic, uses exactly two rng draws.
  const theta = rng.next() * Math.PI * 2;
  const z = rng.next() * 2 - 1;
  const r = Math.sqrt(Math.max(1 - z * z, 0));
  return [Math.cos(theta) * r, Math.sin(theta) * r, z];
}

export function buildStructureGeometry(data: StructureData, rng: Rng): BufferGeometry {
  const cfg = STRUCTURE_GEOMETRY_CONFIG;
  const radius = Math.max(data.scale, 0.05);
  const detail = clamp01(data.detailLevel);
  const profile = resolveSurfaceProfile(data.materialProfile);

  // IcosahedronGeometry is non-indexed: duplicated per-face vertices give the
  // flat, thin-line oscilloscope shading the visual grammar wants (§13).
  const geometry: BufferGeometry = new IcosahedronGeometry(radius, cfg.subdivisions);

  // Deterministic two-band harmonic surface field (perceptual, not physical §25.10).
  const noiseFrequency = lerp(cfg.minNoiseFrequency, cfg.maxNoiseFrequency, detail);
  const amplitude = radius * lerp(cfg.minDisplacement, cfg.maxDisplacement, detail);
  const k1 = randomUnitVector(rng);
  const k2 = randomUnitVector(rng);
  const phase1 = rng.next() * Math.PI * 2;
  const phase2 = rng.next() * Math.PI * 2;

  const positions = geometry.getAttribute('position') as BufferAttribute;
  const array = positions.array as Float32Array;

  for (let i = 0; i < array.length; i += 3) {
    const x = array[i]!;
    const y = array[i + 1]!;
    const z = array[i + 2]!;
    const length = Math.hypot(x, y, z) || 1;
    const nx = x / length;
    const ny = y / length;
    const nz = z / length;
    const bump =
      0.5 * Math.sin((nx * k1[0] + ny * k1[1] + nz * k1[2]) * noiseFrequency + phase1) +
      0.5 * Math.sin((nx * k2[0] + ny * k2[1] + nz * k2[2]) * noiseFrequency * 1.7 + phase2);
    const offset = surfaceOffset(profile, bump, amplitude, radius, rng);
    const scale = (length + offset) / length;
    array[i] = x * scale;
    array[i + 1] = y * scale;
    array[i + 2] = z * scale;
  }

  if (profile === 'blocky') snapToGrid(array, radius * cfg.snapFraction);
  applyInstabilityJitter(array, data.stability, radius, rng);

  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function surfaceOffset(
  profile: SurfaceProfile,
  bump: number,
  amplitude: number,
  radius: number,
  rng: Rng,
): number {
  const cfg = STRUCTURE_GEOMETRY_CONFIG;
  switch (profile) {
    case 'smooth':
      return bump * amplitude * 0.6;
    case 'faceted':
      return (Math.round(bump * cfg.facetSteps) / cfg.facetSteps) * amplitude;
    case 'blocky':
      return bump * amplitude * 0.5;
    case 'spiked':
      return bump > 0
        ? bump * bump * bump * (1 + cfg.spikeAmount) * amplitude
        : bump * amplitude * 0.3;
    case 'jittered':
      return bump * amplitude * 0.5 + (rng.next() * 2 - 1) * radius * cfg.jitterFraction;
  }
}

function snapToGrid(array: Float32Array, grid: number): void {
  for (let i = 0; i < array.length; i++) {
    array[i] = Math.round(array[i]! / grid) * grid;
  }
}

/** §3.6: dissonant/unstable form deforms asymmetrically, scaled by (1 - stability). */
function applyInstabilityJitter(
  array: Float32Array,
  stability: number,
  radius: number,
  rng: Rng,
): void {
  const cfg = STRUCTURE_GEOMETRY_CONFIG;
  if (stability >= cfg.instabilityThreshold) return;
  const amplitude = radius * cfg.instabilityFraction * (1 - stability);
  const bias = randomUnitVector(rng);
  for (let i = 0; i < array.length; i += 3) {
    array[i]! += bias[0] * amplitude * 0.6 + (rng.next() * 2 - 1) * amplitude;
    array[i + 1]! += bias[1] * amplitude * 0.6 + (rng.next() * 2 - 1) * amplitude;
    array[i + 2]! += bias[2] * amplitude * 0.6 + (rng.next() * 2 - 1) * amplitude;
  }
}
