import type { Waveform } from '../player/FrequencyState';

/** Spec §8: how a wave interaction reads musically and physically. */
export type ResonanceClass =
  | 'harmonic'
  | 'dissonant'
  | 'amplification'
  | 'cancellation'
  | 'complex';

/**
 * Spec §8 + P5: the ONE shared immutable event that drives both audio and
 * visual/world responses. Serializable primitives only.
 */
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

export type ResonanceEventFields = Omit<ResonanceEvent, 'id'>;

/**
 * Deterministic sequential id source. Pure logic never calls Date.now or
 * Math.random; timestamps arrive via `atMs`, identity via this counter.
 */
export function createEventIdCounter(prefix = 'resonance'): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

/** Builds a frozen ResonanceEvent; the input object is copied, never aliased. */
export function createResonanceEvent(
  fields: ResonanceEventFields,
  nextId: () => string,
): ResonanceEvent {
  return Object.freeze({ id: nextId(), ...fields });
}
