import { describe, expect, it } from 'vitest';

import { landFieldFrom, type LandField, type LandManifest } from '../../src/world/LandField';
import { blocksInPatch, CITY, heightAboveStreet } from '../../src/world/cityBlocks';

/**
 * §134: buildings are read back out of the same height field the collision
 * uses — a cell is a building when it stands above the street around it.
 */

const SIZE = 64;

const manifest: LandManifest = {
  label: 'test', layer: 'dsm_05m', size: SIZE,
  rd: { minX: 0, minY: 0, maxX: 640, maxY: 640 },
  metresPerSample: 10, lowest: 0, highest: 40, waterFraction: 0,
};

/** Flat ground with one square tower on it, and a lake in a corner. */
function town(towerHeightMetres = 20, water = false): LandField {
  const height = new Float32Array(SIZE * SIZE).fill(2);
  for (let z = 30; z < 34; z++) for (let x = 30; x < 34; x++) height[z * SIZE + x] = 2 + towerHeightMetres;
  const wet = new Uint8Array(SIZE * SIZE);
  if (water) for (let z = 30; z < 34; z++) for (let x = 30; x < 34; x++) wet[z * SIZE + x] = 1;
  return landFieldFrom(manifest, height, wet, 1, 0.25);
}

describe('§134 what stands above the street is a building', () => {
  it('measures a tower against the ground around it, not against sea level', () => {
    const land = town(20);
    // Flat ground two metres above NAP is not a building.
    expect(heightAboveStreet(land, 10, 10)).toBe(0);
    // The tower is 20 m up, drawn at the field's vertical scale.
    expect(heightAboveStreet(land, 31, 31)).toBeCloseTo(20 * 0.25);
  });

  it('finds the tower and nothing else', () => {
    const blocks = blocksInPatch(town(20), 0, 0, 400);
    expect(blocks.length).toBe(4 * 4);
    for (const block of blocks) {
      expect(block.height).toBeCloseTo(5);
      expect(block.footprint).toBeCloseTo(town(20).unitsPerSample);
    }
  });

  it('leaves flat land empty — everything is a building is the same bug as nothing is', () => {
    const flat = landFieldFrom(manifest, new Float32Array(SIZE * SIZE).fill(2), new Uint8Array(SIZE * SIZE), 1, 0.25);
    expect(blocksInPatch(flat, 0, 0, 400)).toEqual([]);
  });

  it('ignores anything low enough to be ground', () => {
    // 2 m of relief at a quarter scale is half a unit: under the threshold.
    expect(blocksInPatch(town(2), 0, 0, 400)).toEqual([]);
  });

  it('builds nothing on water', () => {
    expect(blocksInPatch(town(20, true), 0, 0, 400)).toEqual([]);
  });

  it('only reaches as far as the patch, and keeps the nearest when capped', () => {
    const land = town(20);
    const tower = { x: land.originX + 31 * land.unitsPerSample, z: land.originZ + 31 * land.unitsPerSample };
    expect(blocksInPatch(land, tower.x, tower.z, 5).length).toBeGreaterThan(0);
    expect(blocksInPatch(land, tower.x + 300, tower.z + 300, 20)).toEqual([]);
    expect(blocksInPatch(land, 0, 0, 400).length).toBeLessThanOrEqual(CITY.maxBlocks);
  });
});
