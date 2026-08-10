import type { MusicState } from '../music/MusicState';

/**
 * Experimental attractor — MUTATION (spec §9.5).
 * Signals: conflicting genre affinities, dissonance, high variation and
 * unexpected timbre (noise). Unlike the other profiles it also reads the
 * other attractors: conflict itself is the signal.
 */
export interface ExperimentalProfileWeights {
  conflict: number;
  dissonance: number;
  variation: number;
  noise: number;
}

export const EXPERIMENTAL_WEIGHTS: ExperimentalProfileWeights = {
  conflict: 0.3,
  dissonance: 0.3,
  variation: 0.2,
  noise: 0.2,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Conflict: how strongly multiple genres pull at once (second-highest affinity). */
/** The behavioural attractors that can conflict — not every grammar scores
 * from behaviour (§34), so this takes whatever scores exist. */
export function affinityConflict(others: Readonly<Record<string, number>>): number {
  const values = Object.values(others).sort((a, b) => b - a);
  return clamp01((values[1] ?? 0) * 2);
}

export function scoreExperimental(
  music: MusicState,
  others: Readonly<Record<string, number>>,
  weights: ExperimentalProfileWeights = EXPERIMENTAL_WEIGHTS,
): number {
  const score =
    weights.conflict * affinityConflict(others) +
    weights.dissonance * clamp01(music.dissonance) +
    weights.variation * clamp01(music.variation) +
    weights.noise * clamp01(music.timbreNoise);
  // Mutation needs material to mutate (§9.5): something must already sound.
  const gate = clamp01(music.dynamics * 2 + music.dissonance + music.timbreNoise);
  return clamp01(score * gate);
}
