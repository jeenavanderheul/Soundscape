import type { Rng } from '../core/rng';
import { layerUnlocked } from '../music/GenreLadder';
import type { TrackLayerName, TrackState } from '../music/TrackState';
import type { Vec3Data } from '../player/FrequencyState';

/**
 * §86 LAYER BEACONS — the seven layers, standing in the world.
 *
 * Until now a layer was earned by behaving the right way for long enough:
 * fly low and eventually the kick appears. That is a consequence, but it is
 * not something you can point at, so a player never gets to say "I did that".
 *
 * A beacon is the layer as an object. It stands ahead of the flight, it is
 * the colour and the shape of its role, and flying through it earns exactly
 * that rung — now, visibly, because you went and got it. The ladder still
 * decides the ORDER, so a world is never assembled out of order; the beacon
 * decides the MOMENT.
 *
 * Pure data: no three.js, no stores. The renderer draws what this returns and
 * the Game asks it what was flown through.
 */

export interface LayerBeacon {
  id: string;
  layer: TrackLayerName;
  position: Vec3Data;
  /** How close the orb has to come. Generous — this is an invitation. */
  radius: number;
}

/** How far ahead of the player the next beacon is placed. */
const NEAR = 90;
const FAR = 190;
/**
 * §99: HEIGHT IS THE MECHANIC. Every beacon stands at the altitude of the
 * register its layer occupies — the kick and the sub down on the deck where
 * the mass is, the hats and the texture up in the open air where the detail
 * lives. Going and getting a layer therefore MEANS climbing or diving, and it
 * means it visibly, instead of through an invisible rule that handed you a
 * layer for holding an altitude long enough.
 *
 * The spread is deliberately wide, so two consecutive rungs are a real journey
 * rather than a nudge on the stick.
 *
 * Rescaled with the world (was 4–58, written when the sky was 70 units tall and
 * a tree was thirty). At a 1200-unit ceiling those all sat on the deck, so
 * every beacon was a dive and the airy layers never asked you to climb. The
 * column now spans 20–300, which brackets AIR_ALTITUDE: the kick is below the
 * point where the filter starts opening, the texture well above it.
 */
const HEIGHT: Record<TrackLayerName, number> = {
  kick: 20,
  bass: 36,
  snare: 105,
  harmony: 145,
  melody: 200,
  hats: 250,
  texture: 300,
};
const RADIUS = 9;

/**
 * Which rungs are still to be earned, in the order THIS track is climbing.
 *
 * The order used to come from the written ladder, which stopped being the order
 * that plays at §128 — the beacon could send you after a layer that was not
 * next. It is handed the live order now.
 */
export function remainingLayers(
  track: Readonly<TrackState>,
  order: readonly TrackLayerName[],
): readonly TrackLayerName[] {
  return order.filter((layer) => !layerUnlocked(track, layer));
}

/**
 * Place a beacon for the next unearned rung, somewhere ahead of the flight.
 * One at a time: two beacons would be a choice between layers, and the ladder
 * has already made that choice (§31.2).
 */
export function placeBeacon(
  offered: TrackLayerName | null,
  from: Vec3Data,
  heading: number,
  rng: Rng,
  serial: number,
): LayerBeacon | null {
  // §98: only what the world is willing to give right now. A beacon you can
  // reach but not collect is worse than no beacon at all.
  const layer = offered;
  if (layer === null) return null;
  // Ahead, but off to one side: straight ahead would mean the beacon is
  // collected by not steering, which earns nothing.
  const spread = (rng.next() - 0.5) * 1.1;
  const distance = NEAR + rng.next() * (FAR - NEAR);
  const angle = heading + spread;
  return {
    id: `beacon-${serial}-${layer}`,
    layer,
    position: {
      x: from.x + Math.sin(angle) * distance,
      y: HEIGHT[layer],
      z: from.z - Math.cos(angle) * distance,
    },
    radius: RADIUS,
  };
}

/** The beacon the orb is inside, if any. */
export function beaconAt(
  beacons: readonly LayerBeacon[],
  position: Vec3Data,
): LayerBeacon | null {
  for (const beacon of beacons) {
    const dx = beacon.position.x - position.x;
    const dy = beacon.position.y - position.y;
    const dz = beacon.position.z - position.z;
    if (dx * dx + dy * dy + dz * dz <= beacon.radius * beacon.radius) return beacon;
  }
  return null;
}

/**
 * A beacon that has been left far behind is gone: the flight moved on, and a
 * marker you can no longer see is not an invitation.
 */
export function beaconIsStale(beacon: LayerBeacon, position: Vec3Data): boolean {
  const dx = beacon.position.x - position.x;
  const dz = beacon.position.z - position.z;
  return dx * dx + dz * dz > (FAR * 1.8) ** 2;
}
