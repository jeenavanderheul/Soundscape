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
 * Ambient: space becomes music. Texture and harmony open the world; drums are
 * the last thing to arrive and stay distant, so the region reads as air rather
 * than as a slow techno track.
 */
const AMBIENT: readonly LadderStep[] = [
  { layer: 'texture', atMs: 3000 },
  { layer: 'harmony', atMs: 9000 },
  { layer: 'bass', atMs: 15_000 },
  { layer: 'melody', atMs: 24_000 },
  { layer: 'hats', atMs: 38_000 },
  { layer: 'kick', atMs: 55_000 },
  { layer: 'snare', atMs: 80_000 },
];

/** Jazz: music as conversation — harmony first, so there is something to answer. */
const JAZZ: readonly LadderStep[] = [
  { layer: 'harmony', atMs: 3000 },
  { layer: 'bass', atMs: 8000 },
  { layer: 'hats', atMs: 12_000 },
  { layer: 'kick', atMs: 16_000 },
  { layer: 'melody', atMs: 21_000 },
  { layer: 'snare', atMs: 27_000 },
  { layer: 'texture', atMs: 40_000 },
];

/** Drum & Bass: velocity becomes rhythm — the sub and the break lead. */
const DNB: readonly LadderStep[] = [
  { layer: 'bass', atMs: 3000 },
  { layer: 'snare', atMs: 7000 },
  { layer: 'kick', atMs: 10_000 },
  { layer: 'hats', atMs: 14_000 },
  { layer: 'texture', atMs: 22_000 },
  { layer: 'harmony', atMs: 30_000 },
  { layer: 'melody', atMs: 38_000 },
];

/** Experimental: mutation — an irregular pulse against texture, harmony last. */
const EXPERIMENTAL: readonly LadderStep[] = [
  { layer: 'kick', atMs: 4000 },
  { layer: 'texture', atMs: 8000 },
  { layer: 'hats', atMs: 12_000 },
  { layer: 'bass', atMs: 18_000 },
  { layer: 'melody', atMs: 26_000 },
  { layer: 'snare', atMs: 33_000 },
  { layer: 'harmony', atMs: 42_000 },
];

/** UK Garage: displacement. The shuffle comes first, the kick answers it. */
const GARAGE: readonly LadderStep[] = [
  { layer: 'hats', atMs: 3000 },
  { layer: 'kick', atMs: 7000 },
  { layer: 'snare', atMs: 10_000 },
  { layer: 'bass', atMs: 14_000 },
  { layer: 'harmony', atMs: 21_000 },
  { layer: 'melody', atMs: 28_000 },
  { layer: 'texture', atMs: 38_000 },
];

/** House: warmth. Four to the floor, then the hands. */
const HOUSE: readonly LadderStep[] = [
  { layer: 'kick', atMs: 3000 },
  { layer: 'hats', atMs: 7000 },
  { layer: 'harmony', atMs: 12_000 },
  { layer: 'snare', atMs: 16_000 },
  { layer: 'bass', atMs: 20_000 },
  { layer: 'melody', atMs: 28_000 },
  { layer: 'texture', atMs: 38_000 },
];

/** Trap: weight. The low end arrives before anything else. */
const TRAP: readonly LadderStep[] = [
  { layer: 'bass', atMs: 3000 },
  { layer: 'kick', atMs: 7000 },
  { layer: 'hats', atMs: 11_000 },
  { layer: 'snare', atMs: 15_000 },
  { layer: 'melody', atMs: 22_000 },
  { layer: 'harmony', atMs: 30_000 },
  { layer: 'texture', atMs: 40_000 },
];

/** Dub: echo. The bass and the space, long before any pattern. */
const DUB: readonly LadderStep[] = [
  { layer: 'bass', atMs: 3000 },
  { layer: 'texture', atMs: 8000 },
  { layer: 'kick', atMs: 13_000 },
  { layer: 'harmony', atMs: 19_000 },
  { layer: 'snare', atMs: 26_000 },
  { layer: 'melody', atMs: 33_000 },
  { layer: 'hats', atMs: 44_000 },
];

/** Classical: orchestration. Harmony and melody carry it; percussion is rare. */
const CLASSICAL: readonly LadderStep[] = [
  { layer: 'harmony', atMs: 3000 },
  { layer: 'melody', atMs: 9000 },
  { layer: 'bass', atMs: 15_000 },
  { layer: 'texture', atMs: 24_000 },
  { layer: 'kick', atMs: 36_000 },
  { layer: 'hats', atMs: 60_000 },
  { layer: 'snare', atMs: 85_000 },
];

export const GENRE_LADDERS: Record<Exclude<TrackGenre, null>, readonly LadderStep[]> = {
  techno: TECHNO,
  ambient: AMBIENT,
  jazz: JAZZ,
  dnb: DNB,
  experimental: EXPERIMENTAL,
  garage: GARAGE,
  house: HOUSE,
  trap: TRAP,
  dub: DUB,
  classical: CLASSICAL,
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
