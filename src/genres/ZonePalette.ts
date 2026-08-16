import { sectorIndex, worldForHeading } from './GenreZones';
import type { GenreAffinity } from '../music/MusicState';

/**
 * §33: every direction is a different place, and you can SEE it. Each compass
 * genre owns a colour and a landscape character; both blend continuously with
 * the same cosine lobes the music uses (§31), so flying north-east really is
 * halfway between two regions — in the fog, in the terrain, on the horizon.
 *
 * Pure data + pure maths: no Three.js here, so this stays testable.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface ZoneLook {
  color: Rgb;
  /** 0..1 how mountainous this region is — the horizon you fly toward. */
  relief: number;
  /** 0..1 how thick the air is. */
  haze: number;
}

/** The void: cold, flat, almost colourless. Everything grows out of this. */
export const NEUTRAL_LOOK: ZoneLook = {
  color: { r: 0.16, g: 0.2, b: 0.24 },
  relief: 0.12,
  haze: 0.25,
};

/** One identity per grammar, from the poster palette. */
export const GENRE_LOOKS: Record<keyof GenreAffinity, ZoneLook> = {
  /**
   * §174 (user): every world gets a colour you cannot mistake for another
   * one, and the RIG carries it — a red world has red lamps.
   *
   * Two of these used to be the same colour in practice: heavy-signal at
   * (1.0, 0.52, 0.16) and percussion-riot at (0.86, 0.62, 0.18) are both
   * orange, six degrees of hue apart, and nobody flying between them could
   * tell. The six are now spread around the wheel on purpose, and the pairs
   * that could be confused are the ones furthest apart.
   */
  // Machine red: hard, hot, industrial.
  'locked-groove': { color: { r: 1.0, g: 0.1, b: 0.08 }, relief: 0.85, haze: 0.2 },
  // Deep blue: mass, pressure, the bottom of the water.
  'sub-pressure': { color: { r: 0.05, g: 0.32, b: 0.95 }, relief: 0.92, haze: 0.58 },
  // Overheated metal, pushed all the way to the yellow end: at orange it sat
  // 25 degrees from locked groove's red, and two worlds 25 degrees apart are one
  // world with a mood swing.
  'heavy-signal': { color: { r: 1.0, g: 0.74, b: 0.02 }, relief: 0.95, haze: 0.26 },
  // Acid green: electro, sharp, chemical.
  'broken-machine': { color: { r: 0.4, g: 1.0, b: 0.1 }, relief: 0.78, haze: 0.3 },
  // Magenta: the riot is the loudest thing in the world and it looks it.
  // It used to be ochre, which read as a slightly duller heavy-signal.
  'percussion-riot': { color: { r: 1.0, g: 0.12, b: 0.72 }, relief: 0.62, haze: 0.42 },
  // Violet under black: emptiness with weight in it.
  'void-crusher': { color: { r: 0.5, g: 0.1, b: 1.0 }, relief: 0.88, haze: 0.72 },
  // Cool cyan, rolling and skippy — the ground never quite settles.
  // Warm gold, soft hills: the friendliest region in the world.
  // Deep purple with steep cliffs — weight you can see.
  // Almost black-green, cut by deep ravines: the echo chamber below.
  // §69 steel green: hard, cold, industrial — the colour of a broken machine.
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Blend the regions the player is currently between. Weights are the genre
 * affinities, so the look and the music always agree about where you are.
 */
export function lookFor(affinity: GenreAffinity): ZoneLook {
  let total = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let relief = 0;
  let haze = 0;
  for (const [genre, raw] of Object.entries(affinity) as [keyof GenreAffinity, number][]) {
    // Cubed: with eight compass points the two neighbours are always present
    // at about a third. Averaging them in linearly turned every region into
    // the same muddy blend — the dominant region has to actually dominate.
    const weight = Math.pow(clamp01(raw), 3);
    if (weight <= 0) continue;
    const look = GENRE_LOOKS[genre];
    total += weight;
    r += look.color.r * weight;
    g += look.color.g * weight;
    b += look.color.b * weight;
    relief += look.relief * weight;
    haze += look.haze * weight;
  }
  if (total <= 0) return NEUTRAL_LOOK;
  // Anything the regions do not claim stays void, so the neutral middle of
  // the world never picks up a colour it did not earn.
  const claimed = Math.min(1, total * 1.6);
  const mix = (zone: number, neutral: number): number =>
    (zone / total) * claimed + neutral * (1 - claimed);
  return {
    color: {
      r: mix(r, NEUTRAL_LOOK.color.r),
      g: mix(g, NEUTRAL_LOOK.color.g),
      b: mix(b, NEUTRAL_LOOK.color.b),
    },
    relief: mix(relief, NEUTRAL_LOOK.relief),
    haze: mix(haze, NEUTRAL_LOOK.haze),
  };
}

/** §57: ten points, 36° apart — one per world. */
/**
 * §121: SIX points, one per world.
 *
 * These were the ten of an older compass while §111 gave the world six equal
 * sectors, so a world spanned nearly two points and showed up under both —
 * "N · locked groove" and "NNE · locked groove" read as locked groove being in two directions at
 * once. One direction, one world, one name.
 */
const POINTS = ['N', 'NE', 'SE', 'S', 'SW', 'NW'] as const;

/** Heading in radians (0 = north, clockwise) → compass point. */
export function compassPoint(heading: number): (typeof POINTS)[number] {
  // §121: the same index the world is read from, so the two can never
  // disagree at a border.
  return POINTS[sectorIndex(heading)]!;
}

/** What lies in the direction the player is facing, for the HUD (§33). */
export function headingLabel(heading: number): string {
  // §112: one source. The compass point is how it READS; the world is
  // whatever `worldForHeading` says, which is the same maths the land uses.
  return `${compassPoint(heading)} · ${placeName(worldForHeading(heading))}`;
}

/**
 * What a region is CALLED. §57 put all ten worlds on the compass, so every
 * region IS its music and carries its grammar's name. Only the neutral middle
 * has a name of its own.
 */
export function placeName(region: keyof GenreAffinity | null): string {
  return region ?? 'the void';
}
