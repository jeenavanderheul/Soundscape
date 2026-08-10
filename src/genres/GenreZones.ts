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
  /**
   * Altitude where Experimental starts pulling. It is a WORLD of its own, not
   * a side effect of gaining height: at 25 an ordinary cruise over another
   * region already read as Experimental, which is wrong. You have to climb
   * for it now — the flight ceiling is 70.
   */
  experimentalFloor: 50,
  /** Altitude of full Experimental influence. */
  experimentalCeiling: 68,
  /**
   * §34: Dub is the LOW band — skimming the ground, down in the valleys.
   * Flight altitude is clamped to [-3, 70] (FLIGHT_CONFIG), so a region
   * "under the world" would be unreachable; the echo chamber is the floor.
   */
  dubCeiling: -1,
  dubFloor: -3,
} as const;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Shortest angular distance between two headings, in radians. */
function angleDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

/** Compass headings in radians: 0 = north (−Z), clockwise (§34: eight points). */
const BEARINGS = {
  north: 0,
  northEast: Math.PI / 4,
  east: Math.PI / 2,
  southEast: (Math.PI * 3) / 4,
  south: Math.PI,
  southWest: (-Math.PI * 3) / 4,
  west: -Math.PI / 2,
  northWest: -Math.PI / 4,
} as const;

type Compass = keyof typeof BEARINGS;
/** The vertical axis is its own dimension: mutation above, echo below (§34). */
export type GroundGenre = Exclude<keyof GenreAffinity, 'experimental' | 'dub'>;

/** Which genre lies in each direction; a world recipe may reassign it (§30). */
let assignment: Record<Compass, GroundGenre> = {
  north: 'techno',
  northEast: 'garage',
  east: 'jazz',
  southEast: 'house',
  south: 'ambient',
  southWest: 'classical',
  west: 'dnb',
  northWest: 'trap',
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
export function zoneAffinity(position: Vec3Data): GenreAffinity {
  const affinity: GenreAffinity = {
    techno: 0,
    ambient: 0,
    jazz: 0,
    dnb: 0,
    garage: 0,
    house: 0,
    trap: 0,
    classical: 0,
    dub: 0,
    experimental: 0,
  };
  const distance = Math.hypot(position.x, position.z);
  const span = ZONE_CONFIG.fullInfluenceDistance - ZONE_CONFIG.neutralRadius;
  const influence = clamp01((distance - ZONE_CONFIG.neutralRadius) / span);
  if (influence > 0) {
    // atan2(x, -z): 0 points north, +π/2 east — matches HEADINGS.
    const heading = Math.atan2(position.x, -position.z);
    for (const [compass, target] of Object.entries(BEARINGS) as [Compass, number][]) {
      // Cosine lobe, sharpened for eight points: full at the compass point,
      // about a third at the 45° neighbour, zero at 90° and beyond. Narrowing
      // it by doubling the angle instead would make the OPPOSITE direction
      // come back to full strength.
      const cosine = Math.max(0, Math.cos(angleDelta(heading, target)));
      const lobe = cosine * cosine * cosine;
      const genre = assignment[compass];
      affinity[genre] = Math.max(affinity[genre], influence * lobe);
    }
  }
  // Altitude is its own axis: climbing takes the world into mutation (§9.5),
  // diving takes it into the echo chamber (§34).
  const height =
    (position.y - ZONE_CONFIG.experimentalFloor) /
    (ZONE_CONFIG.experimentalCeiling - ZONE_CONFIG.experimentalFloor);
  affinity.experimental = clamp01(height);
  const depth =
    (position.y - ZONE_CONFIG.dubCeiling) / (ZONE_CONFIG.dubFloor - ZONE_CONFIG.dubCeiling);
  affinity.dub = clamp01(depth);
  // Once you are really up there — or really down on the deck — you have LEFT
  // the region below you. Without this the ground genre and the altitude genre
  // tie, and which one you were "in" came down to key order.
  const vertical = Math.max(affinity.experimental, affinity.dub);
  if (vertical > 0) {
    for (const genre of Object.keys(affinity) as (keyof GenreAffinity)[]) {
      if (genre === 'experimental' || genre === 'dub') continue;
      affinity[genre] *= 1 - vertical;
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
