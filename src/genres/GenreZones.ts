import type { GenreAffinity } from '../music/MusicState';
import type { Vec3Data } from '../player/FrequencyState';
import { isActiveWorldGenre, type ActiveWorldGenre } from './ActiveWorlds';

/**
 * §29.5 genre grammar, spatial layer (user decision): every direction of the
 * world is a different genre. North = LOCKED GROOVE, East = Jazz, South = Ambient,
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
export type GroundGenre = ActiveWorldGenre;

/**
 * §157: which genre lies in each direction, DERIVED from the six sectors.
 *
 * There used to be a second table here — ten compass points with their own
 * genres, left over from the eight-wind compass — and it still said locked groove and
 * sub-pressure long after the world had six sectors. Nothing reading it was
 * wrong, exactly; it was just answering a question the land no longer agreed
 * with, which is what §56 forbids. The guide reads this, the land reads
 * `SECTORS`, and now those are the same thing by construction.
 */
export function zoneGenres(): Readonly<Record<Compass, GroundGenre>> {
  const out = {} as Record<Compass, GroundGenre>;
  for (const compass of Object.keys(BEARINGS) as Compass[]) {
    out[compass] = worldForHeading(BEARINGS[compass]);
  }
  return out;
}

/**
 * §30: a world recipe may reassign a direction. It names compass points, so
 * each one is resolved to the SECTOR it falls in — there is only one table to
 * write into now.
 */
export function setZoneGenres(next: Partial<Record<Compass, keyof GenreAffinity>>): void {
  for (const [compass, genre] of Object.entries(next) as [Compass, keyof GenreAffinity][]) {
    if (!isActiveWorldGenre(genre)) continue;
    sectors[sectorIndex(BEARINGS[compass])] = genre;
  }
}

/**
 * Genre pull of a world position, 0..1 per genre. Pure and deterministic.
 * The player never sees numbers — they hear the world change as they travel.
 */
/**
 * §112: the six sectors, in compass order — the ONE place a heading becomes a
 * world. `flying:` used to read a separate ten-point table left over from an
 * earlier compass, so the HUD could say you were flying into locked groove while the
 * land under you was percussion riot. Two answers to one question is exactly
 * what §56 forbids.
 */
const sectors: GroundGenre[] = [
  'locked-groove', 'heavy-signal', 'broken-machine',
  'sub-pressure', 'void-crusher', 'percussion-riot',
];

/** The six worlds in compass order. A recipe may rewrite them (§30). */
export const SECTORS: readonly GroundGenre[] = sectors;

/**
 * §121: which of the six sectors a heading falls in. The ONE index — the
 * world name and the compass point are both read from it, so they cannot
 * round differently at a border and claim two directions for one world.
 */
export function sectorIndex(heading: number): number {
  const turns = heading / (Math.PI * 2);
  const wrapped = turns - Math.floor(turns);
  // Exactly on a border, round DOWN — `dominantZone` scans in order and keeps
  // the first of two equal pulls, so rounding up would put the label one
  // sector ahead of the land at every boundary.
  return Math.floor(wrapped * SECTORS.length + 0.5 - 1e-9) % SECTORS.length;
}

/** The world a heading points into. The same maths `zoneAffinity` uses. */
export function worldForHeading(heading: number): keyof GenreAffinity {
  return SECTORS[sectorIndex(heading)]!;
}


export function zoneAffinity(position: Vec3Data, flightHeading?: number): GenreAffinity {
  const affinity: GenreAffinity = {
  'locked-groove': 0,
  'sub-pressure': 0,
  'heavy-signal': 0,
  'broken-machine': 0,
  'percussion-riot': 0,
  'void-crusher': 0,
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
    // §111 (user decision): SIX equal sectors of 60°, so every world is the
    // same size and the same distance away. A sector's pull is cos⁵ of the
    // angle to its centre — wide enough that neighbours blend at a border,
    // narrow enough that its own heading is unmistakably itself.
    const step = (Math.PI * 2) / SECTORS.length;
    let total = 0;
    const pulls = SECTORS.map((_, i) => {
      let delta = heading - i * step;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const lobe = Math.cos(delta);
      const pull = lobe > 0 ? Math.pow(lobe, 5) : 0;
      total += pull;
      return pull;
    });
    if (total > 0) {
      SECTORS.forEach((genre, i) => {
        affinity[genre] = (influence * pulls[i]!) / total;
      });
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
