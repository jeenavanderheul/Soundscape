import type { MusicState } from '../music/MusicState';

/**
 * Jazz attractor — CONVERSATION / IMPROVISATION (spec §9.3).
 * Signals: syncopation, variation, melodic movement, changing dynamics and
 * lower repetition. Confident playing that refuses to be a machine.
 */
export interface JazzProfileWeights {
  syncopation: number;
  variation: number;
  melody: number;
  looseness: number;
}

export const JAZZ_WEIGHTS: JazzProfileWeights = {
  syncopation: 0.35,
  variation: 0.25,
  melody: 0.25,
  looseness: 0.15,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function scoreJazz(music: MusicState, weights: JazzProfileWeights = JAZZ_WEIGHTS): number {
  // Looseness: pulse exists but repetition stays low — swing, not grid.
  const looseness = clamp01(music.tempoConfidence) * clamp01(1 - music.repetition);
  const score =
    weights.syncopation * clamp01(music.syncopation) +
    weights.variation * clamp01(music.variation) +
    weights.melody * clamp01(music.melodicActivity) +
    weights.looseness * looseness;
  // Conversation requires a pulse to talk against (§9.3): gate on confidence,
  // and syncopation or variation must actually be present.
  const gate = clamp01(music.tempoConfidence * 1.5) * clamp01((music.syncopation + music.variation) * 2);
  return clamp01(score * gate);
}
