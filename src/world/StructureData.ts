import type { Vec3Data, Waveform } from '../player/FrequencyState';

/**
 * Serializable persistent-form data (spec §20 M3, §18): stable resonance became
 * geometry. Pure data only — Three.js meshes live in rendering, never here.
 */
export interface StructureData {
  id: string;
  createdAtMs: number;
  position: Vec3Data;
  sourceResonatorId: string;
  /** The resonance frequency that birthed the structure. */
  hz: number;
  waveform: Waveform;
  /** World-unit size, derived from hz (§3.1: pitch = space and scale). */
  scale: number;
  /** 0..1 geometric fineness, inverse of mass (§3.1). */
  detailLevel: number;
  /** 0..1 from consonance; low stability reads as deformed/unstable (§3.6). */
  stability: number;
  /** 0..1, grows with sustained duration (§3.8: duration = memory). */
  persistence: number;
  /** Seed for reproducible procedural geometry (§25.16). */
  seed: string;
  /** Matter tendency derived from waveform (§3.7: timbre = matter). */
  materialProfile: string;
}

/** §3.1 band range and the mass↔detail scale extremes it maps onto. */
export const HZ_SCALE_RANGE = {
  minHz: 20, // 20–80 Hz → enormous mass
  maxHz: 8000, // 8 kHz+ → air / sparks / shimmer
  maxScale: 40,
  minScale: 0.5,
} as const;

const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1);

/** Normalized log-frequency position within the §3.1 band range, clamped to [0, 1]. */
function logPosition(hz: number): number {
  if (!(hz > 0)) throw new Error(`hz must be positive, got ${hz}`);
  const { minHz, maxHz } = HZ_SCALE_RANGE;
  const clamped = Math.min(Math.max(hz, minHz), maxHz);
  return Math.log2(clamped / minHz) / Math.log2(maxHz / minHz);
}

/**
 * Logarithmic pitch → scale mapping (§3.1): low frequency builds MASS, high
 * frequency builds DETAIL. Monotonically decreasing, clamped at both band ends;
 * equal octave steps shrink the scale by an equal ratio.
 */
export function hzToScale(hz: number): number {
  const { maxScale, minScale } = HZ_SCALE_RANGE;
  return maxScale * (minScale / maxScale) ** logPosition(hz);
}

/** Inverse of mass: 0 at the low band edge, 1 at 8 kHz+, monotonically increasing. */
export function hzToDetail(hz: number): number {
  return logPosition(hz);
}

/** Consonance stabilizes form; dissonance deforms it (§3.6). Clamped, monotonic. */
export function consonanceToStability(consonance: number): number {
  return clamp01(consonance);
}

/** §3.7 timbre → matter table. */
export const WAVEFORM_MATERIALS: Readonly<Record<Waveform, string>> = {
  sine: 'glass',
  triangle: 'faceted',
  square: 'digital',
  saw: 'metallic',
  noise: 'fog',
};

export function materialProfileForWaveform(waveform: Waveform): string {
  return WAVEFORM_MATERIALS[waveform];
}
