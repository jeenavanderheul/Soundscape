import type { MusicState } from '../music/MusicState';

/**
 * Ambient attractor — SPACE (spec §9.2).
 * Signals: long duration, high spatiality, slow interaction, low transient
 * density, sparse rhythm and soft sustained timbre. The inverse pole of the
 * Techno attractor: stillness and sustain instead of pulse and repetition.
 */
export interface AmbientProfileWeights {
  duration: number;
  spatiality: number;
  stillness: number;
  softTimbre: number;
  sustain: number;
}

export const AMBIENT_WEIGHTS: AmbientProfileWeights = {
  duration: 0.3,
  spatiality: 0.2,
  stillness: 0.2,
  softTimbre: 0.15,
  sustain: 0.15,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function scoreAmbient(
  music: MusicState,
  weights: AmbientProfileWeights = AMBIENT_WEIGHTS,
): number {
  // Stillness: absence of transients and rhythmic pulse (§9.2 "slow interaction").
  const stillness = clamp01(1 - music.transientDensity) * clamp01(1 - music.repetition);
  const softTimbre = clamp01(1 - music.timbreBrightness);
  // Sustain: sound is present but unhurried — dynamics held, not spiked.
  const sustain = clamp01(music.dynamics) * clamp01(1 - music.transientDensity);
  const score =
    weights.duration * clamp01(music.durationAverage) +
    weights.spatiality * clamp01(music.spatiality) +
    weights.stillness * stillness +
    weights.softTimbre * softTimbre +
    weights.sustain * sustain;
  // Duration is the identity of the attractor: without sustained sound there
  // is no ambient tendency, only silence (§3.8, §9.2).
  const durationGate = clamp01(music.durationAverage * 2 + music.dynamics * 0.5);
  return clamp01(score * durationGate);
}
