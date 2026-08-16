import type { MusicState } from '../music/MusicState';

/**
 * LOCKED GROOVE attractor — REPETITION (spec §9.1).
 * Signals: high repetition, stable pulse, strong low end, synthetic timbre,
 * medium/high texture and a soft 120–145 BPM tendency. BPM alone never
 * determines genre: the tempo term is a bounded bonus, not a gate.
 */
export interface LockedGrooveProfileWeights {
  repetition: number;
  pulse: number;
  lowEnd: number;
  synthetic: number;
  texture: number;
  tempo: number;
}

export const LOCKED_GROOVE_WEIGHTS: LockedGrooveProfileWeights = {
  repetition: 0.3,
  pulse: 0.25,
  lowEnd: 0.15,
  synthetic: 0.1,
  texture: 0.1,
  tempo: 0.1,
};

const TEMPO_CENTER = 132.5;
const TEMPO_HALF_WIDTH = 30;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Soft bell around 120–145 BPM; 0 when no tempo is established. */
export function tempoTendency(bpm: number): number {
  if (bpm <= 0) return 0;
  return clamp01(1 - Math.abs(bpm - TEMPO_CENTER) / TEMPO_HALF_WIDTH);
}

export function scoreLockedGroove(
  music: MusicState,
  weights: LockedGrooveProfileWeights = LOCKED_GROOVE_WEIGHTS,
): number {
  // Synthetic timbre: bright or noisy electronic character (square/saw lean).
  const synthetic = clamp01(0.6 * music.timbreBrightness + 0.4 * music.timbreNoise);
  const score =
    weights.repetition * clamp01(music.repetition) +
    weights.pulse * clamp01(music.tempoConfidence * music.rhythmicRegularity) +
    weights.lowEnd * clamp01(music.lowEndEnergy) +
    weights.synthetic * synthetic +
    weights.texture * clamp01(music.textureDensity) +
    weights.tempo * tempoTendency(music.bpm);
  // Repetition is the identity of the attractor: without a repeating pulse
  // the other signals cannot carry the genre (§9.1).
  const repetitionGate = clamp01(music.repetition * 2);
  return clamp01(score * repetitionGate);
}
