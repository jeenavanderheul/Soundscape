import { isWater, type LandField } from './LandField';

/**
 * §134 THE CITY — what stands on the land, as mass you can see.
 *
 * The height field already contains the buildings: AHN's surface model
 * measures roofs, not streets. Drawing it as a grid turns a canal house into a
 * kink in a line, so this reads the same field a second way — as blocks that
 * stand up out of it.
 *
 * A cell is a building when it is higher than the STREET AROUND IT. There is
 * no separate ground model here, so the street is taken as the lowest point on
 * a ring a block-width away: buildings are compact, the ring falls off them.
 * That is an approximation and it behaves like one — the middle of a very
 * large block reads lower than its edges, so a wide roof comes out as a rim
 * rather than a slab. (The exact answer would be baking AHN's terrain model
 * next to its surface model and subtracting; that is a second file, not a
 * second guess.)
 */

export const CITY = {
  /** Samples from a cell to the ring that stands in for its street. */
  streetRadiusInSamples: 6,
  /**
   * Below this, in world units above the street, it is ground, not a building.
   * 1.2 units is about five metres of real height: a house, not a hedge, a
   * bridge or the camber of a road. Lower than this and the whole city centre
   * qualifies, which draws as one slab.
   */
  minHeight: 1.2,
  /** How far from the player blocks are built, in world units. */
  patchRadius: 190,
  /** Hard ceiling on one patch; the farthest are dropped first. */
  maxBlocks: 5000,
} as const;

/** One extruded mass: a square footprint standing on its own street level. */
export interface CityBlock {
  x: number;
  z: number;
  /** Side of the square footprint, in world units. */
  footprint: number;
  /** How far it stands above the street, in world units. */
  height: number;
}

const sampleAt = (land: LandField, ix: number, iz: number): number => {
  const cx = ix < 0 ? 0 : ix > land.size - 1 ? land.size - 1 : ix;
  const cz = iz < 0 ? 0 : iz > land.size - 1 ? land.size - 1 : iz;
  return land.height[cz * land.size + cx]!;
};

/** The eight points of the ring that stands in for the street (§134). */
const RING: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** How high this sample stands above the street around it, in world units. */
export function heightAboveStreet(land: LandField, ix: number, iz: number): number {
  const here = sampleAt(land, ix, iz);
  const r = CITY.streetRadiusInSamples;
  let street = here;
  for (const [dx, dz] of RING) {
    const there = sampleAt(land, ix + dx * r, iz + dz * r);
    if (there < street) street = there;
  }
  return (here - street) * land.verticalScale;
}

/**
 * Every building within `radius` of a point, nearest first so a cap drops the
 * far ones. One block per sample: neighbouring cells of the same building end
 * up flush against each other and read as one mass.
 */
export function blocksInPatch(
  land: LandField,
  centreX: number,
  centreZ: number,
  radius: number = CITY.patchRadius,
): CityBlock[] {
  const reach = Math.ceil(radius / land.unitsPerSample);
  const cx = Math.round((centreX - land.originX) / land.unitsPerSample);
  const cz = Math.round((centreZ - land.originZ) / land.unitsPerSample);
  const found: { block: CityBlock; distance: number }[] = [];
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const distance = Math.hypot(dx, dz) * land.unitsPerSample;
      if (distance > radius) continue; // a disc, not a square
      const ix = cx + dx;
      const iz = cz + dz;
      if (ix < 0 || iz < 0 || ix > land.size - 1 || iz > land.size - 1) continue;
      const height = heightAboveStreet(land, ix, iz);
      if (height < CITY.minHeight) continue;
      const x = land.originX + ix * land.unitsPerSample;
      const z = land.originZ + iz * land.unitsPerSample;
      // Nothing stands on the water AHN failed to measure.
      if (isWater(land, x, z)) continue;
      found.push({ block: { x, z, footprint: land.unitsPerSample, height }, distance });
    }
  }
  if (found.length > CITY.maxBlocks) {
    found.sort((a, b) => a.distance - b.distance);
    found.length = CITY.maxBlocks;
  }
  return found.map((f) => f.block);
}
