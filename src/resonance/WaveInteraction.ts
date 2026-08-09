import type { ResonanceClass } from './ResonanceEvent';

// Pure wave-interaction math (spec §8, §25.10): simplified, perceptually
// believable models — not scientific acoustic simulation.

const TAU = Math.PI * 2;

const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1);

/**
 * Simple just-intonation targets within one octave with a consonance weight
 * each (simplified perceptual model, spec §5 table). Octave reduction folds
 * 1/1 and 2/1 onto the same target.
 */
const CONSONANT_RATIOS: ReadonlyArray<{ ratio: number; weight: number }> = [
  { ratio: 1 / 1, weight: 1.0 },
  { ratio: 3 / 2, weight: 0.92 },
  { ratio: 4 / 3, weight: 0.85 },
  { ratio: 5 / 3, weight: 0.78 },
  { ratio: 5 / 4, weight: 0.75 },
  { ratio: 8 / 5, weight: 0.7 },
  { ratio: 6 / 5, weight: 0.68 },
];

/** Gaussian tolerance falloff width around each target ratio, in cents. */
export const CONSONANCE_TOLERANCE_CENTS = 35;

/** |Δf| range that produces audible beating/roughness (§3.6, simplified). */
export const BEATING_BAND = { minHz: 2, maxHz: 30 } as const;

/** Relative weights of ratio-dissonance vs beating roughness in the score. */
export const DISSONANCE_WEIGHTS = { ratio: 0.7, roughness: 0.6 } as const;

export const CLASSIFY_THRESHOLDS = {
  /** Below this |Δf| the waves are effectively coincident: phase decides. */
  coincidentMaxDeltaHz: BEATING_BAND.minHz,
  harmonicMinConsonance: 0.55,
  dissonantMinDissonance: 0.55,
} as const;

/** Octave-reduced frequency ratio, order-independent, in [1, 2). */
export function frequencyRatio(a: number, b: number): number {
  if (!(a > 0) || !(b > 0)) {
    throw new Error(`frequencyRatio requires positive frequencies, got ${a}, ${b}`);
  }
  let ratio = a >= b ? a / b : b / a;
  while (ratio >= 2) ratio /= 2;
  return ratio;
}

/**
 * Proximity to the nearest simple ratio, weighted by that ratio's consonance
 * and falling off as a Gaussian over cents distance. Returns [0, 1].
 */
export function consonanceScore(ratio: number): number {
  let best = 0;
  for (const { ratio: target, weight } of CONSONANT_RATIOS) {
    const cents = 1200 * Math.log2(ratio / target);
    const score = weight * Math.exp(-((cents / CONSONANCE_TOLERANCE_CENTS) ** 2));
    if (score > best) best = score;
  }
  // The octave (ratio → 2) folds back to unison after octave reduction, but a
  // ratio just below 2 is also near-unison: measure against 2/1 explicitly.
  const centsToOctave = 1200 * Math.log2(ratio / 2);
  const octaveScore = Math.exp(-((centsToOctave / CONSONANCE_TOLERANCE_CENTS) ** 2));
  return clamp01(Math.max(best, octaveScore));
}

/**
 * Roughness bump inside the beating band: zero outside [2, 30] Hz, peaking
 * mid-band (simplified parabola — perceptually believable, not Plomp-Levelt).
 */
export function beatingRoughness(deltaHz: number): number {
  const d = Math.abs(deltaHz);
  const { minHz, maxHz } = BEATING_BAND;
  if (d <= minHz || d >= maxHz) return 0;
  const t = (d - minHz) / (maxHz - minHz);
  return 4 * t * (1 - t);
}

/**
 * Combined dissonance: distance from simple ratios plus beating roughness
 * when |Δf| lies in the beating band. Dissonance is material, not failure.
 */
export function dissonanceScore(aHz: number, bHz: number): number {
  const ratioDissonance = 1 - consonanceScore(frequencyRatio(aHz, bHz));
  const roughness = beatingRoughness(aHz - bHz);
  return clamp01(
    ratioDissonance * DISSONANCE_WEIGHTS.ratio + roughness * DISSONANCE_WEIGHTS.roughness,
  );
}

/** Phase difference wrapped into [0, 2π). */
export function phaseDifference(phaseA: number, phaseB: number): number {
  const d = (phaseA - phaseB) % TAU;
  return d < 0 ? d + TAU : d;
}

export interface WavePair {
  source: number;
  target: number;
}

/**
 * Interaction strength in [0, 1]: quadratic proximity falloff inside the
 * combined wave radius, coupled by the geometric mean of both amplitudes.
 * Zero at or beyond range, and zero when either wave is silent.
 */
export function interactionStrength(
  distance: number,
  radii: WavePair,
  amplitudes: WavePair,
): number {
  const range = radii.source + radii.target;
  if (range <= 0 || distance >= range) return 0;
  const proximity = 1 - distance / range;
  const coupling = Math.sqrt(clamp01(amplitudes.source) * clamp01(amplitudes.target));
  return clamp01(proximity * proximity * coupling);
}

export interface ClassifyInput {
  deltaHz: number;
  phaseDifference: number;
  consonance: number;
  dissonance: number;
}

/**
 * §8 classification. Order matters and is intentional:
 * 1. |Δf| below the beating band → the waves are effectively one frequency,
 *    so phase decides: in-phase halves → amplification, anti-phase → cancellation;
 * 2. consonance ≥ harmonicMinConsonance → harmonic;
 * 3. dissonance ≥ dissonantMinDissonance → dissonant;
 * 4. everything in between → complex.
 */
export function classify(input: ClassifyInput): ResonanceClass {
  const { coincidentMaxDeltaHz, harmonicMinConsonance, dissonantMinDissonance } =
    CLASSIFY_THRESHOLDS;
  if (Math.abs(input.deltaHz) < coincidentMaxDeltaHz) {
    const phase = phaseDifference(input.phaseDifference, 0);
    const antiPhase = phase > Math.PI / 2 && phase < (3 * Math.PI) / 2;
    return antiPhase ? 'cancellation' : 'amplification';
  }
  if (input.consonance >= harmonicMinConsonance) return 'harmonic';
  if (input.dissonance >= dissonantMinDissonance) return 'dissonant';
  return 'complex';
}
