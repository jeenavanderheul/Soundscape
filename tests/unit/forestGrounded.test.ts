import { describe, expect, it } from 'vitest';
import type { InstancedBufferAttribute, Points } from 'three';

import { ForestRenderer, type TreeSpecies } from '../../src/rendering/ForestRenderer';

// Same shape as the other file-reading test in this suite: no @types/node here.
declare function require(id: string): {
  readFileSync(p: string, enc?: string): { buffer: ArrayBuffer; byteOffset: number; byteLength: number } & string;
};
const { readFileSync } = require('node:fs');

/**
 * HARD USER RULE (2026-08-15): "bomen blijven altijd op het grid, nooit
 * zwevend in de lucht."
 *
 * This reads the matrices the renderer actually uploaded, rather than trusting
 * that the placement code says the right thing — a growth that floats is a
 * growth whose instance matrix says so, and nothing else can be the evidence.
 */

/** A ground with real relief, so "on the ground" cannot pass by being flat. */
const ground = (x: number, z: number): number =>
  -6 + Math.sin(x * 0.05) * 7 + Math.cos(z * 0.031) * 5;

/** The real baked clouds, so the test runs on the data the game ships. */
function bakedSpecies(): Map<string, TreeSpecies> {
  const manifest = JSON.parse(readFileSync('public/trees/trees.json', 'utf8')) as {
    species: { id: string; points: number }[];
  };
  const out = new Map<string, TreeSpecies>();
  for (const entry of manifest.species) {
    const file = readFileSync(`public/trees/${entry.id}.bin`);
    out.set(entry.id, {
      id: entry.id,
      points: new Float32Array(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)),
    });
  }
  return out;
}

/** Reads the instance offsets the renderer actually uploaded. */
function everyInstance(forest: ForestRenderer): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (const child of forest.group.children) {
    const points = child as Points;
    const geometry = points.geometry as unknown as { instanceCount: number };
    const offsets = points.geometry.getAttribute('iPosition') as InstancedBufferAttribute;
    for (let i = 0; i < geometry.instanceCount; i++) {
      out.push({ x: offsets.getX(i), y: offsets.getY(i), z: offsets.getZ(i) });
    }
  }
  return out;
}

describe('the forest stands on the ground', () => {
  it('places every growth exactly on the terrain, in every world', () => {
    for (const genre of [null, 'techno', 'sub-pressure', 'percussion-riot', 'void-crusher'] as const) {
      const forest = new ForestRenderer('grounded-test');
      forest.setSpecies(bakedSpecies());
      forest.setGroundSampler(ground);
      forest.update({ x: 40, y: 20, z: -70 }, genre, undefined, 3);
      const instances = everyInstance(forest);
      expect(instances.length).toBeGreaterThan(20);
      for (const instance of instances) {
        // 3 decimals, not more: the matrix round-trips through float32, and
        // §179 pushed the forest's coordinates up by GROWTH_SCALE, so float32's
        // relative error is now worth ~6e-5 instead of ~4e-5. The bug this
        // guards against was sixteen units of float, not a thousandth.
        expect(instance.y).toBeCloseTo(ground(instance.x, instance.z), 3);
      }
      forest.dispose();
    }
  });

  it('does not float when the ground moves under it', () => {
    const forest = new ForestRenderer('grounded-test');
    forest.setSpecies(bakedSpecies());
    let lift = 0;
    forest.setGroundSampler((x, z) => ground(x, z) + lift);
    forest.update({ x: 0, y: 20, z: 0 }, 'techno', undefined, 0);
    lift = 12; // the field swells under the forest
    forest.update({ x: 0, y: 20, z: 0 }, 'techno', undefined, 1);
    for (const instance of everyInstance(forest)) {
      expect(instance.y).toBeCloseTo(ground(instance.x, instance.z) + 12, 3);
    }
    forest.dispose();
  });
});
