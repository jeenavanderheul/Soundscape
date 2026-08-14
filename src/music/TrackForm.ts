import type { TrackGenre, TrackLayerName } from './TrackState';

/**
 * §128 TRACK FORM — the shape of a track, drawn instead of written.
 *
 * §118 gave every track its own SOUND (character, tilt, drive, space). What it
 * could not give was its own FORM: every world climbed the same seven rungs in
 * the same fixed order at the same seven timings — 0, 21, 35, 50, 64, 71, 78
 * seconds, in all six worlds, forever. A journey was infinite in number and
 * repetitive in shape.
 *
 * This draws the order and the pacing from the journey's own seed. Not a dice
 * roll: a shuffle that has to pass rules, because unconstrained order is
 * exactly the "dan is de bass er weer, dan komt er weer kick bij" the build
 * spent §80–§111 escaping. Detail before there is anything to hang it on is
 * not variety, it is mess. The rules below are the difference.
 *
 * Deterministic in (journey seed, world, track number): the same journey code
 * always writes the same tracks, so a flight that was good can be found again.
 */

export interface TrackForm {
  /** The seven rungs, in the order this particular track earns them. */
  order: readonly TrackLayerName[];
  /**
   * How wide this track's rungs sit, as a multiple of the base pacing. Below 1
   * is urgent, above 1 is a slow burn.
   */
  paceScale: number;
  /** For the strip and the export — what this reading of the world is called. */
  shape: string;
}

export const TRACK_LAYERS: readonly TrackLayerName[] = [
  'kick', 'snare', 'hats', 'bass', 'harmony', 'melody', 'texture',
];

/** Layers that carry no pulse: three of these in a row and the floor drops out. */
const MELODIC: ReadonlySet<TrackLayerName> = new Set(['harmony', 'melody', 'texture']);

/**
 * The base tempo of a world's build, as a multiple. This is the per-WORLD half
 * of the user's decision — PERCUSSION RIOT should feel urgent and VOID CRUSHER
 * should take its time, and that difference has to survive every track.
 */
const WORLD_PACE: Record<Exclude<TrackGenre, null>, number> = {
  'percussion-riot': 0.62,
  'broken-machine': 0.78,
  techno: 1,
  'heavy-signal': 1.12,
  'sub-pressure': 1.3,
  'void-crusher': 1.5,
};

/** Names for how wide a reading sits, so the strip can say what it is. */
const SHAPES: readonly { name: string; upTo: number }[] = [
  { name: 'sprint', upTo: 0.72 },
  { name: 'driving', upTo: 0.9 },
  { name: 'even', upTo: 1.12 },
  { name: 'patient', upTo: 1.4 },
  { name: 'slow burn', upTo: Infinity },
];

/** FNV-1a with an avalanche finalizer — §122: without it, neighbours correlate. */
function seedOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** A deterministic stream of numbers from one seed (xorshift32). */
function stream(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/**
 * THE RULES. Everything a shuffle must satisfy to be a build-up rather than a
 * pile. Each one exists because breaking it is audibly wrong, not because it
 * is tidy.
 */
export function isPlayableOrder(order: readonly TrackLayerName[]): boolean {
  const at = (layer: TrackLayerName) => order.indexOf(layer);
  // A pulse has to arrive early or the opening is ambient by accident. The
  // OPENING layer itself is free (user decision) — this only asks that some
  // drum is there by the second rung.
  if (Math.min(at('kick'), at('snare')) > 1) return false;
  // Dust needs a body to settle on: texture over nothing is noise.
  if (at('texture') < at('bass')) return false;
  // The floor cannot arrive last — six rungs of a track with no bottom.
  if (at('bass') > 4) return false;
  // All six worlds are built on a kick. A draw that put it seventh gave a
  // techno track that went six rungs without one, which reads as broken
  // rather than as a variation — the snare satisfying the pulse rule above is
  // not the same thing as the floor being there.
  if (at('kick') > 3) return false;
  // Three pitched layers in a row and the groove stops being built.
  for (let i = 0; i + 2 < order.length; i += 1) {
    if (MELODIC.has(order[i]!) && MELODIC.has(order[i + 1]!) && MELODIC.has(order[i + 2]!)) {
      return false;
    }
  }
  return true;
}

/**
 * §128: the form of track N of this world, on this journey.
 *
 * Track 1 of a journey is NOT special — §118 keeps the sound of a first track
 * plain so a player meets the world as written, but its shape may vary from
 * the very first flight, or a journey would open the same way every time.
 */
export function formFor(
  journeySeed: string,
  genre: TrackGenre,
  track: number,
): TrackForm {
  const base = seedOf(`${journeySeed}|${genre ?? 'void'}|${track}`);
  const next = stream(base);

  // Fisher-Yates until the rules pass. The valid orders are a large fraction
  // of the space, so this lands in a handful of tries; the cap only keeps a
  // future rule from turning a bad constraint into a hang.
  let order: TrackLayerName[] = [...TRACK_LAYERS];
  for (let attempt = 0; attempt < 200; attempt += 1) {
    order = [...TRACK_LAYERS];
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    if (isPlayableOrder(order)) break;
  }
  // Guaranteed-valid fallback, so this function cannot return a pile.
  if (!isPlayableOrder(order)) {
    order = ['kick', 'hats', 'snare', 'bass', 'harmony', 'melody', 'texture'];
  }

  // Pace: the world's own tempo, then this track's departure from it. ±35%
  // is wide enough to be heard as a different build and narrow enough that a
  // world keeps its character (user decision: per world AND per track).
  const world = genre === null ? 1 : WORLD_PACE[genre];
  const paceScale = Number((world * (0.65 + next() * 0.7)).toFixed(3));
  const shape = SHAPES.find((s) => paceScale <= s.upTo)!.name;
  return { order, paceScale, shape };
}
