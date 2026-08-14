import { describe, expect, it } from 'vitest';

import { landFieldFrom, sampleLand, type LandField, type LandManifest } from '../../src/world/LandField';
import { TERRAIN_CONFIG, WaveTerrain } from '../../src/rendering/WaveTerrain';

/**
 * §132 step 2: the land is now part of the solid ground. §35 says the CPU and
 * the GPU have to agree about that surface exactly, so this reproduces what
 * the shader does — a NEAREST texel fetch plus the hand-written blend — and
 * holds it against the function the collision calls.
 */

const manifest: LandManifest = {
  label: 'test',
  layer: 'dsm_05m',
  size: 32,
  rd: { minX: 0, minY: 0, maxX: 320, maxY: 320 },
  metresPerSample: 10,
  lowest: -4,
  highest: 60,
  waterFraction: 0,
};

function bumpyLand(): LandField {
  const height = new Float32Array(manifest.size * manifest.size);
  for (let z = 0; z < manifest.size; z++) {
    for (let x = 0; x < manifest.size; x++) {
      // No smooth ramp: neighbouring samples must differ, or a wrong texel
      // lookup would still land on the right number.
      height[z * manifest.size + x] = ((x * 7 + z * 13) % 23) - 4;
    }
  }
  return landFieldFrom(manifest, height, new Uint8Array(height.length), 0.5, 0.25);
}

/** `landTexel` from LAND_FIELD_GLSL, with a NEAREST sampler underneath it. */
function glslLandTexel(land: LandField, cellX: number, cellZ: number): number {
  const cx = Math.min(Math.max(cellX, 0), land.size - 1);
  const cz = Math.min(Math.max(cellZ, 0), land.size - 1);
  const u = (cx + 0.5) / land.size;
  const v = (cz + 0.5) / land.size;
  const texelX = Math.min(land.size - 1, Math.floor(u * land.size));
  const texelZ = Math.min(land.size - 1, Math.floor(v * land.size));
  return land.height[texelZ * land.size + texelX]!;
}

/** `sampleLand` from LAND_FIELD_GLSL, line for line. */
function glslSampleLand(land: LandField, x: number, z: number): number {
  const fx = (x - land.originX) / land.unitsPerSample;
  const fz = (z - land.originZ) / land.unitsPerSample;
  const bx = Math.floor(fx);
  const bz = Math.floor(fz);
  const tx = fx - bx;
  const tz = fz - bz;
  const h00 = glslLandTexel(land, bx, bz);
  const h10 = glslLandTexel(land, bx + 1, bz);
  const h01 = glslLandTexel(land, bx, bz + 1);
  const h11 = glslLandTexel(land, bx + 1, bz + 1);
  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return (top + (bottom - top) * tz - land.seaLevel) * land.verticalScale;
}

describe('§132 the land is the same surface on both sides', () => {
  const land = bumpyLand();

  it('reads identically through the shader path and the collision path', () => {
    const span = land.size * land.unitsPerSample;
    let worst = 0;
    for (let i = 0; i < 400; i++) {
      // Deterministic sweep across the square and past its edges.
      const x = -span * 0.6 + (span * 1.2 * ((i * 37) % 400)) / 400;
      const z = -span * 0.6 + (span * 1.2 * ((i * 91) % 400)) / 400;
      worst = Math.max(worst, Math.abs(sampleLand(land, x, z) - glslSampleLand(land, x, z)));
    }
    expect(worst).toBe(0);
  });

  it('is not flat — a test that passes on a constant field proves nothing', () => {
    const heights = [0, 40, 80, 120, 160].map((x) => sampleLand(land, x, x));
    expect(new Set(heights).size).toBeGreaterThan(1);
  });
});

describe('§132 the ground the orb hits includes the land', () => {
  it('adds the land to the height the collision samples', () => {
    const land = bumpyLand();
    const terrain = new WaveTerrain('land-test');
    const before = terrain.groundHeightAt(70, -40);
    terrain.setLand(land);
    const after = terrain.groundHeightAt(70, -40);
    expect(after - before).toBeCloseTo(sampleLand(land, 70, -40), 6);
    expect(after).toBeGreaterThan(TERRAIN_CONFIG.planeY - 20);
    terrain.dispose();
  });

  it('leaves the shader switched off until the data is there', () => {
    const terrain = new WaveTerrain('land-test');
    const uniforms = (terrain as unknown as { material: { uniforms: Record<string, { value: unknown }> } })
      .material.uniforms;
    expect(uniforms['uLandPresent']!.value).toBe(0);
    terrain.setLand(bumpyLand());
    expect(uniforms['uLandPresent']!.value).toBe(1);
    expect(uniforms['uLandVerticalScale']!.value).toBeCloseTo(0.25);
    terrain.dispose();
  });
});
