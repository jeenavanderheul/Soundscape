import { heartbeatBpm, HEARTBEAT_DYNAMICS_THRESHOLD } from '../audio/MusicalPrimitives';
import type { EventBus } from '../core/EventBus';
import type { Store } from '../core/stores';
import type { ResonanceEvent } from '../resonance/ResonanceEvent';
import type { MusicState } from './MusicState';
import type { TrackEvents, TrackLayerName, TrackState } from './TrackState';

/**
 * §29.5: the Track Builder — translates musical interpretation into track
 * layers. Phase 1-3 (drums): ghost pulse → KICK → HAT → CLAP/SNARE.
 * Unlock conditions are LENIENT (§29.3: "intentie telt"): a few roughly
 * right actions unlock the layer; the genre grammar keeps it coherent.
 */

export interface TrackBuilderConfig {
  /** Actions must land within this window to count as one intent. */
  intentWindowMs: number;
  kickActionsNeeded: number;
  hatActionsNeeded: number;
  clapActionsNeeded: number;
  /** Frequencies below this read as "low" (kick intent, §29.3). */
  lowHz: number;
  /** Frequencies above this read as "high" (hat intent). */
  highHz: number;
  /** Wind-release amplitude that reads as a strong transient (clap intent). */
  clapAmplitude: number;
  /** §29.3 auto-ladder (user decision): simply roaming the world with energy
   * unlocks the drum layers on this schedule; deliberate intent goes faster. */
  autoKickMs: number;
  autoHatsMs: number;
  autoSnareMs: number;
  /** Activity (dynamics) above this counts as roaming energy. */
  activityFloor: number;
  /** Clamp per-tick delta so tab suspensions never auto-unlock everything. */
  maxTickDeltaMs: number;
}

export const TRACK_BUILDER_CONFIG: TrackBuilderConfig = {
  intentWindowMs: 9000,
  kickActionsNeeded: 3,
  hatActionsNeeded: 3,
  clapActionsNeeded: 2,
  lowHz: 250,
  highHz: 600,
  clapAmplitude: 0.55,
  autoKickMs: 3000,
  autoHatsMs: 7000,
  autoSnareMs: 11000,
  activityFloor: 0.12,
  maxTickDeltaMs: 500,
};

/** A player action the builder interprets (fed from the game's input pulses). */
export interface TrackAction {
  atMs: number;
  hz: number;
  amplitude: number;
  /** True for LMB wind-release (sharper transient than a Space pulse). */
  release: boolean;
}

function prune(times: number[], nowMs: number, windowMs: number): void {
  while (times.length > 0 && nowMs - times[0]! > windowMs) times.shift();
}

export class TrackBuilder {
  private readonly lowActions: number[] = [];
  private readonly highActions: number[] = [];
  private readonly strongActions: number[] = [];
  private activeMs = 0;
  private lastTickMs: number | null = null;

  constructor(
    private readonly store: Store<TrackState>,
    private readonly bus: EventBus<TrackEvents>,
    private readonly config: TrackBuilderConfig = TRACK_BUILDER_CONFIG,
  ) {}

  /** Reset world (§17): the ladder starts over with the void. */
  reset(): void {
    this.lowActions.length = 0;
    this.highActions.length = 0;
    this.strongActions.length = 0;
    this.activeMs = 0;
    this.lastTickMs = null;
  }

  /** Input pulses and wind releases, tagged with the player's current sound. */
  onAction(action: TrackAction): void {
    const { config } = this;
    if (action.hz < config.lowHz) this.lowActions.push(action.atMs);
    if (action.hz > config.highHz) this.highActions.push(action.atMs);
    if (action.release && action.amplitude >= config.clapAmplitude) {
      this.strongActions.push(action.atMs);
    }
  }

  /** Resonance is intent too (§29.3): the resonator's register carries it. */
  onResonance(event: ResonanceEvent): void {
    if (event.targetHz < this.config.lowHz) this.lowActions.push(event.atMs);
    if (event.targetHz > this.config.highHz) this.highActions.push(event.atMs);
  }

  /** Logic-loop step: evaluate unlocks and keep the track's bpm current. */
  tick(nowMs: number, music: Readonly<MusicState>): void {
    const { config } = this;
    prune(this.lowActions, nowMs, config.intentWindowMs);
    prune(this.highActions, nowMs, config.intentWindowMs);
    prune(this.strongActions, nowMs, config.intentWindowMs);

    const track = this.store.getState();
    // The heartbeat clock counts as tempo (§29 fase 1): roaming with wind IS
    // finding a pulse — the world's ghost pulse carries the ladder.
    const heartbeatActive = music.dynamics >= HEARTBEAT_DYNAMICS_THRESHOLD;
    const bpm =
      music.bpm > 0 ? music.bpm : track.bpm > 0 ? track.bpm : heartbeatActive ? heartbeatBpm(music.dynamics) : 0;
    const tempoExists = bpm > 0;
    if (bpm !== track.bpm) this.store.setState((t) => ({ ...t, bpm }));

    // §29.3 auto-ladder: roaming with energy accumulates active time.
    const rawDelta = this.lastTickMs === null ? 0 : Math.max(0, nowMs - this.lastTickMs);
    this.lastTickMs = nowMs;
    const active =
      music.dynamics >= config.activityFloor ||
      (music.bpm > 0 && music.tempoConfidence > 0.3);
    if (active) this.activeMs += Math.min(rawDelta, config.maxTickDeltaMs);

    // Ladder order (§29.2): kick first, then hats and clap on top of it.
    // Deliberate register intent OR simply enough roaming energy unlocks.
    const kickIntent =
      this.lowActions.length >= config.kickActionsNeeded || this.activeMs >= config.autoKickMs;
    if (!track.drums.kick.unlocked && tempoExists && kickIntent) {
      this.unlock('kick', nowMs);
    }
    const kicked = this.store.getState().drums.kick.unlocked;
    const hatIntent =
      this.highActions.length >= config.hatActionsNeeded || this.activeMs >= config.autoHatsMs;
    if (kicked && !track.drums.hats.unlocked && hatIntent) {
      this.unlock('hats', nowMs);
    }
    const snareIntent =
      this.strongActions.length >= config.clapActionsNeeded || this.activeMs >= config.autoSnareMs;
    if (kicked && !track.drums.snare.unlocked && snareIntent) {
      this.unlock('snare', nowMs);
    }
  }

  private unlock(layer: TrackLayerName, atMs: number): void {
    this.store.setState((t) => {
      if (layer === 'kick' || layer === 'hats' || layer === 'snare') {
        return {
          ...t,
          drums: { ...t.drums, [layer]: { unlocked: true, level: 1 } },
        };
      }
      return { ...t, [layer]: { unlocked: true, level: 1 } };
    });
    this.bus.emit('track:layer', { layer, atMs });
  }
}
