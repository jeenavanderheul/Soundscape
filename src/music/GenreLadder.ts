import type { TrackGenre, TrackLayerName, TrackState } from './TrackState';

/**
 * §31: GENRE IS A COMPOSITIONAL GRAMMAR, NOT A PLAYLIST.
 *
 * This file used to carry a layer ORDER per genre as well as the timings, and
 * that order stopped being true at §128, when the order started being drawn per
 * track from the journey seed (`TrackForm`). The tables still said locked groove opens
 * on a kick; measured, it opened on a snare and the kick arrived third. Two
 * answers to one question is what §56 forbids, so the order is gone from here:
 * `TrackForm` says WHICH layer is next, this file says WHEN the world offers a
 * rung if the player has not earned it, and `WORLD_PACE` stretches the whole
 * curve to the world's own patience.
 *
 * A curve is seven arrival times in seconds of active roaming, and its SHAPE is
 * the world's character. They used to be one shape scaled six ways, so every
 * world built in the same rhythm at a different speed. What differs now is
 * where a world spends its waiting: up front, in the middle, or at the end.
 *
 * An earned layer is never taken away (user decision: layers persist and morph).
 */

export interface LadderStep {
  layer: TrackLayerName;
  /** Active roaming time at which this layer arrives on its own (§29.3). */
  atMs: number;
}

const seconds = (...values: number[]): readonly number[] => values.map((v) => v * 1000);

/**
 * THE MACHINE: even spacing that widens slightly. Nothing is hurried and
 * nothing is withheld — the reference curve the others are heard against.
 */
const LOCKED_GROOVE = seconds(3, 7, 11, 16, 23, 31, 40);

/**
 * THE REDLINE: everything arrives at once and then the world makes you wait
 * for the last two. Front-loaded, because this world is about pressure, not
 * patience.
 */
const HEAVY_SIGNAL = seconds(2, 4, 7, 11, 18, 25, 33);

/**
 * THE BROKEN MACHINE: irregular gaps. Two rungs land together, then nothing
 * for a while, then two more — the build itself stutters the way its rhythms do.
 */
const BROKEN_MACHINE = seconds(3, 5, 12, 15, 24, 28, 40);

/**
 * THE RIOT: dense and fast, everything inside the first half minute, then one
 * long tail. You are in it immediately and it keeps adding.
 */
const PERCUSSION_RIOT = seconds(2, 4, 6, 9, 14, 20, 33);

/**
 * SUB PRESSURE: slow to reveal, and the gaps GROW. Weight takes its time; the
 * last rung arrives long after you stopped waiting for it.
 */
const SUB_PRESSURE = seconds(4, 9, 15, 21, 28, 35, 44);

/**
 * THE VOID: the sparsest world, and it was the only one a cruising player never
 * heard finish — measured at 6 of 7 layers after three minutes, because its
 * curve was the shared one and `WORLD_PACE` then stretched it half again. The
 * curve is its own now and starts tighter, so the world still feels unhurried
 * while a track actually completes.
 */
const VOID_CRUSHER = seconds(3, 6, 10, 15, 20, 26, 34);

export const GENRE_CURVES: Record<Exclude<TrackGenre, null>, readonly number[]> = {
  'locked-groove': LOCKED_GROOVE,
  'sub-pressure': SUB_PRESSURE,
  'heavy-signal': HEAVY_SIGNAL,
  'broken-machine': BROKEN_MACHINE,
  'percussion-riot': PERCUSSION_RIOT,
  'void-crusher': VOID_CRUSHER,
};

/** The neutral void builds like LOCKED GROOVE: a pulse you can immediately feel. */
export function curveFor(genre: TrackGenre): readonly number[] {
  return genre === null ? LOCKED_GROOVE : GENRE_CURVES[genre];
}

export function layerUnlocked(track: Readonly<TrackState>, layer: TrackLayerName): boolean {
  if (layer === 'kick' || layer === 'hats' || layer === 'snare') return track.drums[layer].unlocked;
  return track[layer].unlocked;
}

/**
 * The only layer the world is currently willing to give. Everything earlier in
 * this track's order is already earned, so the track can only grow in the shape
 * this reading of the world was drawn with.
 */
export function nextStep(
  track: Readonly<TrackState>,
  ladder: readonly LadderStep[],
): LadderStep | null {
  return ladder.find((step) => !layerUnlocked(track, step.layer)) ?? null;
}
