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

export type TrackGenre = 'techno' | 'ambient' | 'jazz' | 'dnb' | 'experimental' | null;

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
  form: 'none' | 'intro' | 'groove' | 'build' | 'drop' | 'break' | 'return' | 'mutation';
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

export type TrackEvents = {
  /** Emitted once when a layer unlocks (§29.3): audible + visual + one word. */
  'track:layer': { layer: TrackLayerName; atMs: number };
  /** Emitted when a layer grows its second voice (§32). */
  'track:depth': { layer: TrackLayerName; atMs: number };
  /** Emitted when the world's grammar changes region (§29.5). */
  'track:genre': { genre: TrackGenre; atMs: number };
  /** Emitted when the arrangement moves to a new section (§29.7). */
  'track:section': { section: TrackState['form']; atMs: number };
};
