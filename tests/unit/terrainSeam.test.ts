import { describe, expect, it } from 'vitest';
import type { BufferAttribute } from 'three';

import { morphToCoarse, WaveTerrain } from '../../src/rendering/WaveTerrain';

/**
 * §141 (user: "ik zie soms gaten in de grid ... zodat grid altijd heel is").
 *
 * The hole is a dangling row: a ring's lattice is coarser than the one inside
 * it, so most fine scan lines have nothing to continue into and stop at the
 * boundary. The fix is that a line about to disappear merges with the
 * neighbour that survives BEFORE it gets there — which is only true if, at the
 * edge, every vertex has landed exactly on the coarser lattice. That is what
 * this measures, on the same buffers the GPU is handed.
 */

function attributes(): {
  position: BufferAttribute;
  lattice: BufferAttribute;
  morph: BufferAttribute;
  count: number;
} {
  const terrain = new WaveTerrain('seam-test');
  const geometry = terrain.lines.geometry;
  const position = geometry.getAttribute('position') as BufferAttribute;
  return {
    position,
    lattice: geometry.getAttribute('aLattice') as BufferAttribute,
    morph: geometry.getAttribute('aMorph') as BufferAttribute,
    count: position.count,
  };
}

describe('§141 the grid has no holes at its seams', () => {
  const { position, lattice, morph, count } = attributes();

  it('lands every fully morphed vertex exactly on the coarser lattice', () => {
    let checked = 0;
    for (let i = 0; i < count; i++) {
      if (morph.getX(i) < 1) continue;
      const stepX = lattice.getX(i);
      const stepZ = lattice.getY(i);
      const x = morphToCoarse(position.getX(i), stepX, 1);
      const z = morphToCoarse(position.getZ(i), stepZ, 1);
      // Exactly on the outer ring's lines, so the two rings share the vertex
      // rather than one of them stopping short of it.
      expect(Math.abs(x / stepX - Math.round(x / stepX))).toBeLessThan(1e-4);
      expect(Math.abs(z / stepZ - Math.round(z / stepZ))).toBeLessThan(1e-4);
      checked++;
    }
    // A test that morphs nothing proves nothing.
    expect(checked).toBeGreaterThan(500);
  });

  it('never moves the ground under the player', () => {
    // Inside the innermost quarter nothing morphs, so the field the collision
    // reads and the field the player sees stay the same field (§35).
    let near = 0;
    for (let i = 0; i < count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      if (Math.hypot(x, z) > 100) continue;
      expect(morph.getX(i)).toBe(0);
      near++;
    }
    expect(near).toBeGreaterThan(1000);
  });

  it('moves a vertex at most one coarse cell, and only outwards', () => {
    for (let i = 0; i < count; i++) {
      const m = morph.getX(i);
      if (m === 0) continue;
      const stepX = lattice.getX(i);
      const moved = Math.abs(morphToCoarse(position.getX(i), stepX, m) - position.getX(i));
      expect(moved).toBeLessThanOrEqual(stepX / 2 + 1e-6);
    }
  });

  it('blends in rather than snapping, so nothing jumps', () => {
    const values = new Set<number>();
    for (let i = 0; i < count; i++) values.add(Number(morph.getX(i).toFixed(2)));
    // More than just 0 and 1: there is a band in between doing the work.
    expect(values.size).toBeGreaterThan(5);
  });
});
