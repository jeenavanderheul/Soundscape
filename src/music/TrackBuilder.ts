import { genreGrammar, hzToMidi, regionBpm } from '../audio/MusicalPrimitives';
import type { GenreAffinity } from './MusicState';
import type { EventBus } from '../core/EventBus';
import type { Store } from '../core/stores';
import type { ResonanceEvent } from '../resonance/ResonanceEvent';
import { ArrangementEngine, CYCLES_PER_PHASE, rungsDueAt } from './ArrangementEngine';
import { CallResponse } from './CallResponse';
import { ladderFor, layerUnlocked, nextStep } from './GenreLadder';
import { HarmonyEngine } from './HarmonyEngine';
import { MelodyTracker } from './MelodyTracker';
import type { MusicState } from './MusicState';
import { nextRootMidi, rotateVariations, type LayerVariations } from './Variation';
import { dnaFor, type TrackDNA } from './TrackDNA';
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
  /** §82: paced time a rung must settle before the next layer may arrive. */
  rungGapMs: number;
  /**
   * §107/§108: how far into a rung's own PHASE the world gives it away, as a
   * fraction. This is the window in which your flying is what earns it — and
   * because it scales with the phase it stays the same shape at any tempo,
   * where a fixed number of gaps overshot the phase at higher bpm.
   */
  patienceOfPhase: number;
  /** Altitude below which the orb is skimming the ground — that is the low register. */
  groundAltitude: number;
  /** Altitude above which the orb is in open air. */
  airAltitude: number;
  /** Time skimming the ground that earns the kick, and (×2) the bass. */
  groundMs: number;
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
  // §65: 2.5 turned a three-second rung into eight and a seven-second rung
  // into twenty — long enough that a track read as "nothing is happening".
  // Behaviour still earns a layer instantly; this is only how long the world
  // waits for a player who is doing nothing in particular. §87 slowed the
  // clock underneath it by nearly four, so the multiplier comes back to 1 —
  // otherwise a passive player would still be missing layers at DROP II.
  patienceFactor: 1.0,
  // §82: ONE thing at a time. Both the patience clock and behaviour could fire
  // on consecutive ticks, so a fast flight unlocked three or four rungs inside
  // a second — heard as a burst of snares and bass rather than a track being
  // built. A rung now has to settle before the next one may land. The gap is
  // on the PACED clock, so speed still decides how fast a track is discovered
  // (§46): ~5.5s of real time at full speed, ~12s at a crawl. Seven layers
  // then stand complete around cycle 14, just before DROP I pays them off.
  rungGapMs: 3500,
  // §108 (user decision): the opening may come up twice as fast, so the gift
  // lands near the MIDDLE of its phase rather than at the end. You still have
  // most of the first half to go and earn it yourself, and a passive flight
  // fills up in half the time it did.
  patienceOfPhase: 0.45,
  groundAltitude: 8,
  airAltitude: 30,
  groundMs: 3500,
  bpmSlewPerSecond: 9,
  fullSpeed: 66,
  // §87: these decide how long a track TAKES. At 134 bpm a bar is 1.79s, so
  // the 32-cycle arc is 57s of musical time; the pace divides into that.
  // 0.64 gives ~90s of flight for a whole arc at full speed and ~3 minutes at
  // a crawl. The old 2.4 finished the entire production in 24 seconds, which
  // is why the phases went by without being heard.
  paceAtRest: 0.3,
  paceAtFullSpeed: 0.64,
  // Arriving in a world IS hearing it: the switch fires as soon as the region
  // reads as the new one, and lands on the next bar (§11). What stops a sweep
  // of the mouse from wiping your track is minTrackLifeMs, not a delay here.
  // §126: both of these are REAL-WORLD protections and are now measured on the
  // REAL clock. §87 spotted that the paced clock stretched them and answered by
  // shrinking the numbers — which fixed full throttle and left everything
  // slower than that broken, because the stretch is 1/pace: 4.0x hovering,
  // 3.3x at cruise, 1.6x at half. The FIRST crossing was always fast; every one
  // after it waited out this timer, so flying THROUGH worlds — the actual thing
  // the player does — was the slow case. Wrong unit, not a wrong number.
  regionSwitchMs: 70,
  // Long enough that a twitch of the mouse cannot wipe a track, short enough
  // that a deliberate turn is heard well inside the two seconds §126 promises.
  minTrackLifeMs: 1200,
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
  private lastDeepenMs = 0;
  /** §82: paced time the last rung (or depth) landed. */
  private lastRungMs = Number.NEGATIVE_INFINITY;
  /** §98: paced time the arc first allowed the next rung. */
  private dueSinceMs: number | null = null;
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
  /** §118: the reading of this world the current track is (genre, number). */
  get dna(): TrackDNA {
    return dnaFor(this.store.getState().genre, this.trackNumberValue);
  }

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
  /**
   * §119 (user decision): the curve keeps CLIMBING past `fullSpeed` instead of
   * saturating there. The top half of the throttle is not just travel — it
   * carries you through the arc faster too, all the way to twice the rate.
   *
   * This is safe in a way it would not have been before §87: the pace moves
   * the CLOCK, never the tempo. At 132 the phases go by in a minute instead of
   * ninety seconds, and every one of them still plays at 134 bpm with the same
   * notes in the same order. What sped a track UP musically — the tape, the
   * hat subdivision — is gone, so speed can be generous here.
   */
  pace(velocity: number): number {
    const { config } = this;
    const t = Math.min(2, Math.max(0, velocity / config.fullSpeed));
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
    this.lastDeepenMs = 0;
    // Nothing has landed yet, so the first rung is never made to wait (§82).
    this.lastRungMs = Number.NEGATIVE_INFINITY;
    this.dueSinceMs = null;
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
      // §87: hand over after DROP II, not after DROP I. A finished track used
      // to end at cycle 20, so DEEP FLIGHT, VOID and the finale never happened
      // for exactly the tracks that had earned them.
      if (!this.isComplete(track) || section !== 'return') return;
      this.handingOver = true;
      return;
    }
    if (section === 'return') return; // still in it — let the finale land
    this.startNextTrack(nowMs);
  }

  private isComplete(track: Readonly<TrackState>): boolean {
    const layers: TrackLayerName[] = [
      'kick', 'snare', 'hats', 'bass', 'harmony', 'melody', 'texture',
    ];
    // §123: seven of seven means seven of seven. The screen counts UNLOCKED
    // layers, so a player reads 7/7 as "this track is done" — but this used
    // to also demand every layer had grown DEEP, which lands a minute and a
    // half later, and then still waited for DROP II. Two and a half minutes
    // after the strip said finished. Depth still happens; it is no longer
    // what decides that a track is over.
    return layers.every((layer) => layerUnlocked(track, layer));
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
    // §58 (user decision): arriving somewhere new gives you its FIRST layer at
    // once — 4/7 of one world becomes 1/7 of the next, not 0/7. Without that
    // there is a hole where the new world should announce itself, and the
    // crossing reads as the music stopping instead of somewhere beginning.
    // §100 (was §58, travelled only): EVERY track opens on its first rung, at
    // once. Waiting for the arc to reach DISCOVERY I meant eleven seconds of
    // air at full speed and twenty at cruise before there was a beat — long
    // enough that a player cannot tell whether anything is coming.
    const first = ladderFor(bornIn)[0];
    if (first) this.unlock(first.layer, nowMs);
    this.activeMs = 0;
    this.lastDeepenMs = 0;
    this.lastRungMs = this.activeMs;
    this.dueSinceMs = null;
    this.lowRegisterMs = 0;
    this.groundMs = 0;
    this.layerVariations = {};
    this.harmony.reset();
    this.melody.reset();
    this.conversation.reset();
    this.arrangement.reset();
    this.awayMs = 0;
    this.trackStartedMs = nowMs;
    // §125: ARRIVING SOMEWHERE ANNOUNCES ITSELF. A track born by travelling
    // only ever emitted `track:new`, so everything listening for a world
    // change — the cue that calls its name, anything downstream — missed the
    // crossing entirely. You saw TRACK 02 and were never told where you were.
    if (travelled) this.bus.emit('track:genre', { genre: bornIn, atMs: nowMs });
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

    this.harmony.tick(nowMs);
    this.melody.tick(nowMs, flight.hz);

    // --- Fase 1: TEMPO. §91 (user decision): the WORLD owns the clock and
    // nothing else may move it. The player's own tapped rhythm used to take
    // over once it was confident, which meant the same world played at a
    // different tempo depending on what your hand had been doing — a track
    // that is being re-clocked underneath you is never quite the record you
    // built. Flying faster still develops the track faster (§46); it never
    // touches the clock.
    const placeBpm = moving ? regionBpm(genreGrammar(track.genre ?? this.dominant(affinity))) : 0;
    // An earned track keeps its clock through stillness.
    const targetBpm = placeBpm > 0 ? placeBpm : track.bpm;
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
    // §31/§103: call-and-response was Jazz's alone, and Jazz is gone. The
    // machinery stays (CallResponse is tested and cheap) but nothing asks for
    // it now — if a future world wants the world to answer a phrase, it turns
    // back on here.
    const responseNotes: number[] = [];

    // --- Fase 11: ARRANGEMENT. Movement becomes form (§29.7).
    // Where the player actually is — the next track will be born here (§47).
    this.lastRegion = this.dominant(affinity);
    // §53: fly into another world and stay there, and the world takes over:
    // the track you were building ends and a new one starts in this grammar.
    const away = this.lastRegion !== null && track.genre !== null && this.lastRegion !== track.genre;
    this.awayMs = away ? this.awayMs + delta : 0;
    const lived = nowMs - this.trackStartedMs;
    if (this.awayMs >= config.regionSwitchMs && lived >= config.minTrackLifeMs) {
      this.awayMs = 0;
      // §54: a world is a track. Arrive somewhere else and you start there —
      // from the first layer, at that world's tempo, with nothing carried over.
      this.startNextTrack(nowMs, 'travelled');
      return;
    }
    // The arrangement runs on the paced clock too: sections arrive sooner when
    // the player is moving through the world quickly.
    // §64/§92: a peak still needs a floor to take away — but the arc is now
    // what guarantees one, because it hands out the rungs itself. The old
    // guard also demanded sixty seconds of PACED track, which is longer than
    // the arc takes to reach DROP I: every flight would have stalled at the
    // end of PRESSURE for most of a second lap. What is left is the honest
    // question — have the rungs this phase promised actually landed.
    const earned = [
      track.drums.kick, track.drums.snare, track.drums.hats,
      track.bass, track.harmony, track.melody, track.texture,
    ].filter((layer) => layer.unlocked).length;
    const readyToPeak = earned >= rungsDueAt('build', ladderFor(genre));
    // §84: the arc walks in CYCLES of one bar at the track's own tempo, and
    // each world flies its own order through the eight phases (§61).
    this.arrangement.setStyle(genreGrammar(genre).sectionStyle);
    const barMs = nextBpm > 0 ? (4 * 60_000) / nextBpm : 1800;
    const section = this.arrangement.tick(
      this.paceClockMs,
      paced,
      flight.energy,
      readyToPeak,
      barMs,
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
      if (genre !== track.genre) {
        this.bus.emit('track:genre', { genre, atMs: nowMs });
        // §100: the FIRST track of a session is never born through
        // startNextTrack — the genre simply resolves — so it would have been
        // the one track that opened on silence. Arriving in a world always
        // gives you that world's first rung, at once.
        const opening = ladderFor(genre)[0];
        if (genre !== null && opening && !layerUnlocked(this.store.getState(), opening.layer)) {
          this.lastRungMs = this.activeMs;
          this.unlock(opening.layer, nowMs);
        }
      }
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
    // §92: the ARC decides how many rungs exist by now, so the build-up has
    // the same shape every flight. Two clocks used to run at once — the arc
    // on cycles, the ladder on patience — so a bass could land in DISCOVERY
    // and a kick in PRESSURE, which is not a track being assembled, it is a
    // mess. Behaviour and beacons still let you take a rung the moment its
    // phase opens; what they can no longer do is take it out of turn.
    const earnedRungs = ladder.filter((rung) => layerUnlocked(current, rung.layer)).length;
    // Only WIDTH is gated. Depth has to keep going once the arc has handed out
    // everything it owes, or a track stops growing the moment it is wide.
    const rungDue = earnedRungs < rungsDueAt(section, ladder);
    // §98: remember WHEN the world became willing, so patience can wait a
    // beat behind it. Without this the free rung landed the instant its phase
    // opened, and the beacon you flew to never actually gave you anything.
    if (rungDue && this.dueSinceMs === null) this.dueSinceMs = this.activeMs;
    if (!rungDue) this.dueSinceMs = null;
    // Behaviour earns the layer. The ladder time is only the world's patience
    // with a player who is doing nothing in particular (§29.3) — it must never
    // be the mechanism, or the track becomes a progress bar instead of a
    // consequence.
    // From the second track on the world is half as patient: you have shown you
    // know how to build one, so it comes to meet you (user decision).
    const patienceFactor =
      this.trackNumberValue === 1 ? config.patienceFactor : config.patienceFactor / 2;
    // §107: BEHAVIOUR IS THE MAIN ROAD, patience is the shoulder.
    //
    // The free rung used to arrive one rung-gap after its phase opened — about
    // 5.5s into a phase that lasts 7.2s. There was almost no window in which
    // what you DID made the difference, so the loop the game is built on
    // (fly → interact → create sound) had quietly become fly → arrive →
    // receive. The window is now most of the phase: you have three gaps to go
    // and get it, and only if you do nothing at all does the world hand it
    // over near the end.
    const offeredFreelyAt =
      (this.dueSinceMs ?? this.activeMs) + barMs * CYCLES_PER_PHASE * config.patienceOfPhase;
    const patience = step === null ? 0 : Math.max(step.atMs * patienceFactor, offeredFreelyAt);
    // §82: whatever earns it, a layer only lands once the previous one has had
    // room to be heard. Without this, patience and behaviour fired on
    // consecutive ticks and the track arrived in a lump.
    const settled = this.activeMs - this.lastRungMs >= config.rungGapMs;
    if (rungDue && step !== null && settled && (this.intent(step.layer) || this.activeMs >= patience)) {
      this.lastRungMs = this.activeMs;
      this.unlock(step.layer, nowMs);
      return;
    }

    // §32: a track also has to grow in DEPTH, not only in width. Staying in
    // the world stacks a second voice onto a layer you already earned — the
    // 808 body under the clap, the dirty saw under the sub — so a flight ends
    // on a produced track instead of a sketch.
    // §82: a second voice never lands on top of a new layer — but it keeps its
    // OWN interval and does not consume the rung slot, or depth would starve
    // width and a track would stop growing.
    if (settled && this.activeMs - this.lastDeepenMs >= config.deepenIntervalMs) {
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
      // High excitations. Height itself no longer earns this (§99).
      case 'hats':
        return this.highActions.length >= config.hatActionsNeeded;
      case 'snare':
        return this.strongActions.length >= config.clapActionsNeeded;
      case 'bass':
        return this.lowRegisterMs >= config.lowRegisterMs || this.groundMs >= config.groundMs * 2;
      case 'harmony':
        return this.harmony.discovered;
      case 'melody':
        return this.melody.discovered;
      // §99/§107: not by HOVERING — that taught nobody anything — but by the
      // one thing texture is: travelling through the register. Move through
      // real pitch space and the air fills in behind you.
      case 'texture':
        return this.melody.discovered && this.highActions.length >= config.hatActionsNeeded;
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

  /**
   * §98: the layer the world is willing to give RIGHT NOW — the next rung of
   * this world's ladder, but only once the arc has opened its phase.
   *
   * The beacon used to bypass that gate: everything else waited for its phase
   * while flying through a marker granted the rung out of turn. Two paths to
   * the same thing with different rules is how a build-up stops being
   * learnable. A beacon is now only PLACED when its rung is due, so flying to
   * one always works — the arc decides when the invitation exists, and the
   * player decides whether to take it.
   */
  offeredLayer(): TrackLayerName | null {
    const track = this.store.getState();
    const ladder = ladderFor(track.genre);
    const step = nextStep(track, ladder);
    if (step === null) return null;
    const earned = ladder.filter((rung) => layerUnlocked(track, rung.layer)).length;
    return earned < rungsDueAt(this.arrangement.current, ladder) ? step.layer : null;
  }

  /**
   * §86: a beacon was flown through, so that rung is earned NOW — the player
   * went and got it. It still has to be the next rung of this world's ladder,
   * or a world could be assembled out of order (§31.2), and it still respects
   * the §82 gap so two layers can never land on top of each other.
   */
  collectBeacon(layer: TrackLayerName, nowMs: number): boolean {
    if (this.offeredLayer() !== layer) return false;
    if (this.activeMs - this.lastRungMs < this.config.rungGapMs) return false;
    this.lastRungMs = this.activeMs;
    this.unlock(layer, nowMs);
    return true;
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
