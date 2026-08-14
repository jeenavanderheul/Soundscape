import type { TrackGenre, TrackLayerName, TrackState } from './TrackState';

/**
 * §31: GENRE IS A COMPOSITIONAL GRAMMAR, NOT A PLAYLIST.
 *
 * Every genre builds a track in its own order. Techno starts from a pulse and
 * stacks on top of it; Ambient starts from space and may never earn a kick;
 * Jazz starts from harmony because the conversation needs something to talk
 * about; Drum & Bass starts from the sub and the break. The player still earns
 * every layer through flight — the region only decides WHICH layer is next and
 * how long the world waits before offering it.
 *
 * An earned layer is never taken away (user decision: layers persist and morph).
 * Flying from Techno into DnB keeps the kick you built and rewrites it as a
 * break; the ladder simply continues in the new order from whatever is left.
 */

export interface LadderStep {
  layer: TrackLayerName;
  /** Active roaming time at which this layer arrives on its own (§29.3). */
  atMs: number;
}

/** Techno: repetition creates the machine — the pulse comes first. */
const TECHNO: readonly LadderStep[] = [
  { layer: 'kick', atMs: 3000 },
  { layer: 'hats', atMs: 7000 },
  { layer: 'snare', atMs: 11_000 },
  { layer: 'bass', atMs: 16_000 },
  { layer: 'harmony', atMs: 23_000 },
  { layer: 'melody', atMs: 31_000 },
  { layer: 'texture', atMs: 40_000 },
];

/**
 * §108: this world OPENS ON HATS, not on texture.
 *
 * Its preset lists atmosphere first, and that was taken literally — the first
 * rung was `texture`. But §94 made the air of a world free, so that rung spent
 * itself on the bytebeat and arriving gave you no RHYTHM at all: the first
 * beat waited for rung two, most of a minute in. A world has to sound like
 * something the moment you get there (§100), and for this one that is the
 * shuffle. Texture moves to the end, where it is the last thing that finishes
 * the track rather than the first thing that fails to start it.
 */
const SUB_PRESSURE: readonly LadderStep[] = [
  { layer: 'hats', atMs: 3000 },
  { layer: 'kick', atMs: 7000 },
  { layer: 'snare', atMs: 11_000 },
  { layer: 'bass', atMs: 15_000 },
  { layer: 'harmony', atMs: 20_000 },
  { layer: 'melody', atMs: 27_000 },
  { layer: 'texture', atMs: 35_000 },
];
export const GENRE_LADDERS: Record<Exclude<TrackGenre, null>, readonly LadderStep[]> = {
  techno: TECHNO,
  'sub-pressure': SUB_PRESSURE,
};

/** The neutral void builds like Techno: a pulse you can immediately feel. */
export function ladderFor(genre: TrackGenre): readonly LadderStep[] {
  return genre === null ? TECHNO : GENRE_LADDERS[genre];
}

export function layerUnlocked(track: Readonly<TrackState>, layer: TrackLayerName): boolean {
  if (layer === 'kick' || layer === 'hats' || layer === 'snare') return track.drums[layer].unlocked;
  return track[layer].unlocked;
}

/**
 * The only layer the world is currently willing to give. Everything earlier in
 * this genre's order is already earned, so the track can only grow in the
 * grammar of the region the player is flying through.
 */
export function nextStep(
  track: Readonly<TrackState>,
  ladder: readonly LadderStep[],
): LadderStep | null {
  return ladder.find((step) => !layerUnlocked(track, step.layer)) ?? null;
}
