/**
 * §29.4: TrackState — WHAT is actually in the track, as opposed to MusicState
 * (how the music behaves). Serializable, saved, and visualized by the world.
 * Phase 1-3 scope: tempo + the drum layers. Bass/harmony/melody/texture/form
 * slots exist so later phases extend rather than reshape the contract.
 */

export interface PatternState {
  unlocked: boolean;
  /** 0..1 intensity/density of the layer once unlocked. */
  level: number;
}

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
  /** §29.7 arrangement section; 'none' until the ArrangementEngine phase. */
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
    form: 'none',
  };
}

export type TrackLayerName = 'kick' | 'hats' | 'snare' | 'bass' | 'harmony' | 'melody' | 'texture';

export type TrackEvents = {
  /** Emitted once when a layer unlocks (§29.3): audible + visual + one word. */
  'track:layer': { layer: TrackLayerName; atMs: number };
};
