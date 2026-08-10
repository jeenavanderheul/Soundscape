import { genreGrammar, hzToMidi, regionBpm } from '../audio/MusicalPrimitives';
import type { GenreAffinity } from './MusicState';
import type { EventBus } from '../core/EventBus';
import type { Store } from '../core/stores';
import type { ResonanceEvent } from '../resonance/ResonanceEvent';
import { ArrangementEngine } from './ArrangementEngine';
import { CallResponse } from './CallResponse';
import { ladderFor, layerUnlocked, nextStep } from './GenreLadder';
import { HarmonyEngine } from './HarmonyEngine';
import { MelodyTracker } from './MelodyTracker';
import type { MusicState } from './MusicState';
import { nextRootMidi, rotateVariations, type LayerVariations } from './Variation';
import {
  createInitialTrackState,
  LEVEL_DEEP,
  LEVEL_EARNED,
  type TrackEvents,
  type TrackGenre,
  type TrackLayerName,
  type TrackState,
} from './TrackState';

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
  /** Time spent in the low register that earns the bass outright. */
  lowRegisterMs: number;
  /** Activity (dynamics) above this counts as roaming energy. */
  activityFloor: number;
  /** Clamp per-tick delta so tab suspensions never auto-unlock everything. */
  maxTickDeltaMs: number;
  /** §32: active time between one layer growing its second voice and the next. */
  deepenIntervalMs: number;
  /**
   * The ladder timings are PATIENCE, not a schedule (§29.3, §31.2): behaviour
   * earns a layer, and only a player who does nothing in particular waits this
   * multiple of the ladder time for the world to offer it anyway.
   */
  patienceFactor: number;
  /** Altitude below which the orb is skimming the ground — that is the low register. */
  groundAltitude: number;
  /** Altitude above which the orb is in open air. */
  airAltitude: number;
  /** Time skimming the ground that earns the kick, and (×2) the bass. */
  groundMs: number;
  /** Time in open air that earns the hats, and (×2) the texture. */
  airMs: number;
  /**
   * How fast the track's clock may follow a change of region, in BPM per
   * second. Crossing into another grammar has to speed the WHOLE track up or
   * down rather than cutting to another tempo (user decision).
   */
  bpmSlewPerSecond: number;
  /** Speed at which the track develops at DEVELOPMENT_MAX pace. */
  fullSpeed: number;
  /** Pace multiplier at a standstill and at full speed (§46). */
  paceAtRest: number;
  paceAtFullSpeed: number;
  /**
   * §53: time spent inside a DIFFERENT region before the current track hands
   * over and a new one is born there. A track never changes grammar (§47), so
   * this is the only way travelling can change what you hear — and travelling
   * has to change what you hear, or the world is one long track with scenery.
   */
  regionSwitchMs: number;
  /**
   * §54: a track has to be allowed to exist. Circling a border would otherwise
   * start a new one every second and you would never build anything.
   */
  minTrackLifeMs: number;
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
  lowRegisterMs: 4000,
  activityFloor: 0.12,
  maxTickDeltaMs: 500,
  deepenIntervalMs: 11_000,
  patienceFactor: 2.5,
  groundAltitude: 8,
  airAltitude: 30,
  groundMs: 3500,
  airMs: 3500,
  bpmSlewPerSecond: 9,
  fullSpeed: 66,
  paceAtRest: 0.55,
  paceAtFullSpeed: 2.4,
  // Arriving in a world IS hearing it: the switch fires as soon as the region
  // reads as the new one, and lands on the next bar (§11). What stops a sweep
  // of the mouse from wiping your track is minTrackLifeMs, not a delay here.
  regionSwitchMs: 250,
  minTrackLifeMs: 8000,
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
  /** Height above the terrain right under the orb (§3.1 low = mass, high = air). */
  altitude?: number;
  /** Vertical speed in units/s: climbing builds the track, diving drops it. */
  climb?: number;
}

/** Move at most `limit` in either direction. */
function clampMagnitude(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
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
  private groundMs = 0;
  private airMs = 0;
  private lastDeepenMs = 0;
  private lastTickMs: number | null = null;
  private paceClockMs = 0;
  /** Paced time the current track was born at, for §54's minimum life. */
  private trackStartedMs = 0;
  private lastRegion: TrackGenre = null;
  /** Paced time spent inside a region that is not this track's own (§53). */
  private awayMs = 0;
  private trackNumberValue = 1;
  private turn = 0;
  private layerVariations: LayerVariations = {};
  /** True once the finished track has reached a drop and is waiting to hand over. */
  private handingOver = false;
  readonly conversation = new CallResponse();
  readonly harmony = new HarmonyEngine();
  readonly melody = new MelodyTracker();
  readonly arrangement = new ArrangementEngine();

  constructor(
    private readonly store: Store<TrackState>,
    private readonly bus: EventBus<TrackEvents>,
    private readonly config: TrackBuilderConfig = TRACK_BUILDER_CONFIG,
    /** Journey seed: the same flight always writes the same tracks (§25.16). */
    private readonly seed = 'frequency',
  ) {}

  /** 1-based; the journey never ends, it just moves on to the next track. */
  get trackNumber(): number {
    return this.trackNumberValue;
  }

  /**
   * How fast the track is developing right now: 0.55× standing still, 2.4× at
   * full throttle (§46). Also what the HUD shows as the speed bar.
   */
  pace(velocity: number): number {
    const { config } = this;
    const t = Math.min(1, Math.max(0, velocity / config.fullSpeed));
    return config.paceAtRest + (config.paceAtFullSpeed - config.paceAtRest) * t;
  }

  /** Which variation of its part each layer is playing right now. */
  get variations(): LayerVariations {
    return this.layerVariations;
  }

  /** Reset world (§17): the ladder starts over with the void. */
  reset(): void {
    this.lowActions.length = 0;
    this.highActions.length = 0;
    this.strongActions.length = 0;
    this.activeMs = 0;
    this.paceClockMs = 0;
    this.lowRegisterMs = 0;
    this.groundMs = 0;
    this.airMs = 0;
    this.lastDeepenMs = 0;
    this.lastTickMs = null;
    this.conversation.reset();
    this.harmony.reset();
    this.melody.reset();
    this.arrangement.reset();
    this.trackNumberValue = 1;
    this.turn = 0;
    this.layerVariations = {};
    this.handingOver = false;
    this.lastRegion = null;
    this.awayMs = 0;
    this.trackStartedMs = 0;
  }

  /**
   * The endless journey (user decision): once every layer is earned AND grown
   * deep, the track is finished. It ends on its next drop, and coming out of
   * that drop the world starts the following track — same journey, related key,
   * one motif carried over, everything else earned again.
   */
  private advanceJourney(nowMs: number, section: TrackState['form']): void {
    const track = this.store.getState();
    if (!this.handingOver) {
      if (!this.isComplete(track) || section !== 'drop') return;
      this.handingOver = true;
      return;
    }
    if (section === 'drop') return; // still in it — let the drop land
    this.startNextTrack(nowMs);
  }

  private isComplete(track: Readonly<TrackState>): boolean {
    const layers: TrackLayerName[] = [
      'kick', 'snare', 'hats', 'bass', 'harmony', 'melody', 'texture',
    ];
    return layers.every((layer) => layerUnlocked(track, layer) && levelOf(track, layer) >= LEVEL_DEEP);
  }

  private startNextTrack(nowMs: number, reason: 'completed' | 'travelled' = 'completed'): void {
    const previous = this.store.getState();
    this.trackNumberValue += 1;
    this.handingOver = false;
    const rootMidi = nextRootMidi(previous.rootMidi, this.trackNumberValue);
    // The next track is born in the region the player is in RIGHT NOW (§47).
    const bornIn = this.lastRegion ?? previous.genre;
    const shift = rootMidi - previous.rootMidi;
    // What survives: the key (transposed) and ONE motif, moved with it. The
    // parts themselves are earned again — that is still the game.
    const motif = previous.melodyNotes.map((note) => note + shift);
    // A track you FINISHED hands its key and one motif to the next one; a
    // world you TRAVELLED to is a clean slate, at its own tempo, straight away
    // (user decision §54).
    const travelled = reason === 'travelled';
    this.store.setState((t) => ({
      ...createInitialTrackState(),
      genre: bornIn,
      bpm: travelled ? regionBpm(genreGrammar(bornIn)) : t.bpm,
      rootMidi: travelled ? createInitialTrackState().rootMidi : rootMidi,
      melodyNotes: travelled ? [] : motif,
    }));
    this.activeMs = 0;
    this.lastDeepenMs = 0;
    this.lowRegisterMs = 0;
    this.groundMs = 0;
    this.airMs = 0;
    this.layerVariations = {};
    this.harmony.reset();
    this.melody.reset();
    this.conversation.reset();
    this.arrangement.reset();
    this.awayMs = 0;
    this.trackStartedMs = this.paceClockMs;
    this.bus.emit('track:new', { number: this.trackNumberValue, atMs: nowMs });
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
    // §46: SPEED IS DEVELOPMENT. Flying harder does not change the tempo — it
    // makes the track grow, deepen and move through its sections faster, so a
    // fast flight finishes a track sooner and reaches the next one sooner.
    const pace = this.pace(flight.velocity);
    const paced = delta * pace;
    if (active) {
      this.activeMs += paced;
      this.paceClockMs += paced;
    }
    this.lowRegisterMs = flight.hz < config.bassHz && active ? this.lowRegisterMs + delta : 0;
    // §3.1: WHERE you fly is which part of the register you are in. Skimming
    // the ground is mass; open air is detail. Both are earned by flying there,
    // not by waiting.
    const altitude = flight.altitude ?? (config.groundAltitude + config.airAltitude) / 2;
    this.groundMs = altitude <= config.groundAltitude && active ? this.groundMs + delta : 0;
    this.airMs = altitude >= config.airAltitude && active ? this.airMs + delta : 0;

    this.harmony.tick(nowMs);
    this.melody.tick(nowMs, flight.hz);

    // --- Fase 1: TEMPO. Flight speed sets the clock; the player's own
    // rhythm always wins once it is confident (§3.4, §29.2).
    const playerTempo = music.tempoConfidence >= 0.35 && music.bpm > 0;
    // §46: the region decides the tempo, full stop. Flying faster develops the
    // track faster (below) — it never moves the clock.
    const placeBpm = moving ? regionBpm(genreGrammar(track.genre ?? this.dominant(affinity))) : 0;
    const targetBpm = playerTempo
      ? Math.round(music.bpm)
      : placeBpm > 0
        ? placeBpm
        : track.bpm; // an earned track keeps its clock through stillness
    // The clock slides toward the flight instead of snapping to it: shifting up
    // makes the whole track accelerate, it does not swap it for a faster one.
    const nextBpm =
      track.bpm <= 0
        ? targetBpm
        : Math.round(
            track.bpm +
              clampMagnitude(targetBpm - track.bpm, (config.bpmSlewPerSecond * delta) / 1000),
          );
    const tempoExists = nextBpm > 0;

    // --- Fase 4/5 content: what the player's resonances and flight built.
    const rootMidi = 36 + (((Math.round(hzToMidi(Math.max(music.pitchCenter, 20))) % 12) + 12) % 12);
    const intervals = this.harmony.chordIntervals();
    // While the melody is not earned, whatever is in there stays: on a fresh
    // track that is nothing, and on the next track of the journey it is the
    // motif carried over from the last one (user decision).
    const melodyNotes = track.melody.unlocked
      ? this.melody.phrase(rootMidi).map((n) => foldToRange(n, rootMidi + 24, rootMidi + 36))
      : track.melodyNotes;
    // §47 (user decision): a track keeps the grammar it was born in. Flying
    // from Techno into Garage does not rewrite your techno track — the region
    // you are in when the NEXT track starts is what decides that one.
    const genre = track.genre ?? this.dominant(affinity);
    // §31: in Jazz the world takes its turn — it answers the player's phrase
    // with a variation instead of looping underneath it.
    const responseNotes =
      genre === 'jazz' && track.melody.unlocked
        ? [...this.conversation.tick(nowMs, melodyNotes)]
        : [];

    // --- Fase 11: ARRANGEMENT. Movement becomes form (§29.7).
    // Where the player actually is — the next track will be born here (§47).
    this.lastRegion = this.dominant(affinity);
    // §53: fly into another world and stay there, and the world takes over:
    // the track you were building ends and a new one starts in this grammar.
    const away = this.lastRegion !== null && track.genre !== null && this.lastRegion !== track.genre;
    this.awayMs = away ? this.awayMs + paced : 0;
    const lived = this.paceClockMs - this.trackStartedMs;
    if (this.awayMs >= config.regionSwitchMs && lived >= config.minTrackLifeMs) {
      this.awayMs = 0;
      // §54: a world is a track. Arrive somewhere else and you start there —
      // from the first layer, at that world's tempo, with nothing carried over.
      this.startNextTrack(nowMs, 'travelled');
      return;
    }
    // The arrangement runs on the paced clock too: sections arrive sooner when
    // the player is moving through the world quickly.
    const section = this.arrangement.tick(
      this.paceClockMs,
      paced,
      flight.energy,
      flight.climb ?? 0,
    );

    if (
      nextBpm !== track.bpm ||
      genre !== track.genre ||
      section !== track.form ||
      rootMidi !== track.rootMidi ||
      !sameNumbers(intervals, track.harmonyIntervals) ||
      !sameNumbers(melodyNotes, track.melodyNotes) ||
      !sameNumbers(responseNotes, track.responseNotes)
    ) {
      this.store.setState((t) => ({
        ...t,
        bpm: nextBpm,
        genre,
        form: section,
        rootMidi,
        harmonyIntervals: intervals,
        melodyNotes,
        responseNotes,
      }));
      if (genre !== track.genre) this.bus.emit('track:genre', { genre, atMs: nowMs });
      if (section !== track.form) this.bus.emit('track:section', { section, atMs: nowMs });
    }
    // Endless journey: every turn of the arrangement rewrites ONE layer with a
    // different variation of the same part (user decision), so a finished track
    // keeps moving instead of looping itself to death.
    if (section !== track.form) {
      this.turn += 1;
      this.layerVariations = rotateVariations(
        this.layerVariations,
        this.turn,
        this.trackNumberValue,
        this.seed,
      );
    }
    this.advanceJourney(nowMs, section);

    // --- The unlock ladder (§29.2, §31): the REGION decides the composition
    // order. Only the next step of this genre's ladder can be earned, so a
    // track always emerges layer by layer in its own grammar.
    if (!tempoExists) return;
    const current = this.store.getState();
    const ladder = ladderFor(genre);
    const step = nextStep(current, ladder);
    // Behaviour earns the layer. The ladder time is only the world's patience
    // with a player who is doing nothing in particular (§29.3) — it must never
    // be the mechanism, or the track becomes a progress bar instead of a
    // consequence.
    // From the second track on the world is half as patient: you have shown you
    // know how to build one, so it comes to meet you (user decision).
    const patienceFactor =
      this.trackNumberValue === 1 ? config.patienceFactor : config.patienceFactor / 2;
    const patience = step === null ? 0 : step.atMs * patienceFactor;
    if (step !== null && (this.intent(step.layer) || this.activeMs >= patience)) {
      this.unlock(step.layer, nowMs);
      return;
    }

    // §32: a track also has to grow in DEPTH, not only in width. Staying in
    // the world stacks a second voice onto a layer you already earned — the
    // 808 body under the clap, the dirty saw under the sub — so a flight ends
    // on a produced track instead of a sketch.
    if (this.activeMs - this.lastDeepenMs >= config.deepenIntervalMs) {
      const shallow = ladder.find(
        (candidate) =>
          layerUnlocked(current, candidate.layer) &&
          levelOf(current, candidate.layer) < LEVEL_DEEP,
      );
      if (shallow) {
        this.lastDeepenMs = this.activeMs;
        this.deepen(shallow.layer, nowMs);
      }
    }
  }

  private deepen(layer: TrackLayerName, atMs: number): void {
    this.store.setState((t) => {
      if (layer === 'kick' || layer === 'hats' || layer === 'snare') {
        return {
          ...t,
          drums: { ...t.drums, [layer]: { unlocked: true, level: LEVEL_DEEP } },
        };
      }
      return { ...t, [layer]: { unlocked: true, level: LEVEL_DEEP } };
    });
    this.bus.emit('track:depth', { layer, atMs });
  }

  /** Deliberate play that earns a layer ahead of the clock (§29.3). */
  private intent(layer: TrackLayerName): boolean {
    const { config } = this;
    switch (layer) {
      // Low excitations, or simply flying down where the mass is (§3.1).
      case 'kick':
        return this.lowActions.length >= config.kickActionsNeeded || this.groundMs >= config.groundMs;
      // High excitations, or climbing into the air where the detail lives.
      case 'hats':
        return this.highActions.length >= config.hatActionsNeeded || this.airMs >= config.airMs;
      case 'snare':
        return this.strongActions.length >= config.clapActionsNeeded;
      case 'bass':
        return this.lowRegisterMs >= config.lowRegisterMs || this.groundMs >= config.groundMs * 2;
      case 'harmony':
        return this.harmony.discovered;
      case 'melody':
        return this.melody.discovered;
      // §3.10 texture is space: staying up in the open air fills it in.
      case 'texture':
        return this.airMs >= config.airMs * 2;
    }
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
        return { ...t, drums: { ...t.drums, [layer]: { unlocked: true, level: LEVEL_EARNED } } };
      }
      return { ...t, [layer]: { unlocked: true, level: LEVEL_EARNED } };
    });
    this.bus.emit('track:layer', { layer, atMs });
  }
}

function levelOf(track: Readonly<TrackState>, layer: TrackLayerName): number {
  if (layer === 'kick' || layer === 'hats' || layer === 'snare') return track.drums[layer].level;
  return track[layer].level;
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
