import type { Vec3Data, Waveform } from '../player/FrequencyState';

/**
 * Pure interference math (spec §8, P5): turns one immutable ResonanceEvent
 * plus the two wave sources into a compact serializable descriptor that the
 * rendering layer draws. No Three.js, no side effects, deterministic.
 * Perceptually believable, not acoustically accurate (spec §25.10).
 */

export type ResonanceClass = 'harmonic' | 'dissonant' | 'amplification' | 'cancellation' | 'complex';

/** Structural mirror of spec §8 ResonanceEvent; compatible with resonance/ResonanceEvent.ts. */
export interface ResonanceEvent {
  id: string;
  atMs: number;
  sourceId: string;
  targetId: string;
  sourceHz: number;
  targetHz: number;
  ratio: number;
  consonance: number;
  dissonance: number;
  amplitude: number;
  velocity: number;
  phaseDifference: number;
  sourceWaveform: Waveform;
  targetWaveform: Waveform;
  strength: number;
  persistence: number;
  classification: ResonanceClass;
}

export interface WaveSource {
  position: Vec3Data;
  hz: number;
  amplitude: number;
  phase: number;
}

/** Serializable-only description of one interference pattern. */
export interface InterferenceDescriptor {
  id: string;
  atMs: number;
  center: Vec3Data;
  /** Unit vector from source toward target. */
  axis: Vec3Data;
  /** Distance between the two sources, world units. */
  extent: number;
  /** Radial distance between consecutive rings (wavelength relation). */
  ringSpacing: number;
  ringCount: number;
  /** Overall brightness/presence, from event strength, 0..1. */
  intensity: number;
  /** 1 = perfectly regular rings (consonant), 0 = fully warped (dissonant). */
  coherence: number;
  /** Irregularity amount, from dissonance, 0..1. */
  warp: number;
  /** Visible beating: slow radial wobble rate, capped against strobing (§23). */
  beatWobbleHz: number;
  decaySeconds: number;
  classification: ResonanceClass;
  /** Seed for deterministic per-vertex jitter in the renderer. */
  seed: string;
}

export const INTERFERENCE_CONFIG = {
  /** Perceptual "speed of sound" in world units/s for the wavelength relation. */
  waveSpeed: 340,
  minSpacing: 0.4,
  maxSpacing: 8,
  ringCount: 6,
  /** persistence 0..1 → decay seconds within this range. */
  minDecaySeconds: 1.2,
  maxDecaySeconds: 7,
  /** Beating shown as slow spatial wobble, never fast luminance change (§23). */
  maxBeatWobbleHz: 3,
} as const;

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** Ring spacing from the mean wavelength of the two sources, clamped to legible bounds. */
export function ringSpacingForHz(hzA: number, hzB: number): number {
  const { waveSpeed, minSpacing, maxSpacing } = INTERFERENCE_CONFIG;
  const meanHz = Math.max((hzA + hzB) / 2, 1);
  return Math.min(Math.max(waveSpeed / meanHz, minSpacing), maxSpacing);
}

/** Exponential decay envelope: 1 at t=0, strictly decreasing, asymptotically 0. */
export function envelopeAt(decaySeconds: number, tSeconds: number): number {
  return Math.exp(-Math.max(tSeconds, 0) / Math.max(decaySeconds, 0.001));
}

export function computeInterference(
  source: WaveSource,
  target: WaveSource,
  event: ResonanceEvent,
): InterferenceDescriptor {
  const dx = target.position.x - source.position.x;
  const dy = target.position.y - source.position.y;
  const dz = target.position.z - source.position.z;
  const extent = Math.hypot(dx, dy, dz);
  // Coincident sources: fall back to a stable up axis rather than NaN.
  const axis: Vec3Data =
    extent > 1e-6
      ? { x: dx / extent, y: dy / extent, z: dz / extent }
      : { x: 0, y: 1, z: 0 };

  const persistence = clamp01(event.persistence);
  const { minDecaySeconds, maxDecaySeconds, maxBeatWobbleHz, ringCount } = INTERFERENCE_CONFIG;
  const beatHz = Math.abs(source.hz - target.hz);

  return {
    id: event.id,
    atMs: event.atMs,
    center: {
      x: (source.position.x + target.position.x) / 2,
      y: (source.position.y + target.position.y) / 2,
      z: (source.position.z + target.position.z) / 2,
    },
    axis,
    extent,
    ringSpacing: ringSpacingForHz(source.hz, target.hz),
    ringCount,
    intensity: clamp01(event.strength),
    coherence: clamp01(event.consonance),
    warp: clamp01(event.dissonance),
    beatWobbleHz: Math.min(beatHz, maxBeatWobbleHz),
    decaySeconds: minDecaySeconds + persistence * (maxDecaySeconds - minDecaySeconds),
    classification: event.classification,
    seed: `interference:${event.id}`,
  };
}
