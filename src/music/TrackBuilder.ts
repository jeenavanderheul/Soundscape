import { genreGrammar, hzToMidi, regionBpm } from '../audio/MusicalPrimitives';
import type { GenreAffinity } from './MusicState';
import type { EventBus } from '../core/EventBus';
import type { Store } from '../core/stores';
import type { ResonanceEvent } from '../resonance/ResonanceEvent';
import { ArrangementEngine, ARRANGEMENT_CONFIG, CYCLES_PER_PHASE, rungsDueAt } from './ArrangementEngine';
import { CallResponse } from './CallResponse';
import { curveFor, layerUnlocked, nextStep, type LadderStep } from './GenreLadder';
import {
  fixedFormFor,
  formFor,
  isPlayableOrder,
  stageRungs,
  TRACK_LAYERS,
  type TrackForm,
} from './TrackForm';
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
   * §205: how WIDE this build is written, as a multiple. 1 is the desktop
   * writing; a phone gets less, because one thumb cannot hold a straight line
   * at full throttle for the ninety seconds the desktop curve assumes.
   * Multiplies the ladder and the settling gap together, so patience and
   * spacing stay in the same proportion.
   */
  curveScale: number;
  /**
   * §205: the widest reading a track may be drawn with. The per-track draw is
   * ±35% on top of the world's own patience, and the top of that range is
   * exactly the track a phone never reaches the end of.
   */
  maxPaceScale: number;
  /**
   * §205: bars per phase of the arc (§84). This is the real ceiling on a whole
   * track — the seventh rung is not DUE until `deep`, five phases in — so a
   * shorter ladder alone changes nothing.
   */
  cyclesPerPhase: number;
  /**
   * §207: one fixed opening per world instead of a fresh draw per track. On a
   * desk the draw is the point — no two journeys build the same way. In a hand,
   * for two minutes, a player needs the world to be the same shape every time
   * they arrive, or there is nothing to learn.
   */
  fixedOrderPerWorld: boolean;
  /**
   * §207: the build carries on while you are not flying. Speed still decides
   * how FAST (§46) — this only says it never stops.
   */
  clockRunsAtRest: boolean;
  /**
   * §207: crossing into another world changes the colour, never the count. The
   * desktop rule (§53/§54) is that a world is a track, so arriving somewhere
   * else starts you at 1/7. On a phone that is most of what you ever hear.
   */
  keepsTrackAcrossWorlds: boolean;
  /**
   * §207: at 7/7 nothing may be taken away again. The arc's next phase after
   * the seventh rung lands is `break`, which pulls the drums to 0.4 and the
   * bass to 0.35 — so the moment the track was finally whole was the moment
   * its bottom left. The desktop hears it come back in DROP II; a phone was
   * never getting there.
   */
  holdsFullMixWhenComplete: boolean;
  /**
   * §209: paced ms between rungs, evenly. 0 keeps the world's written curve.
   *
   * The curve's SHAPE is a world's character — where it makes you wait. On a
   * phone it produced a 29-second hole between 3/7 and 4/7 and then four rungs
   * in seventeen seconds, because the ladder and the arc were both deciding.
   * An even step is the thing a two-minute session can actually be built on.
   */
  rungIntervalMs: number;
  /**
   * §209: whether the arc may withhold a rung whose phase it has not reached
   * (§92). Two clocks decided a rung; on a phone they came apart, and §56 says
   * there is only ever one authority.
   */
  arcGatesRungs: boolean;
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
  // §127: at 11_000 a track ALWAYS died before its last three layers had grown
  // their second voice — harmony, melody and texture reached LEVEL_DEEP in no
  // world, in no track, ever. The doubled voices §32 built (the 808 body under
  // the clap, the saw under the sub) were unreachable content. A track lives
  // long enough for seven deepenings at 7500 when flown fast; 5000 also holds at
  // a crawl, where the same track has fewer real seconds to spend.
  deepenIntervalMs: 5000,
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
  curveScale: 1,
  maxPaceScale: Infinity,
  cyclesPerPhase: CYCLES_PER_PHASE,
  fixedOrderPerWorld: false,
  clockRunsAtRest: false,
  // §213 (user decision): the stage draw is EVERYWHERE now, so this is on for
  // the desktop too. It retires §53/§54 — "a world is a track" — which had
  // crossing end the track you were building and start a clean one. What
  // replaces it is §208's festival: you walk onto a set that is already
  // running, at a drawn point in its build. A track still ENDS the way it
  // always did, by being finished (§87 hands over after DROP II); it just no
  // longer ends because you turned.
  keepsTrackAcrossWorlds: true,
  holdsFullMixWhenComplete: false,
  rungIntervalMs: 0,
  arcGatesRungs: true,
  // §108 (user decision): the opening may come up twice as fast, so the gift
  // lands near the MIDDLE of its phase rather than at the end. You still have
  // most of the first half to go and earn it yourself, and a passive flight
  // fills up in half the time it did.
  patienceOfPhase: 0.45,
  // Rescaled with the world alongside AIR_ALTITUDE (was 8 and 30, set when the
  // sky was 70 units tall). Skimming stays a deliberately tight band — you have
  // to mean it — and the height that earns the airy layers sits below the point
  // where the filter is fully open, so the layer arrives while the sound is
  // still opening rather than after it has finished.
  groundAltitude: 30,
  airAltitude: 150,
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

/**
 * §205: THE SAME TRACK, WRITTEN NARROWER, FOR ONE THUMB.
 *
 * A phone plays the identical composition — same seven layers, same drawn
 * order, same grammar and tempo. What changes is how much flying it costs to
 * hear all of it. On a desktop that is W held down while the mouse steers; on
 * a phone one thumb does both, so it comes off constantly and the paced clock
 * (§46) falls back to its floor every time.
 *
 * Measured before: locked groove reached its seventh layer at 85 seconds of
 * unbroken full throttle, and 155 on the widest draw. A phone session is not
 * that, so a third of every world's voices were content nobody on a phone ever
 * heard — the same failure §185 fixed for the void, arriving through a
 * different door.
 */
export const MOBILE_TRACK_PACING: TrackBuilderConfig = {
  ...TRACK_BUILDER_CONFIG,
  curveScale: 0.6,
  // No slow burns. The draw still varies the reading track to track — it just
  // stops at the width a thumb can fly to the end of.
  maxPaceScale: 0.95,
  // Three bars a phase instead of four. The arc keeps all eight phases in the
  // same order, so nothing is skipped; each one is simply a bar shorter.
  cyclesPerPhase: 3,
  // §207 (user decision): on a phone the mechanics get out of the way. ONE
  // build, 1/7 to 7/7, in the world's own fixed order, that never restarts and
  // never loses what it has earned. Everything below this line overrules a
  // rule the desktop keeps.
  fixedOrderPerWorld: true,
  clockRunsAtRest: true,
  keepsTrackAcrossWorlds: true,
  holdsFullMixWhenComplete: true,
  // §209: one clock, even steps. The first rung is the arrival itself, so rung
  // N sits at N-1 intervals: 4.8 s of paced time is 7.5 s of real flying and
  // 16 s at rest, putting 7/7 at ~45 s and ~96 s — the same totals §205
  // measured, but arriving one at a time, evenly, instead of in a lump.
  rungIntervalMs: 4800,
  arcGatesRungs: false,
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
/** §208: a layer as it stands on a stage you just walked onto, or does not. */
const layerAt = (standing: boolean): { unlocked: boolean; level: number } =>
  standing ? { unlocked: true, level: LEVEL_EARNED } : { unlocked: false, level: 0 };

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
  /** Last pitch-class root seen, so only a CHANGE of tone claims the key. */
  private lastPitchRoot: number | null = null;
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
  /** §128: the shape THIS track was drawn with — order and pacing. */
  private form: TrackForm | null = null;
  private formKey = '';



  private lastRegion: TrackGenre = null;
  /** Paced time spent inside a region that is not this track's own (§53). */
  private awayMs = 0;
  private trackNumberValue = 1;
  private turn = 0;
  /** §208: how many stages the player has walked onto this session. */
  private crossings = 0;
  /**
   * §215 (user decision): has this player ever actually flown?
   *
   * Until they have, turning on the spot is not travelling — it is choosing
   * where to start. A festival has not begun for someone standing at the gate.
   */
  private hasEverFlown = false;
  private layerVariations: LayerVariations = {};
  /** True once the finished track has reached a drop and is waiting to hand over. */
  private handingOver = false;
  readonly conversation = new CallResponse();
  readonly harmony = new HarmonyEngine();
  readonly melody = new MelodyTracker();
  readonly arrangement: ArrangementEngine;
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
  ) {
    // §205: the arc has to be written as narrow as the ladder, or the phone's
    // shorter ladder just waits for a phase that has not opened yet.
    this.arrangement = new ArrangementEngine({
      ...ARRANGEMENT_CONFIG,
      cyclesPerPhase: config.cyclesPerPhase,
    });
  }

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
    this.lastPitchRoot = null;
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

  /**
   * §208 (user decision, phone only): you did not restart the music — you
   * walked to another stage, and that one has been running without you.
   *
   * What stands when you arrive is the first N rungs of THIS world's order, and
   * N is what `stageRungs` says the night is at. It can be fewer than you were
   * carrying, and that is the point (user decision): a set that is always at
   * least as far along as the last one is not a set, it is your own progress
   * wearing six costumes. Inside a world the count still only ever climbs.
   */
  private arriveMidSet(genre: TrackGenre, nowMs: number, rungs: number | null = null): void {
    let wanted = rungs;
    if (wanted === null) {
      this.crossings += 1;
      wanted = stageRungs(this.seed, this.crossings);
    }
    const standing = new Set(this.ladder(genre).slice(0, wanted).map((step) => step.layer));
    const before = this.store.getState();
    this.store.setState((t) => ({
      ...t,
      genre,
      // §126: a stage you walk onto is playing at ITS tempo, and you hear that
      // the moment you arrive. Slewing (§ bpmSlewPerSecond) is for a track
      // being carried into another grammar; this is a different set entirely.
      bpm: genre === null ? t.bpm : regionBpm(genreGrammar(genre)),
      drums: {
        kick: layerAt(standing.has('kick')),
        snare: layerAt(standing.has('snare')),
        hats: layerAt(standing.has('hats')),
      },
      bass: layerAt(standing.has('bass')),
      harmony: layerAt(standing.has('harmony')),
      melody: layerAt(standing.has('melody')),
      texture: layerAt(standing.has('texture')),
    }));
    // The §82 settling gap starts again here: the set you joined has just been
    // handed to you whole, and the next rung is the first thing you earn on it.
    this.lastRungMs = this.activeMs;
    this.dueSinceMs = null;
    // §54 still holds, only about the STAGE now: this set has to be allowed to
    // exist before another world may take it, or circling a border would
    // re-draw it every second.
    this.trackStartedMs = nowMs;
    if (genre !== before.genre) this.bus.emit('track:genre', { genre, atMs: nowMs });
    // Only what is NEW is announced. Everything else was already playing when
    // you walked up, and a stage does not introduce what it started with.
    for (const layer of standing) {
      if (!layerUnlocked(before, layer)) this.bus.emit('track:layer', { layer, atMs: nowMs });
    }
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
    const first = this.ladder(bornIn)[0];
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
    // The opening rung is announced AFTER the handover, not before it. It was
    // emitted while the previous track was still the current one, so the event
    // stream read as that track earning an eighth layer — measured: locked groove
    // announced `hats` at 18s and again at 95.7s inside "track 1". Anything
    // labelling events by the track that is playing filed it under the wrong
    // one: the cue, the HUD, the strip.
    //
    // §189 (user): a stage you wander onto is ALREADY PLAYING. Crossing into a
    // region hands you its track mid-set — the first three rungs of ITS drawn
    // order standing at once (locked groove's world rule keeps the kick among
    // them), and the arc starting at the groove instead of an intro. Staying
    // somewhere keeps the full 1-of-7 climb: only travel gets the festival
    // arrival, or building would never mean anything.
    const opening = travelled ? this.ladder(bornIn).slice(0, 3) : first ? [first] : [];
    if (travelled) this.arrangement.beginMidSet();
    for (const step of opening) this.unlock(step.layer, nowMs);
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
    // §215: one real flight and the festival has started, for the rest of the
    // session. Standing still again later does not put you back at the gate.
    if (flight.velocity > 0.5) this.hasEverFlown = true;
    // §207: on a phone the build never stops — speed still decides how fast it
    // goes (§46), it no longer decides whether it goes at all. A thumb comes
    // off to steer, to point at something, to answer a message; the desktop
    // rule turns each of those into the track standing still.
    const active = config.clockRunsAtRest || moving || (music.bpm > 0 && music.tempoConfidence > 0.3);
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
    // §207: when the build runs at rest the clock has to exist at rest too, or
    // the unlock path below (`tempoExists`) never runs and the promise is empty.
    // §213: a track still keeps the grammar it was born in (§47) — what changed
    // is that ARRIVING somewhere recolours it in place instead of ending it.
    const heard = track.genre ?? this.dominant(affinity);
    const placeBpm = moving || config.clockRunsAtRest ? regionBpm(genreGrammar(heard)) : 0;
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
    //
    // The key belongs to the JOURNEY until the player takes it. This used to
    // assign the pitch-derived root every tick, which meant the related key a
    // finished track hands to the next one (§128, user decision) survived
    // exactly one tick before the player's resting 220 Hz stamped it back to
    // A — measured: three tracks deep in every world, root 45 throughout, the
    // whole journey in one key. Holding a tone is not choosing a key; TURNING
    // the wheel is. So the pitch only claims the root when its class changes.
    const pitchRoot = 36 + (((Math.round(hzToMidi(Math.max(music.pitchCenter, 20))) % 12) + 12) % 12);
    const rootMidi =
      this.lastPitchRoot !== null && pitchRoot !== this.lastPitchRoot ? pitchRoot : track.rootMidi;
    this.lastPitchRoot = pitchRoot;
    const intervals = this.harmony.chordIntervals();
    // While the melody is not earned, whatever is in there stays: on a fresh
    // track that is nothing, and on the next track of the journey it is the
    // motif carried over from the last one (user decision).
    const melodyNotes = track.melody.unlocked
      ? this.melody.phrase(rootMidi).map((n) => foldToRange(n, rootMidi + 24, rootMidi + 36))
      : track.melodyNotes;
    // §47 (user decision): a track keeps the grammar it was born in. Flying
    // from LOCKED GROOVE into Garage does not rewrite your locked groove track — the region
    // you are in when the NEXT track starts is what decides that one.
    // §47: a track keeps the grammar it was born in — unless §207 is on, where
    // the world you fly into recolours the track you are already building
    // instead of replacing it.
    const genre = heard;
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
      // §213: the world takes over WITHOUT ending what you have. §53/§54 used
      // to start a clean track here; now you walk onto that world's set, which
      // is already running at a drawn point in its own build (§208/§212).
      // Everything protecting the old rule still applies — a twitch across a
      // border cannot do this, because it has to be away for `regionSwitchMs`
      // and the stage you are on has to have lived `minTrackLifeMs`.
      if (config.keepsTrackAcrossWorlds) {
        // §215 (user decision): before the first flight, turning is not
        // travelling — it is picking which world to wake up in. The genre
        // follows your look and the build stays at 1/7, so a player who is
        // still deciding cannot be handed four rungs of somewhere by looking
        // around. The draw starts the moment they do.
        this.arriveMidSet(this.lastRegion, nowMs, this.hasEverFlown ? null : 1);
        return;
      }
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
    const readyToPeak = earned >= rungsDueAt('build', this.ladder(genre));
    // §84: the arc walks in CYCLES of one bar at the track's own tempo, and
    // each world flies its own order through the eight phases (§61).
    this.arrangement.setStyle(genreGrammar(genre).sectionStyle);
    const barMs = nextBpm > 0 ? (4 * 60_000) / nextBpm : 1800;
    const walked = this.arrangement.tick(
      this.paceClockMs,
      paced,
      flight.energy,
      readyToPeak,
      barMs,
    );
    // §207: once all seven are standing, the arc may keep walking — the
    // variations still evolve underneath — but the MIX stops changing. `return`
    // is the one phase that has everything at full; every other one after
    // `deep` takes something away, and on a phone that lands exactly when the
    // player has finally got a whole track.
    const section =
      config.holdsFullMixWhenComplete && earned === 7 ? ('return' as const) : walked;

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
        // §209: this only ever fires for the FIRST world of a session, where
        // the genre resolves out of nothing — every later change of world is a
        // crossing and goes through the arrival gate above. The first world is
        // not walked onto, it is where you woke up, so it opens at 1/7.
        const opening = this.ladder(genre)[0];
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
    // §207: a phone's track is not handed over. Reaching 7/7 is the end of the
    // build, and what you built keeps playing.
    if (!config.holdsFullMixWhenComplete) this.advanceJourney(nowMs, section);

    // --- The unlock ladder (§29.2, §31): the REGION decides the composition
    // order. Only the next step of this genre's ladder can be earned, so a
    // track always emerges layer by layer in its own grammar.
    if (!tempoExists) return;
    const current = this.store.getState();
    // §128: the drawn order is where a track STARTS, not what it must be. Fly
    // low and the kick comes forward; travel the register and the air does.
    // This is the authorship the build kept promising: your flying shapes the
    // form, not only how fast you climb someone else's.
    this.pullIntentForward(current, genre);
    const ladder = this.ladder(genre);
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
    const rungDue = !config.arcGatesRungs || earnedRungs < rungsDueAt(section, ladder);
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
    // §128: a patient form waits further into its phase before the world
    // gives a rung away; an urgent one hands it over early. Clamped under the
    // phase, or the gift would land after the phase it belongs to.
    const formPace = this.formOf(genre).paceScale;
    const offeredFreelyAt =
      (this.dueSinceMs ?? this.activeMs)
      + barMs * config.cyclesPerPhase * Math.min(0.9, config.patienceOfPhase * formPace);
    // §209: on an even ladder the step time IS the answer. Mixing in the arc's
    // phase window is what let the two clocks disagree in the first place.
    const patience =
      step === null
        ? 0
        : config.rungIntervalMs > 0
          ? step.atMs
          : Math.max(step.atMs * patienceFactor, offeredFreelyAt);
    // §82: whatever earns it, a layer only lands once the previous one has had
    // room to be heard. Without this, patience and behaviour fired on
    // consecutive ticks and the track arrived in a lump.
    const settled =
      this.activeMs - this.lastRungMs >= config.rungGapMs * formPace * config.curveScale;
    // §209: on an even ladder the CLOCK is the only thing that lands a rung.
    // Behaviour could otherwise pull each one forward to the settling gap, and
    // seven layers arriving in nineteen seconds is not a build either.
    const earnedNow =
      config.rungIntervalMs > 0
        ? this.activeMs >= patience
        : this.intent(step?.layer ?? 'kick') || this.activeMs >= patience;
    if (rungDue && step !== null && settled && earnedNow) {
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
    // §128: the FORM paces the build, never the depth. Letting a patient form
    // stretch this gate too cost slow worlds their last second voices — the
    // very content §127 had just made reachable. Depth keeps its own steady
    // cadence and only waits for the §82 rule that two things never land at
    // once, measured on the unstretched gap.
    const roomForDepth = this.activeMs - this.lastRungMs >= config.rungGapMs;
    if (roomForDepth && this.activeMs - this.lastDeepenMs >= config.deepenIntervalMs) {
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


  /**
   * §128: the rungs of the CURRENT track, in the order this journey drew for
   * it. The written ladder (GenreLadder) is still the base CURVE — how much
   * patience each successive rung gets — but which layer sits on which rung is
   * drawn per track, and the whole curve is stretched by the form's pace.
   */
  private ladder(genre: TrackGenre): readonly LadderStep[] {
    const form = this.formOf(genre);
    const curve = curveFor(genre);
    return form.order.map((layer, index) => ({
      layer,
      // §209: an even step, or the world's own curve stretched by its patience.
      atMs:
        this.config.rungIntervalMs > 0
          ? index * this.config.rungIntervalMs
          : Math.round((curve[index] ?? 40_000) * form.paceScale * this.config.curveScale),
    }));
  }

  /** Redrawn whenever the world or the track number changes, never per tick. */
  private formOf(genre: TrackGenre): TrackForm {
    const key = `${genre ?? 'void'}|${this.trackNumberValue}`;
    if (key !== this.formKey || this.form === null) {
      this.formKey = key;
      this.form = this.config.fixedOrderPerWorld
        ? fixedFormFor(genre)
        : formFor(this.seed, genre, this.trackNumberValue, this.config.maxPaceScale);
    }
    return this.form;
  }

  /** The current track's shape, for the strip and the export. */
  get shape(): string {
    return this.form?.shape ?? 'even';
  }

  /** §128: the order this track is actually climbing, after any pull-forward. */
  get order(): readonly TrackLayerName[] {
    return this.form?.order ?? TRACK_LAYERS;
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


  /**
   * §128: a layer you are clearly asking for jumps the queue — but only if the
   * build still reads as a build afterwards. The rules that make a drawn order
   * playable are the same ones that decide whether you may bend it, so no
   * amount of deliberate flying can assemble a pile.
   */
  private pullIntentForward(track: Readonly<TrackState>, genre: TrackGenre): void {
    const form = this.formOf(genre);
    const next = form.order.find((layer) => !layerUnlocked(track, layer));
    if (next === undefined) return;
    const wanted = form.order.find(
      (layer) => layer !== next && !layerUnlocked(track, layer) && this.intent(layer),
    );
    if (wanted === undefined) return;
    const rest = form.order.filter((layer) => layer !== wanted);
    const at = rest.indexOf(next);
    const reordered = [...rest.slice(0, at), wanted, ...rest.slice(at)];
    if (!isPlayableOrder(reordered, this.store.getState().genre)) return;
    this.form = { ...form, order: reordered };
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
    const ladder = this.ladder(track.genre);
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
    const gap =
      this.config.rungGapMs
      * this.formOf(this.store.getState().genre).paceScale
      * this.config.curveScale;
    if (this.activeMs - this.lastRungMs < gap) return false;
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
