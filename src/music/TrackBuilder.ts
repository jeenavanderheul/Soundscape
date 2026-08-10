import { hzToMidi, speedToBpm } from '../audio/MusicalPrimitives';
import type { GenreAffinity } from './MusicState';
import type { EventBus } from '../core/EventBus';
import type { Store } from '../core/stores';
import type { ResonanceEvent } from '../resonance/ResonanceEvent';
import { ArrangementEngine } from './ArrangementEngine';
import { HarmonyEngine } from './HarmonyEngine';
import { MelodyTracker } from './MelodyTracker';
import type { MusicState } from './MusicState';
import type { TrackEvents, TrackGenre, TrackLayerName, TrackState } from './TrackState';

/**
 * §29.5: the Track Builder — translates musical interpretation into track
 * layers, in the pipeline order of §29.2: tempo → drums → bass → harmony →
 * melody → texture → arrangement.
 *
 * Unlock conditions are LENIENT (§29.3, user decision): roaming the world
 * with energy earns the layers on a schedule, and deliberate intent (playing
 * in the right register, resonating, travelling through pitch space) earns
 * them sooner. A non-musician always gets a full track.
 */

export interface TrackBuilderConfig {
  /** Actions must land within this window to count as one intent. */
  intentWindowMs: number;
  kickActionsNeeded: number;
  hatActionsNeeded: number;
  clapActionsNeeded: number;
  /** Frequencies below this read as "low" (kick/bass intent, §29.3). */
  lowHz: number;
  /** Frequencies above this read as "high" (hat intent). */
  highHz: number;
  /** Genuinely low register — deep enough to earn the bassline (§29.2 fase 3). */
  bassHz: number;
  /** Wind-release amplitude that reads as a strong transient (clap intent). */
  clapAmplitude: number;
  /** Auto-ladder: active roaming time at which each layer arrives. */
  autoKickMs: number;
  autoHatsMs: number;
  autoSnareMs: number;
  autoBassMs: number;
  autoHarmonyMs: number;
  autoMelodyMs: number;
  autoTextureMs: number;
  /** Time spent in the low register that earns the bass outright. */
  lowRegisterMs: number;
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
  bassHz: 140,
  clapAmplitude: 0.55,
  autoKickMs: 3000,
  autoHatsMs: 7000,
  autoSnareMs: 11_000,
  autoBassMs: 16_000,
  autoHarmonyMs: 23_000,
  autoMelodyMs: 31_000,
  autoTextureMs: 40_000,
  lowRegisterMs: 4000,
  activityFloor: 0.12,
  maxTickDeltaMs: 500,
};

/** A player action the builder interprets (fed from the game's input pulses). */
export interface TrackAction {
  atMs: number;
  hz: number;
  amplitude: number;
  /** True for a deliberate LMB wind-release (sharper transient than a pulse). */
  release: boolean;
}

/** What the flight is doing right now (§29: speed is the tempo). */
export interface FlightState {
  velocity: number;
  hz: number;
  /** 0..1 how hard the player is pushing; drives the arrangement (§29.7). */
  energy: number;
}

function prune(times: number[], nowMs: number, windowMs: number): void {
  while (times.length > 0 && nowMs - times[0]! > windowMs) times.shift();
}

/** Fold a midi note into [low, high] by octaves so any pitch stays playable. */
export function foldToRange(midi: number, low: number, high: number): number {
  let note = Math.round(midi);
  while (note > high) note -= 12;
  while (note < low) note += 12;
  return note;
}

export class TrackBuilder {
  private readonly lowActions: number[] = [];
  private readonly highActions: number[] = [];
  private readonly strongActions: number[] = [];
  private activeMs = 0;
  private lowRegisterMs = 0;
  private lastTickMs: number | null = null;
  readonly harmony = new HarmonyEngine();
  readonly melody = new MelodyTracker();
  readonly arrangement = new ArrangementEngine();

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
    this.lowRegisterMs = 0;
    this.lastTickMs = null;
    this.harmony.reset();
    this.melody.reset();
    this.arrangement.reset();
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

  /** Resonance is intent AND harmony (§29.3, §29.2 fase 4). */
  onResonance(event: ResonanceEvent): void {
    if (event.targetHz < this.config.lowHz) this.lowActions.push(event.atMs);
    if (event.targetHz > this.config.highHz) this.highActions.push(event.atMs);
    this.harmony.onResonance(event);
  }

  /** Logic-loop step: interpret, unlock, and keep the track's content current. */
  tick(
    nowMs: number,
    music: Readonly<MusicState>,
    flight: FlightState,
    affinity?: GenreAffinity,
  ): void {
    const { config } = this;
    prune(this.lowActions, nowMs, config.intentWindowMs);
    prune(this.highActions, nowMs, config.intentWindowMs);
    prune(this.strongActions, nowMs, config.intentWindowMs);

    const rawDelta = this.lastTickMs === null ? 0 : Math.max(0, nowMs - this.lastTickMs);
    this.lastTickMs = nowMs;
    const delta = Math.min(rawDelta, config.maxTickDeltaMs);

    const track = this.store.getState();
    const moving = flight.velocity > 0.5 || music.dynamics >= config.activityFloor;
    const active = moving || (music.bpm > 0 && music.tempoConfidence > 0.3);
    if (active) this.activeMs += delta;
    this.lowRegisterMs = flight.hz < config.bassHz && active ? this.lowRegisterMs + delta : 0;

    this.harmony.tick(nowMs);
    this.melody.tick(nowMs, flight.hz);

    // --- Fase 1: TEMPO. Flight speed sets the clock; the player's own
    // rhythm always wins once it is confident (§3.4, §29.2).
    const playerTempo = music.tempoConfidence >= 0.35 && music.bpm > 0;
    const speedBpm = moving ? speedToBpm(flight.velocity) : 0;
    const nextBpm = playerTempo
      ? Math.round(music.bpm)
      : speedBpm > 0
        ? speedBpm
        : track.bpm; // an earned track keeps its clock through stillness
    const tempoExists = nextBpm > 0;

    // --- Fase 4/5 content: what the player's resonances and flight built.
    const rootMidi = 36 + (((Math.round(hzToMidi(Math.max(music.pitchCenter, 20))) % 12) + 12) % 12);
    const intervals = this.harmony.chordIntervals();
    const melodyNotes = track.melody.unlocked
      ? this.melody.phrase(rootMidi).map((n) => foldToRange(n, rootMidi + 24, rootMidi + 36))
      : [];
    const genre = this.dominant(affinity);

    // --- Fase 11: ARRANGEMENT. Movement becomes form (§29.7).
    const layerCount = this.countLayers(track);
    const section = this.arrangement.tick(nowMs, delta, flight.energy, layerCount);

    if (
      nextBpm !== track.bpm ||
      genre !== track.genre ||
      section !== track.form ||
      rootMidi !== track.rootMidi ||
      !sameNumbers(intervals, track.harmonyIntervals) ||
      !sameNumbers(melodyNotes, track.melodyNotes)
    ) {
      this.store.setState((t) => ({
        ...t,
        bpm: nextBpm,
        genre,
        form: section,
        rootMidi,
        harmonyIntervals: intervals,
        melodyNotes,
      }));
      if (genre !== track.genre) this.bus.emit('track:genre', { genre, atMs: nowMs });
      if (section !== track.form) this.bus.emit('track:section', { section, atMs: nowMs });
    }

    // --- The unlock ladder (§29.2, §29.3): order is the composition order.
    const current = this.store.getState();
    if (!tempoExists) return;
    if (
      !current.drums.kick.unlocked &&
      (this.lowActions.length >= config.kickActionsNeeded || this.activeMs >= config.autoKickMs)
    ) {
      this.unlock('kick', nowMs);
    }
    if (!this.store.getState().drums.kick.unlocked) return; // kick leads the ladder
    if (
      !current.drums.hats.unlocked &&
      (this.highActions.length >= config.hatActionsNeeded || this.activeMs >= config.autoHatsMs)
    ) {
      this.unlock('hats', nowMs);
    }
    if (
      !current.drums.snare.unlocked &&
      (this.strongActions.length >= config.clapActionsNeeded || this.activeMs >= config.autoSnareMs)
    ) {
      this.unlock('snare', nowMs);
    }
    if (
      !current.bass.unlocked &&
      (this.lowRegisterMs >= config.lowRegisterMs || this.activeMs >= config.autoBassMs)
    ) {
      this.unlock('bass', nowMs);
    }
    if (
      !current.harmony.unlocked &&
      (this.harmony.discovered || this.activeMs >= config.autoHarmonyMs)
    ) {
      this.unlock('harmony', nowMs);
    }
    if (
      !current.melody.unlocked &&
      (this.melody.discovered || this.activeMs >= config.autoMelodyMs)
    ) {
      this.unlock('melody', nowMs);
    }
    if (!current.texture.unlocked && this.activeMs >= config.autoTextureMs) {
      this.unlock('texture', nowMs);
    }
  }

  private countLayers(track: TrackState): number {
    const patterns = [
      track.drums.kick,
      track.drums.hats,
      track.drums.snare,
      track.bass,
      track.harmony,
      track.melody,
      track.texture,
    ];
    return patterns.filter((p) => p.unlocked).length;
  }

  private dominant(affinity?: GenreAffinity): TrackGenre {
    if (!affinity) return null;
    let best: TrackGenre = null;
    let bestValue = 0.35;
    for (const [genre, value] of Object.entries(affinity) as [
      Exclude<TrackGenre, null>,
      number,
    ][]) {
      if (value > bestValue) {
        best = genre;
        bestValue = value;
      }
    }
    return best;
  }

  private unlock(layer: TrackLayerName, atMs: number): void {
    this.store.setState((t) => {
      if (layer === 'kick' || layer === 'hats' || layer === 'snare') {
        return { ...t, drums: { ...t.drums, [layer]: { unlocked: true, level: 1 } } };
      }
      return { ...t, [layer]: { unlocked: true, level: 1 } };
    });
    this.bus.emit('track:layer', { layer, atMs });
  }
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
