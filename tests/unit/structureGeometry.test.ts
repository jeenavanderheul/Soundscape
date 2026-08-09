import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { createRng } from '../../src/core/rng';
import {
  buildStructureGeometry,
  resolveSurfaceProfile,
  STRUCTURE_GEOMETRY_CONFIG,
  type StructureData,
} from '../../src/rendering/structureGeometry';
import { hzToDetail, hzToScale } from '../../src/world/StructureData';

function makeData(overrides: Partial<StructureData> = {}): StructureData {
  const hz = overrides.hz ?? 220;
  return {
    id: 'structure-1',
    createdAtMs: 1000,
    position: { x: 0, y: 0, z: 0 },
    sourceResonatorId: 'resonator-first',
    hz,
    waveform: 'sine',
    scale: hzToScale(hz),
    detailLevel: hzToDetail(hz),
    stability: 1,
    persistence: 0.5,
    seed: 'seed-1',
    materialProfile: 'glass',
    ...overrides,
  };
}

function build(overrides: Partial<StructureData> = {}): BufferGeometry {
  const data = makeData(overrides);
  return buildStructureGeometry(data, createRng(data.seed));
}

function positionsOf(geometry: BufferGeometry): Float32Array {
  return geometry.getAttribute('position')!.array as Float32Array;
}

/** Per-vertex distance to the vertex centroid. */
function radiiOf(geometry: BufferGeometry): number[] {
  const positions = positionsOf(geometry);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const count = positions.length / 3;
  for (let i = 0; i < positions.length; i += 3) {
    cx += positions[i]!;
    cy += positions[i + 1]!;
    cz += positions[i + 2]!;
  }
  cx /= count;
  cy /= count;
  cz /= count;
  const radii: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    radii.push(Math.hypot(positions[i]! - cx, positions[i + 1]! - cy, positions[i + 2]! - cz));
  }
  return radii;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function variance(values: number[]): number {
  const m = mean(values);
  return mean(values.map((v) => (v - m) * (v - m)));
}

/** Scale-independent surface roughness: stddev of radius over mean radius. */
function roughnessOf(geometry: BufferGeometry): number {
  const radii = radiiOf(geometry);
  return Math.sqrt(variance(radii)) / mean(radii);
}

describe('buildStructureGeometry determinism (spec: seeded rng only)', () => {
  it('produces identical geometry for the same seed', () => {
    expect(positionsOf(build())).toEqual(positionsOf(build()));
  });

  it('produces different geometry for a different seed', () => {
    const a = positionsOf(build({ seed: 'seed-1' }));
    const b = positionsOf(build({ seed: 'seed-2' }));
    expect(a.length).toBe(b.length);
    let differs = false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it('is deterministic for unstable structures too (seeded jitter)', () => {
    expect(positionsOf(build({ stability: 0.2 }))).toEqual(positionsOf(build({ stability: 0.2 })));
  });
});

describe('buildStructureGeometry scale and detail (§3.1 pitch = space/scale)', () => {
  it('low hz builds MASS: overall size strictly decreases as frequency rises', () => {
    const radiusOf = (hz: number) => {
      const geometry = build({ hz, scale: hzToScale(hz), detailLevel: hzToDetail(hz) });
      geometry.computeBoundingSphere();
      return geometry.boundingSphere!.radius;
    };
    expect(radiusOf(50)).toBeGreaterThan(radiusOf(400));
    expect(radiusOf(400)).toBeGreaterThan(radiusOf(4000));
  });

  it('high hz builds DETAIL: relative surface roughness increases with frequency', () => {
    const roughnessAt = (hz: number) =>
      roughnessOf(build({ hz, scale: hzToScale(hz), detailLevel: hzToDetail(hz) }));
    expect(roughnessAt(3000)).toBeGreaterThan(roughnessAt(60));
  });
});

describe('buildStructureGeometry stability (§3.6 dissonance = deformation)', () => {
  it('lower stability yields higher radial displacement variance', () => {
    const stable = variance(radiiOf(build({ stability: 0.9 })));
    const shaky = variance(radiiOf(build({ stability: 0.45 })));
    const unstable = variance(radiiOf(build({ stability: 0.2 })));
    expect(shaky).toBeGreaterThan(stable);
    expect(unstable).toBeGreaterThan(shaky);
  });

  it('stability at or above the threshold adds no jitter', () => {
    const at = positionsOf(build({ stability: STRUCTURE_GEOMETRY_CONFIG.instabilityThreshold }));
    const above = positionsOf(build({ stability: 1 }));
    expect(at).toEqual(above);
  });
});

describe('buildStructureGeometry material profiles (§3.7 timbre = matter)', () => {
  it('resolves waveform and world matter names to surface profiles', () => {
    expect(resolveSurfaceProfile('sine')).toBe('smooth');
    expect(resolveSurfaceProfile('glass')).toBe('smooth');
    expect(resolveSurfaceProfile('triangle')).toBe('faceted');
    expect(resolveSurfaceProfile('faceted')).toBe('faceted');
    expect(resolveSurfaceProfile('square')).toBe('blocky');
    expect(resolveSurfaceProfile('digital')).toBe('blocky');
    expect(resolveSurfaceProfile('saw')).toBe('spiked');
    expect(resolveSurfaceProfile('metallic')).toBe('spiked');
    expect(resolveSurfaceProfile('noise')).toBe('jittered');
    expect(resolveSurfaceProfile('fog')).toBe('jittered');
    expect(resolveSurfaceProfile('unknown-matter')).toBe('smooth');
  });

  it('blocky profile snaps vertices to a grid', () => {
    const data = makeData({ materialProfile: 'digital', stability: 1 });
    const geometry = buildStructureGeometry(data, createRng(data.seed));
    const grid = Math.max(data.scale, 0.05) * STRUCTURE_GEOMETRY_CONFIG.snapFraction;
    const positions = positionsOf(geometry);
    for (let i = 0; i < positions.length; i++) {
      const remainder = Math.abs(positions[i]! / grid - Math.round(positions[i]! / grid));
      expect(remainder).toBeLessThan(1e-4);
    }
  });

  it('spiked profile reaches further out than smooth at the same seed', () => {
    const spiked = Math.max(...radiiOf(build({ materialProfile: 'metallic' })));
    const smooth = Math.max(...radiiOf(build({ materialProfile: 'glass' })));
    expect(spiked).toBeGreaterThan(smooth);
  });

  it('jittered profile is rougher than smooth at the same seed', () => {
    const jittered = roughnessOf(build({ materialProfile: 'fog' }));
    const smooth = roughnessOf(build({ materialProfile: 'glass' }));
    expect(jittered).toBeGreaterThan(smooth);
  });
});

describe('buildStructureGeometry output contract', () => {
  it('has positions, normals and a bounding sphere', () => {
    const geometry = build();
    expect(geometry.getAttribute('position')).toBeDefined();
    expect(geometry.getAttribute('normal')).toBeDefined();
    expect(geometry.boundingSphere).not.toBeNull();
  });

  it('never collapses on a tiny scale', () => {
    const geometry = build({ scale: 0 });
    geometry.computeBoundingSphere();
    expect(geometry.boundingSphere!.radius).toBeGreaterThan(0);
  });
});
