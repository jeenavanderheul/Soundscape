import { describe, expect, it } from 'vitest';

import {
  isWater,
  landFieldFrom,
  sampleLand,
  type LandField,
  type LandManifest,
} from '../../src/world/LandField';

/**
 * §132: the collision and the shader read the land through the same blend, so
 * this tests the read itself — the thing §35 proved you cannot get slightly
 * wrong without falling through the floor.
 */

const manifest: LandManifest = {
  label: 'test', layer: 'dsm_05m', size: 4,
  rd: { minX: 0, minY: 0, maxX: 40, maxY: 40 },
  metresPerSample: 10, lowest: 0, highest: 30, waterFraction: 0,
};

/** A 4×4 ramp: height equals the column, so every read is predictable. */
function ramp(verticalScale = 1): LandField {
  const height = new Float32Array([
    0, 10, 20, 30,
    0, 10, 20, 30,
    0, 10, 20, 30,
    0, 10, 20, 30,
  ]);
  return landFieldFrom(manifest, height, new Uint8Array(16), 1, verticalScale);
}

describe('§132 reading the land', () => {
  it('lands exactly on a sample where a sample is', () => {
    const land = ramp();
    // Sample (0,0) sits at the field's own origin.
    expect(sampleLand(land, land.originX, land.originZ)).toBeCloseTo(0);
    expect(sampleLand(land, land.originX + land.unitsPerSample, land.originZ)).toBeCloseTo(10);
    expect(sampleLand(land, land.originX + 3 * land.unitsPerSample, land.originZ)).toBeCloseTo(30);
  });

  it('blends between samples instead of stepping', () => {
    const land = ramp();
    const half = sampleLand(land, land.originX + land.unitsPerSample * 0.5, land.originZ);
    expect(half).toBeCloseTo(5);
    // Smooth all the way along, or the ground would be a staircase you catch on.
    let previous = -Infinity;
    for (let step = 0; step <= 30; step += 1) {
      const here = sampleLand(land, land.originX + (step / 10) * land.unitsPerSample, land.originZ);
      expect(here).toBeGreaterThanOrEqual(previous);
      previous = here;
    }
  });

  it('holds the border height beyond the edge instead of wrapping or dropping', () => {
    // Flying off the data must not open a hole in the world.
    const land = ramp();
    const far = land.originX + land.size * land.unitsPerSample * 4;
    expect(sampleLand(land, far, land.originZ)).toBeCloseTo(30);
    expect(sampleLand(land, -far, land.originZ)).toBeCloseTo(0);
    expect(Number.isFinite(sampleLand(land, far, far))).toBe(true);
  });

  it('puts the water line on the plane and scales what stands above it', () => {
    // NAP is a datum, not a floor — half of this country is under it, so the
    // lowest measured point is what the terrain plane represents.
    const deep: LandManifest = { ...manifest, lowest: -10 };
    const height = new Float32Array(16).fill(-10);
    height[5] = 0;
    const land = landFieldFrom(deep, height, new Uint8Array(16), 1, 3);
    expect(sampleLand(land, land.originX, land.originZ)).toBeCloseTo(0);
    const sample = land.originX + land.unitsPerSample;
    expect(sampleLand(land, sample, land.originZ + land.unitsPerSample)).toBeCloseTo(30);
  });

  it('centres the region on spawn, so every direction flies across it', () => {
    const land = ramp();
    expect(land.originX).toBeCloseTo(-(land.size * land.unitsPerSample) / 2);
    expect(land.originX).toBe(land.originZ);
  });

  it('reads the holes AHN left as water', () => {
    const water = new Uint8Array(16);
    water[0] = 1;
    const land = landFieldFrom(manifest, new Float32Array(16), water, 1, 1);
    expect(isWater(land, land.originX, land.originZ)).toBe(true);
    expect(isWater(land, land.originX + 2 * land.unitsPerSample, land.originZ)).toBe(false);
  });
});
