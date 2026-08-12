import type { EventBus } from '../core/EventBus';
import type { GenreAffinity, MusicState } from '../music/MusicState';
import type { GenreSnapshot } from '../persistence/WorldSerializer';
import { scoreAmbient } from './AmbientProfile';
import { scoreBass } from './BassProfile';
import { scoreExperimental } from './ExperimentalProfile';
import { scoreJazz } from './JazzProfile';
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
  // Fast enough that crossing a border is audible while you are still
  // crossing it, slow enough that it never flickers (§34).
  smoothingRate: 2.2,
  dominantThreshold: 0.4,
  historyLimit: 64,
};

const ZERO_AFFINITY: GenreAffinity = {
  techno: 0,
  ambient: 0,
  jazz: 0,
  bass: 0,
  garage: 0,
  house: 0,
  trap: 0,
  breakbeat: 0,
  dub: 0,
  experimental: 0,
};

/**
 * §34: these four are scored from what the player PLAYS (§9). The regions
 * added later are places you travel to — their pull is spatial, so blending
 * them with a behaviour score of zero would halve them unfairly.
 */
const BEHAVIOURAL: ReadonlySet<keyof GenreAffinity> = new Set([
  'techno',
  'ambient',
  'jazz',
  'bass',
  'experimental',
]);

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

  /**
   * `zone` is the spatial pull of the region the player is in (§29.5, user
   * decision: every direction is a genre). Behaviour and place carry equal
   * weight — flying north leans Techno, and playing Techno-like there makes
   * it unmistakable. Both are gated by whether any music exists at all.
   */
  update(nowMs: number, music: Readonly<MusicState>, zone?: GenreAffinity): void {
    if (this.lastEvalMs !== null && nowMs - this.lastEvalMs < this.config.intervalMs) return;
    const deltaSec =
      this.lastEvalMs === null ? this.config.intervalMs / 1000 : (nowMs - this.lastEvalMs) / 1000;
    this.lastEvalMs = nowMs;

    const base = {
      techno: scoreTechno(music),
      ambient: scoreAmbient(music),
      jazz: scoreJazz(music),
      bass: scoreBass(music),
    };
    const behaviour: GenreAffinity = {
      ...ZERO_AFFINITY,
      ...base,
      // §9.5: experimental feeds on conflict between the other attractors.
      experimental: scoreExperimental(music, base),
    };
    // Silence has no genre: the world only colours music that is playing.
    const audible = Math.min(1, Math.max(music.dynamics * 2, music.bpm > 0 ? 1 : 0));
    const raw = { ...behaviour };
    if (zone) {
      for (const key of Object.keys(raw) as (keyof GenreAffinity)[]) {
        // WHERE you are outweighs what you play (§34): the player must hear
        // a different region within seconds of turning, and behaviour alone
        // would otherwise keep the same grammar everywhere.
        raw[key] = Math.min(
          1,
          (BEHAVIOURAL.has(key) ? behaviour[key] * 0.3 + zone[key] * 0.7 : zone[key]) * audible,
        );
      }
    }
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
