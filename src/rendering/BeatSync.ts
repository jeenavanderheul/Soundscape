import type { AnalysisSnapshot } from '../audio/AudioAnalyser';

/**
 * Synchronized world behavior (spec §20 M4, §12): turns beat-boundary events
 * from the Strudel clock plus AnalysisSnapshot onsets into one world pulse
 * value 0..1 — fast attack on beat, smooth exponential decay. The exposed
 * modulation is depth-capped so materials brighten subtly and never strobe
 * (§23 reduced flashing). Renderers receive it via their setPulse hooks.
 */

export const BEAT_SYNC_CONFIG = {
  /** Attack time constant — pulse rises within ~2 frames, never pops. */
  attackSeconds: 0.04,
  /** Decay time constant — the pulse breathes out over ~a third of a beat. */
  decaySeconds: 0.28,
  /** Analysis onsets excite a weaker pulse than an actual beat. */
  onsetLevel: 0.45,
  /** Hard cap on modulation depth applied to visuals (§23: no strobing). */
  maxModulationDepth: 0.3,
} as const;

export interface BeatEvent {
  atMs: number;
}

/** Typed beat bus surface — the integration layer emits 'beat' events. */
export interface BeatBusLike {
  on(event: 'beat', handler: (payload: BeatEvent) => void): () => void;
}

/** Minimal hook each renderer exposes for pulse modulation. */
export interface PulseTarget {
  setPulse(value: number): void;
}

export class BeatSync {
  private readonly targets: readonly PulseTarget[];
  private level = 0;
  private target = 0;

  constructor(targets: readonly PulseTarget[] = []) {
    this.targets = targets;
  }

  /** Current pulse envelope 0..1. */
  get pulse(): number {
    return this.level;
  }

  /** Depth-capped modulation renderers actually receive (§23). */
  get modulation(): number {
    return this.level * BEAT_SYNC_CONFIG.maxModulationDepth;
  }

  subscribe(bus: BeatBusLike): () => void {
    return bus.on('beat', this.handleBeat);
  }

  readonly handleBeat = (_event: BeatEvent): void => {
    this.target = 1;
  };

  update(snapshot: Readonly<AnalysisSnapshot>, dtSeconds: number): void {
    const cfg = BEAT_SYNC_CONFIG;
    if (snapshot.onset && this.target < cfg.onsetLevel) this.target = cfg.onsetLevel;

    // Excitation target decays exponentially; the pulse chases it with a
    // fast attack upward and the shared decay constant downward.
    this.target *= Math.exp(-dtSeconds / cfg.decaySeconds);
    const tau = this.target > this.level ? cfg.attackSeconds : cfg.decaySeconds;
    this.level += (this.target - this.level) * (1 - Math.exp(-dtSeconds / tau));
    this.level = Math.min(Math.max(this.level, 0), 1);

    const modulation = this.modulation;
    for (const target of this.targets) target.setPulse(modulation);
  }
}
