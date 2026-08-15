import { describe, expect, it } from 'vitest';
import type { InstancedBufferAttribute, Points } from 'three';

import { ForestRenderer, thinningAt, type TreeSpecies } from '../../src/rendering/ForestRenderer';

declare function require(id: string): {
  readFileSync(p: string, enc?: string): { buffer: ArrayBuffer; byteOffset: number; byteLength: number } & string;
};
const { readFileSync } = require('node:fs');

/**
 * §140 (user: "ik wil de bomen ook dichtbij zien en verdeeld over het terrein,
 * niet alleen in de horizon").
 *
 * The disc used to be filled from its far edge, so the instance budget was
 * spent before the walk ever reached the player. This measures where the trees
 * actually land, in world units from the player, because "the forest is on the
 * horizon" is a distance claim and nothing else can settle it.
 */

function bakedSpecies(): Map<string, TreeSpecies> {
  const manifest = JSON.parse(readFileSync('public/trees/trees.json', 'utf8')) as {
    species: { id: string; points: number; world?: string | null; stage?: string | null }[];
  };
  const out = new Map<string, TreeSpecies>();
  for (const entry of manifest.species) {
    const file = readFileSync(`public/trees/${entry.id}.bin`);
    out.set(entry.id, {
      id: entry.id,
      points: new Float32Array(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)),
      world: entry.world ?? null,
      stage: (entry.stage as TreeSpecies['stage']) ?? null,
    });
  }
  return out;
}

function distancesFromPlayer(x: number, z: number): number[] {
  const forest = new ForestRenderer('spread-test');
  forest.setSpecies(bakedSpecies());
  forest.setGroundSampler(() => -6);
  forest.update({ x, y: 20, z }, 'techno', undefined, 1);
  const out: number[] = [];
  for (const child of forest.group.children) {
    const points = child as Points;
    const geometry = points.geometry as unknown as { instanceCount: number };
    const offsets = points.geometry.getAttribute('iPosition') as InstancedBufferAttribute;
    for (let i = 0; i < geometry.instanceCount; i++) {
      out.push(Math.hypot(offsets.getX(i) - x, offsets.getZ(i) - z));
    }
  }
  forest.dispose();
  return out.sort((a, b) => a - b);
}

describe('§140 the forest stands where the player is', () => {
  const distances = distancesFromPlayer(120, -260);

  it('puts trees within sight of the orb, not only far away', () => {
    expect(distances.length).toBeGreaterThan(100);
    // The nearest tree is close enough to fly between, not a horizon smear.
    expect(distances[0]!).toBeLessThan(30);
    // A quarter of the forest stands inside 100 units.
    const near = distances.filter((d) => d < 100).length;
    expect(near / distances.length).toBeGreaterThan(0.25);
  });

  it('still reaches out towards the horizon', () => {
    expect(distances[distances.length - 1]!).toBeGreaterThan(250);
  });

  it('thins out with distance rather than stopping', () => {
    const band = (from: number, to: number) => distances.filter((d) => d >= from && d < to).length;
    // Per unit of AREA, the near bands must be denser than the far ones —
    // counting raw totals would reward the far bands for being bigger rings.
    const density = (from: number, to: number) => band(from, to) / (Math.PI * (to * to - from * from));
    expect(density(0, 100)).toBeGreaterThan(density(100, 200));
    expect(density(100, 200)).toBeGreaterThan(density(300, 420));
    expect(band(300, 420)).toBeGreaterThan(0);
  });

  it('keeps everything near and only a fraction at the rim', () => {
    expect(thinningAt(0)).toBe(1);
    expect(thinningAt(1)).toBeCloseTo(0.035);
    expect(thinningAt(0.5)).toBeGreaterThan(thinningAt(0.9));
  });
});
