import type { GenreAffinity } from '../music/MusicState';
import type { Vec3Data } from '../player/FrequencyState';

/**
 * §29.5 genre grammar, spatial layer (user decision): every direction of the
 * world is a different genre. North = Techno, East = Jazz, South = Ambient,
 * West = Drum & Bass, high altitude = Experimental. Zones overlap in soft
 * cosine lobes so the space between two directions is a hybrid (§9: genres
 * may overlap, no menu, no portal). Around spawn the world stays neutral —
 * the void has no genre until you travel.
 */

export const ZONE_CONFIG = {
  /** Around spawn nothing pulls: the void is genre-less. */
  neutralRadius: 20,
  /**
   * Distance at which a compass zone reaches full influence. Kept short on
   * purpose: turning and flying must change the music within seconds, or a
   * direction does not read as a choice (§34).
   */
  fullInfluenceDistance: 70,
} as const;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Shortest angular distance between two headings, in radians. */
function angleDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

/**
 * §57 (supersedes §34's eight points plus two altitude bands): TEN worlds on
 * the compass, 36° apart.
 *
 * Altitude cannot be a place. Climbing is the arrangement — it builds the
 * track and it lifts the pitch (§3.1, §47) — so a player who climbs for a
 * build would leave their world every time, and heading for Trap while gaining
 * height would land them in Experimental. Height is expression now, everywhere;
 * a direction is the only thing that chooses a world.
 */
const STEP = (Math.PI * 2) / 10;
const BEARINGS = {
  north: 0,
  northNorthEast: STEP,
  eastNorthEast: STEP * 2,
  eastSouthEast: STEP * 3,
  southSouthEast: STEP * 4,
  south: Math.PI,
  southSouthWest: -STEP * 4,
  westSouthWest: -STEP * 3,
  westNorthWest: -STEP * 2,
  northNorthWest: -STEP,
} as const;

type Compass = keyof typeof BEARINGS;
export type GroundGenre = Exclude<keyof GenreAffinity, never>;

/** Which genre lies in each direction; a world recipe may reassign it (§30). */
let assignment: Record<Compass, GroundGenre> = {
  north: 'techno',
  northNorthEast: 'garage',
  eastNorthEast: 'jazz',
  eastSouthEast: 'house',
  southSouthEast: 'experimental',
  south: 'ambient',
  southSouthWest: 'breakbeat',
  westSouthWest: 'dnb',
  westNorthWest: 'dub',
  northNorthWest: 'trap',
};

export function setZoneGenres(next: Partial<typeof assignment>): void {
  assignment = { ...assignment, ...next };
}

export function zoneGenres(): Readonly<typeof assignment> {
  return assignment;
}

/**
 * Genre pull of a world position, 0..1 per genre. Pure and deterministic.
 * The player never sees numbers — they hear the world change as they travel.
 */
export function zoneAffinity(position: Vec3Data, flightHeading?: number): GenreAffinity {
  const affinity: GenreAffinity = {
    techno: 0,
    ambient: 0,
    jazz: 0,
    dnb: 0,
    garage: 0,
    house: 0,
    trap: 0,
    breakbeat: 0,
    dub: 0,
    experimental: 0,
  };
  const distance = Math.hypot(position.x, position.z);
  const span = ZONE_CONFIG.fullInfluenceDistance - ZONE_CONFIG.neutralRadius;
  const influence = clamp01((distance - ZONE_CONFIG.neutralRadius) / span);
  if (influence > 0) {
    // §56 HARD RULE: the world you are IN is the world you are flying INTO.
    // `flightHeading` is the direction the orb is travelling; without it the
    // bearing from spawn decides, and then the HUD can honestly say
    // "flying: E · jazz" next to "here: breakbeat" — which is nonsense to a
    // player. Distance from spawn still gates it, so the start is neutral.
    // atan2(x, -z): 0 points north, +π/2 east — matches HEADINGS.
    const heading = flightHeading ?? Math.atan2(position.x, -position.z);
    for (const [compass, target] of Object.entries(BEARINGS) as [Compass, number][]) {
      // Cosine lobe, sharpened for eight points: full at the compass point,
      // about a third at the 45° neighbour, zero at 90° and beyond. Narrowing
      // it by doubling the angle instead would make the OPPOSITE direction
      // come back to full strength.
      // Ten points sit 36° apart, so the lobe is sharpened one power further
      // than the eight-point version: full at the point, about a third at the
      // neighbour, nothing at 90°.
      const cosine = Math.max(0, Math.cos(angleDelta(heading, target)));
      const lobe = cosine * cosine * cosine * cosine * cosine;
      const genre = assignment[compass];
      affinity[genre] = Math.max(affinity[genre], influence * lobe);
    }
  }
  return affinity;
}

/**
 * The name of the region the player is in, or null while neutral. Used for
 * the one-word cue when a new region is entered (never a menu).
 */
export function dominantZone(affinity: GenreAffinity, threshold = 0.45): keyof GenreAffinity | null {
  let best: keyof GenreAffinity | null = null;
  let bestValue = threshold;
  for (const [genre, value] of Object.entries(affinity) as [keyof GenreAffinity, number][]) {
    if (value > bestValue) {
      best = genre;
      bestValue = value;
    }
  }
  return best;
}
