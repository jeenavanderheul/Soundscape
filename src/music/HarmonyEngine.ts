import type { ResonanceEvent } from '../resonance/ResonanceEvent';

/**
 * §10 HarmonyEngine (§29.2 fase 4): connection becomes chords. Combining
 * resonant frequencies builds a harmonic bed — the intervals the player
 * actually made, snapped to a simple perceptual set so a non-musician always
 * gets something coherent (§P4 safe creativity).
 */

/** Simple ratios → semitone intervals above the root (§3.6). */
const RATIO_INTERVALS: ReadonlyArray<{ ratio: number; semitones: number }> = [
  { ratio: 1, semitones: 0 },
  { ratio: 6 / 5, semitones: 3 },
  { ratio: 5 / 4, semitones: 4 },
  { ratio: 4 / 3, semitones: 5 },
  { ratio: 3 / 2, semitones: 7 },
  { ratio: 5 / 3, semitones: 9 },
  { ratio: 16 / 9, semitones: 10 },
  { ratio: 2, semitones: 12 },
];

export interface HarmonyEngineConfig {
  /** How long an interval stays part of the chord without being refreshed. */
  memoryMs: number;
  /** Chord size cap (root + extras). */
  maxVoices: number;
  /** Distinct interval count that counts as "harmony discovered". */
  discoveryIntervals: number;
}

export const HARMONY_CONFIG: HarmonyEngineConfig = {
  memoryMs: 45_000,
  maxVoices: 4,
  discoveryIntervals: 2,
};

interface IntervalMemory {
  semitones: number;
  atMs: number;
  consonance: number;
}

/** Octave-reduce any ratio into [1, 2). */
export function octaveReduce(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  let r = ratio;
  while (r >= 2) r /= 2;
  while (r < 1) r *= 2;
  return r;
}

/** Nearest simple interval, in semitones above the root. */
export function ratioToSemitones(ratio: number): number {
  const reduced = octaveReduce(ratio);
  let best = RATIO_INTERVALS[0]!;
  let bestDistance = Infinity;
  for (const entry of RATIO_INTERVALS) {
    const distance = Math.abs(entry.ratio - reduced);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return best.semitones;
}

export class HarmonyEngine {
  private readonly intervals: IntervalMemory[] = [];

  constructor(private readonly config: HarmonyEngineConfig = HARMONY_CONFIG) {}

  /** Every resonance contributes its interval to the harmonic memory (P5). */
  onResonance(event: ResonanceEvent): void {
    const semitones = ratioToSemitones(event.ratio);
    const existing = this.intervals.find((i) => i.semitones === semitones);
    if (existing) {
      existing.atMs = event.atMs;
      existing.consonance = Math.max(existing.consonance, event.consonance);
      return;
    }
    this.intervals.push({ semitones, atMs: event.atMs, consonance: event.consonance });
  }

  /** Drop intervals the player has not renewed; harmony fades like memory. */
  tick(nowMs: number): void {
    for (let i = this.intervals.length - 1; i >= 0; i--) {
      if (nowMs - this.intervals[i]!.atMs > this.config.memoryMs) this.intervals.splice(i, 1);
    }
  }

  get discovered(): boolean {
    return this.uniqueSemitones().length >= this.config.discoveryIntervals;
  }

  /** Semitone offsets of the current chord, root first. Deterministic order. */
  chordIntervals(): number[] {
    const unique = this.uniqueSemitones();
    // Strongest (most consonant) intervals first, then a stable numeric order.
    const ranked = [...this.intervals]
      .sort((a, b) => b.consonance - a.consonance || a.semitones - b.semitones)
      .map((i) => i.semitones);
    const chosen: number[] = [0];
    for (const semitones of ranked) {
      if (chosen.length >= this.config.maxVoices) break;
      if (semitones !== 0 && !chosen.includes(semitones)) chosen.push(semitones);
    }
    return unique.length === 0 ? [0] : chosen.sort((a, b) => a - b);
  }

  reset(): void {
    this.intervals.length = 0;
  }

  private uniqueSemitones(): number[] {
    return [...new Set(this.intervals.map((i) => i.semitones))];
  }
}
