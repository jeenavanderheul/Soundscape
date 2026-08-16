/**
 * §220 (user decision): HOW FAR HAVE I FLOWN.
 *
 * Every metre counts — bends, climbs and dives included. Fly a circle and the
 * number keeps going up, because it is a distance travelled, not a distance
 * from home.
 *
 * The scale is not invented. `LAND_CONFIG.unitsPerMetre` is 0.5, because the
 * terrain is real: a baked square of AHN surface heights over Amsterdam, laid
 * out so its 20 km is 20 km. One world unit is therefore two metres, and that
 * is the only non-arbitrary number available — so it is the one used, rather
 * than a factor chosen to make the readout look nice.
 *
 * What it implies, stated plainly because it is fast: `FLIGHT_CONFIG.maxSpeed`
 * 66 units/s is 132 m/s, about 475 km/h, and hyper doubles it. The counter is
 * indicative (user) — true to the ground it flies over, not to the crowd
 * standing on it, who are 140 units tall and therefore giants.
 */

/** One world unit, in metres. The inverse of `LAND_CONFIG.unitsPerMetre`. */
export const METRES_PER_UNIT = 2;

export interface Point {
  x: number;
  y: number;
  z: number;
}

/** Metres covered between two positions, in three dimensions. */
export function metresBetween(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) * METRES_PER_UNIT;
}

/**
 * The readout. Metres until a kilometre, then kilometres to one decimal —
 * at 475 km/h you are past a thousand inside eight seconds, so a counter that
 * only ever counted metres would be a five-digit number for the whole flight.
 */
export function formatDistance(metres: number): string {
  const safe = Math.max(0, metres);
  if (safe < 1000) return `${Math.round(safe)} M`;
  return `${(safe / 1000).toFixed(1)} KM`;
}
