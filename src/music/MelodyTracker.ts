/**
 * §10 MelodyTracker (§29.2 fase 5): movement through pitch space becomes a
 * remembered phrase (§3.5). The trajectory is sampled at a bounded control
 * rate, snapped to a scale so any flight path sounds musical (§P4), and
 * reduced to a short repeatable motif.
 */

export interface MelodyTrackerConfig {
  /** Control-rate sampling interval; never per render frame (§10). */
  sampleIntervalMs: number;
  /** Bounded history (§10). */
  maxSamples: number;
  /** Notes in the emitted phrase. */
  phraseLength: number;
  /** Semitone movement across the history that counts as "melodic". */
  discoveryRange: number;
}

export const MELODY_CONFIG: MelodyTrackerConfig = {
  sampleIntervalMs: 250,
  maxSamples: 32,
  phraseLength: 4,
  discoveryRange: 5,
};

/** Minor pentatonic degrees: every path through it stays consonant (§P4). */
export const SCALE_DEGREES = [0, 3, 5, 7, 10] as const;

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

/** Snap a midi note to the pentatonic scale rooted at `rootMidi`. */
export function snapToScale(midi: number, rootMidi: number): number {
  const offset = midi - rootMidi;
  const octave = Math.floor(offset / 12);
  const within = offset - octave * 12;
  let best: number = SCALE_DEGREES[0]!;
  let bestDistance = Infinity;
  for (const degree of SCALE_DEGREES) {
    const distance = Math.abs(degree - within);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = degree;
    }
  }
  return rootMidi + octave * 12 + best;
}

export class MelodyTracker {
  private readonly samples: number[] = [];
  private lastSampleMs: number | null = null;

  constructor(private readonly config: MelodyTrackerConfig = MELODY_CONFIG) {}

  /** Logic-loop step; samples the player's pitch at the control rate. */
  tick(nowMs: number, hz: number): void {
    if (!(hz > 0)) return;
    if (this.lastSampleMs !== null && nowMs - this.lastSampleMs < this.config.sampleIntervalMs) {
      return;
    }
    this.lastSampleMs = nowMs;
    this.samples.push(hzToMidi(hz));
    if (this.samples.length > this.config.maxSamples) this.samples.shift();
  }

  /** Semitone span the player has travelled through recently. */
  get range(): number {
    if (this.samples.length < 2) return 0;
    return Math.max(...this.samples) - Math.min(...this.samples);
  }

  get discovered(): boolean {
    return this.range >= this.config.discoveryRange;
  }

  /**
   * The remembered phrase as midi notes, scale-snapped and evenly spread
   * across the trajectory so the motif traces the flight path.
   */
  phrase(rootMidi: number): number[] {
    const { phraseLength } = this.config;
    if (this.samples.length === 0) return [];
    const notes: number[] = [];
    for (let i = 0; i < phraseLength; i++) {
      const position = (i / phraseLength) * (this.samples.length - 1);
      const sample = this.samples[Math.round(position)]!;
      notes.push(snapToScale(Math.round(sample), rootMidi));
    }
    return notes;
  }

  reset(): void {
    this.samples.length = 0;
    this.lastSampleMs = null;
  }
}
