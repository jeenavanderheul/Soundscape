/**
 * §29.4: TrackState — WHAT is actually in the track, as opposed to MusicState
 * (how the music behaves). Serializable, saved, and visualized by the world.
 */

export interface PatternState {
  unlocked: boolean;
  /**
   * How complete this layer is: LEVEL_EARNED once the player has it,
   * LEVEL_DEEP once staying in the world has grown its second voice (§32).
   */
  level: number;
}

/** A layer just earned: one voice, the part itself. */
export const LEVEL_EARNED = 0.5;
/** A layer grown into a produced part: body + detail stacked (§32). */
export const LEVEL_DEEP = 1;

/**
 * §103 (user decision): TWO worlds. The compass has carried only techno and
 * SUB PRESSURE since §81, so the other nine grammars were unreachable code
 * that still had to be maintained, audited and kept green. They are in git at
 * tag `soundopbouw-14aug` if they are ever wanted back.
 */
export type TrackGenre =
  | 'techno'
  | 'sub-pressure'
  | 'heavy-signal'
  | 'broken-machine'
  | 'percussion-riot'
  | 'void-crusher'
  | null;

export interface TrackState {
  bpm: number;
  meter: string;
  drums: {
    kick: PatternState;
    snare: PatternState;
    hats: PatternState;
  };
  bass: PatternState;
  harmony: PatternState;
  melody: PatternState;
  texture: PatternState;
  /** Root of everything harmonic, as a midi note (§3.6). */
  rootMidi: number;
  /** Semitone offsets above the root that the player's resonances built. */
  harmonyIntervals: number[];
  /** The remembered phrase (midi notes) traced through pitch space (§3.5). */
  melodyNotes: number[];
  /** §31 Jazz: the world's answer to that phrase, empty when it is the player's turn. */
  responseNotes: number[];
  /** Grammar currently rewriting the track (§29.5); null = neutral. */
  genre: TrackGenre;
  /** §29.7 arrangement section. */
  /**
   * §84: the eight phases of the FLIGHT arc, in the order they are flown.
   * The names are the old ones because they are what the mixes and the genre
   * styles are written against; `sectionLabel()` gives the word the player
   * reads. intro=ENTER BIOME, groove=DISCOVERY I, discovery=DISCOVERY II,
   * build=PRESSURE, drop=DROP I, deep=DEEP FLIGHT, break=VOID, return=DROP II.
   */
  form:
    | 'none'
    | 'intro'
    | 'groove'
    | 'discovery'
    | 'build'
    | 'drop'
    | 'deep'
    | 'break'
    | 'return'
    | 'mutation';
}

const locked = (): PatternState => ({ unlocked: false, level: 0 });

export function createInitialTrackState(): TrackState {
  return {
    bpm: 0,
    meter: '4/4',
    drums: { kick: locked(), snare: locked(), hats: locked() },
    bass: locked(),
    harmony: locked(),
    melody: locked(),
    texture: locked(),
    rootMidi: 45, // A2
    harmonyIntervals: [0],
    melodyNotes: [],
    responseNotes: [],
    genre: null,
    form: 'none',
  };
}

export type TrackLayerName = 'kick' | 'hats' | 'snare' | 'bass' | 'harmony' | 'melody' | 'texture';

/**
 * How much track there is, 0 (a single tone) to 1 (all seven layers grown deep).
 * The orb reads this and becomes the track it is building (§29.6).
 */
export function trackGrowth(track: Readonly<TrackState>): number {
  const layers = [
    track.drums.kick,
    track.drums.snare,
    track.drums.hats,
    track.bass,
    track.harmony,
    track.melody,
    track.texture,
  ];
  const total = layers.reduce((sum, layer) => sum + Math.min(LEVEL_DEEP, Math.max(0, layer.level)), 0);
  return total / (layers.length * LEVEL_DEEP);
}

export type TrackEvents = {
  /** Emitted once when a layer unlocks (§29.3): audible + visual + one word. */
  'track:layer': { layer: TrackLayerName; atMs: number };
  /** Emitted when a layer grows its second voice (§32). */
  'track:depth': { layer: TrackLayerName; atMs: number };
  /** Emitted when the world's grammar changes region (§29.5). */
  'track:genre': { genre: TrackGenre; atMs: number };
  /** Emitted when a finished track hands over to the next one (endless journey). */
  'track:new': { number: number; atMs: number };
  /** Emitted when the arrangement moves to a new section (§29.7). */
  'track:section': { section: TrackState['form']; atMs: number };
};
