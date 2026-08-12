import type { Rng } from '../core/rng';
import { ladderFor, layerUnlocked } from '../music/GenreLadder';
import type { TrackGenre, TrackLayerName, TrackState } from '../music/TrackState';
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
/** Beacons sit in the air the layer belongs to (§3.1: low is mass, high is air). */
const HEIGHT: Record<TrackLayerName, number> = {
  kick: 6,
  bass: 8,
  snare: 16,
  harmony: 22,
  melody: 30,
  hats: 38,
  texture: 46,
};
const RADIUS = 9;

/** Which rungs of this world's ladder are still to be earned, in order. */
export function remainingLayers(
  track: Readonly<TrackState>,
  genre: TrackGenre,
): readonly TrackLayerName[] {
  return ladderFor(genre)
    .map((step) => step.layer)
    .filter((layer) => !layerUnlocked(track, layer));
}

/**
 * Place a beacon for the next unearned rung, somewhere ahead of the flight.
 * One at a time: two beacons would be a choice between layers, and the ladder
 * has already made that choice (§31.2).
 */
export function placeBeacon(
  track: Readonly<TrackState>,
  genre: TrackGenre,
  from: Vec3Data,
  heading: number,
  rng: Rng,
  serial: number,
): LayerBeacon | null {
  const layer = remainingLayers(track, genre)[0];
  if (layer === undefined) return null;
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
