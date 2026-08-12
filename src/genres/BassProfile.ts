import type { MusicState } from '../music/MusicState';

/**
 * Drum & Bass attractor — VELOCITY (spec §9.4).
 * Signals: high velocity (low spatiality), transient density, strong sub
 * energy and a fast tempo tendency (~160–180 BPM).
 */
export interface BassProfileWeights {
  velocity: number;
  transients: number;
  subEnergy: number;
  tempo: number;
}

export const BASS_WEIGHTS: BassProfileWeights = {
  velocity: 0.35,
  transients: 0.25,
  subEnergy: 0.2,
  tempo: 0.2,
};

const TEMPO_CENTER = 172;
const TEMPO_HALF_WIDTH = 25;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Fast-tempo bell around 160–180; octave-folded tempos (86 BPM taps) count half. */
export function bassTempoTendency(bpm: number): number {
  if (bpm <= 0) return 0;
  const direct = clamp01(1 - Math.abs(bpm - TEMPO_CENTER) / TEMPO_HALF_WIDTH);
  const folded = clamp01(1 - Math.abs(bpm * 2 - TEMPO_CENTER) / TEMPO_HALF_WIDTH) * 0.5;
  return Math.max(direct, folded);
}

export function scoreBass(music: MusicState, weights: BassProfileWeights = BASS_WEIGHTS): number {
  const velocity = clamp01(1 - music.spatiality); // fast movement = low spatiality
  const score =
    weights.velocity * velocity +
    weights.transients * clamp01(music.transientDensity) +
    weights.subEnergy * clamp01(music.lowEndEnergy) +
    weights.tempo * bassTempoTendency(music.bpm);
  // Velocity is the identity (§9.4): a still player cannot drift into DnB.
  const gate = clamp01(velocity * 2) * clamp01(music.tempoConfidence + music.transientDensity);
  return clamp01(score * gate);
}
