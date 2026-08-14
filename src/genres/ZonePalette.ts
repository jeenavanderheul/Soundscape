import type { GenreAffinity } from '../music/MusicState';
import { zoneGenres } from './GenreZones';

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
  // Machine red: hard, hot, industrial.
  techno: { color: { r: 1.0, g: 0.12, b: 0.1 }, relief: 0.85, haze: 0.2 },
  'sub-pressure': { color: { r: 0.02, g: 0.3, b: 0.42 }, relief: 0.92, haze: 0.58 },
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
const POINTS = ['N', 'NNE', 'ENE', 'ESE', 'SSE', 'S', 'SSW', 'WSW', 'WNW', 'NNW'] as const;

/** Heading in radians (0 = north, clockwise) → compass point. */
export function compassPoint(heading: number): (typeof POINTS)[number] {
  const turns = heading / (Math.PI * 2);
  const index = Math.round((turns - Math.floor(turns)) * POINTS.length) % POINTS.length;
  return POINTS[index]!;
}

/** What lies in the direction the player is facing, for the HUD (§33). */
export function headingLabel(heading: number): string {
  const point = compassPoint(heading);
  const zones = zoneGenres();
  const byPoint = {
    N: zones.north,
    NNE: zones.northNorthEast,
    ENE: zones.eastNorthEast,
    ESE: zones.eastSouthEast,
    SSE: zones.southSouthEast,
    S: zones.south,
    SSW: zones.southSouthWest,
    WSW: zones.westSouthWest,
    WNW: zones.westNorthWest,
    NNW: zones.northNorthWest,
  } as const;
  return `${point} · ${byPoint[point]}`;
}

/**
 * What a region is CALLED. §57 put all ten worlds on the compass, so every
 * region IS its music and carries its grammar's name. Only the neutral middle
 * has a name of its own.
 */
export function placeName(region: keyof GenreAffinity | null): string {
  return region ?? 'the void';
}
