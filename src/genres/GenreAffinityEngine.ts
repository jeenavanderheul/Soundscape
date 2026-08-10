import type { EventBus } from '../core/EventBus';
import type { GenreAffinity, MusicState } from '../music/MusicState';
import type { GenreSnapshot } from '../persistence/WorldSerializer';
import { scoreAmbient } from './AmbientProfile';
import { scoreTechno } from './TechnoProfile';

export type GenreEvents = {
  'genre:snapshot': GenreSnapshot;
};

export interface GenreAffinityEngineConfig {
  /** Minimum ms between evaluations (spec §9: 4–10 per second, never per frame). */
  intervalMs: number;
  /** Exponential smoothing rate per second toward the raw profile scores. */
  smoothingRate: number;
  /** Affinity above which a genre may be reported dominant. */
  dominantThreshold: number;
  /** Bounded history length (§10). */
  historyLimit: number;
}

export const GENRE_AFFINITY_CONFIG: GenreAffinityEngineConfig = {
  intervalMs: 100,
  smoothingRate: 1.2,
  dominantThreshold: 0.4,
  historyLimit: 64,
};

const ZERO_AFFINITY: GenreAffinity = {
  techno: 0,
  ambient: 0,
  jazz: 0,
  dnb: 0,
  experimental: 0,
};

/**
 * Genres emerge from MusicState (spec §9). M5 activates only the Techno
 * attractor; the other profiles stay 0 until their milestones. Affinities are
 * smoothed over temporal history and may overlap — no menu, no percentages.
 */
export class GenreAffinityEngine {
  private readonly affinity: GenreAffinity = { ...ZERO_AFFINITY };
  private lastEvalMs: number | null = null;
  private snapshot: GenreSnapshot | null = null;
  readonly history: GenreSnapshot[] = [];

  constructor(
    private readonly bus: EventBus<GenreEvents>,
    private readonly config: GenreAffinityEngineConfig = GENRE_AFFINITY_CONFIG,
  ) {}

  get current(): GenreSnapshot | null {
    return this.snapshot;
  }

  update(nowMs: number, music: Readonly<MusicState>): void {
    if (this.lastEvalMs !== null && nowMs - this.lastEvalMs < this.config.intervalMs) return;
    const deltaSec =
      this.lastEvalMs === null ? this.config.intervalMs / 1000 : (nowMs - this.lastEvalMs) / 1000;
    this.lastEvalMs = nowMs;

    const raw: GenreAffinity = {
      ...ZERO_AFFINITY,
      techno: scoreTechno(music),
      ambient: scoreAmbient(music),
    };
    const blend = 1 - Math.exp(-this.config.smoothingRate * deltaSec);
    for (const key of Object.keys(this.affinity) as (keyof GenreAffinity)[]) {
      this.affinity[key] += (raw[key] - this.affinity[key]) * blend;
    }

    const entries = Object.entries(this.affinity) as [keyof GenreAffinity, number][];
    const [topGenre, topValue] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    const second = Math.max(...entries.filter(([g]) => g !== topGenre).map(([, v]) => v));
    const dominant = topValue >= this.config.dominantThreshold ? topGenre : null;
    const confidence = dominant ? Math.min(1, Math.max(0, topValue - second)) : 0;

    this.snapshot = Object.freeze({
      atMs: nowMs,
      affinity: Object.freeze({ ...this.affinity }),
      dominant,
      confidence,
    });
    this.history.push(this.snapshot);
    if (this.history.length > this.config.historyLimit) this.history.shift();
    this.bus.emit('genre:snapshot', this.snapshot);
  }
}
