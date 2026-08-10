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
  neutralRadius: 30,
  /** Distance at which a compass zone reaches full influence. */
  fullInfluenceDistance: 150,
  /** Altitude where Experimental starts pulling. */
  experimentalFloor: 25,
  /** Altitude of full Experimental influence. */
  experimentalCeiling: 60,
} as const;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Shortest angular distance between two headings, in radians. */
function angleDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

/** Compass headings in radians: 0 = north (−Z), clockwise. */
const HEADINGS = {
  techno: 0,
  jazz: Math.PI / 2,
  ambient: Math.PI,
  dnb: -Math.PI / 2,
} as const;

/**
 * Genre pull of a world position, 0..1 per genre. Pure and deterministic.
 * The player never sees numbers — they hear the world change as they travel.
 */
export function zoneAffinity(position: Vec3Data): GenreAffinity {
  const affinity: GenreAffinity = { techno: 0, ambient: 0, jazz: 0, dnb: 0, experimental: 0 };
  const distance = Math.hypot(position.x, position.z);
  const span = ZONE_CONFIG.fullInfluenceDistance - ZONE_CONFIG.neutralRadius;
  const influence = clamp01((distance - ZONE_CONFIG.neutralRadius) / span);
  if (influence > 0) {
    // atan2(x, -z): 0 points north, +π/2 east — matches HEADINGS.
    const heading = Math.atan2(position.x, -position.z);
    for (const [genre, target] of Object.entries(HEADINGS) as [
      keyof typeof HEADINGS,
      number,
    ][]) {
      // Cosine lobe: full at the compass point, zero at 90° away, so two
      // neighbouring directions blend into a hybrid halfway between them.
      const lobe = Math.max(0, Math.cos(angleDelta(heading, target)));
      affinity[genre] = influence * lobe;
    }
  }
  // Altitude is its own axis: climbing takes the world into mutation (§9.5).
  const height =
    (position.y - ZONE_CONFIG.experimentalFloor) /
    (ZONE_CONFIG.experimentalCeiling - ZONE_CONFIG.experimentalFloor);
  affinity.experimental = clamp01(height);
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
