import { describe, expect, it } from 'vitest';
import type { BufferAttribute } from 'three';

import { OrbTrail } from '../../src/rendering/OrbTrail';

/**
 * §131 narrowed the ribbon, §133 capped its angular width, and the user still
 * had a pink wedge across the view. §151 gave up on the ribbon: a strip of
 * quads is a surface, and a surface has edges, so somewhere on screen there
 * will always be a straight line.
 *
 * The trail is residue now. These tests hold the properties that make it
 * impossible for the old bug to come back — not the shape of a width curve.
 */

function trailState(trail: OrbTrail) {
  const geometry = trail.mesh.geometry;
  const position = geometry.getAttribute('position') as BufferAttribute;
  const life = geometry.getAttribute('aLife') as BufferAttribute;
  const alive: { x: number; y: number; z: number; life: number }[] = [];
  for (let i = 0; i < life.count; i++) {
    if (life.getX(i) <= 0) continue;
    alive.push({ x: position.getX(i), y: position.getY(i), z: position.getZ(i), life: life.getX(i) });
  }
  return alive;
}

/** Flies a straight line — the case that used to produce the wedge. */
function fly(trail: OrbTrail, steps: number, step = 1.2) {
  for (let i = 0; i < steps; i++) {
    trail.update(
      { x: 0, y: 20, z: -i * step },
      { x: 0, y: 0, z: -step * 60 },
      1,
      0.5,
      1 / 60,
    );
  }
}

describe('§151 the trail is residue, not a ribbon', () => {
  it('leaves nothing behind when the orb is not moving', () => {
    const trail = new OrbTrail();
    for (let i = 0; i < 60; i++) {
      trail.update({ x: 5, y: 20, z: 5 }, { x: 0, y: 0, z: 0 }, 0, 0, 1 / 60);
    }
    expect(trailState(trail)).toHaveLength(0);
    trail.dispose();
  });

  it('scatters off the flight path instead of sitting on it', () => {
    const trail = new OrbTrail();
    fly(trail, 40);
    const alive = trailState(trail);
    expect(alive.length).toBeGreaterThan(20);
    // The path is x = 0. If every mote sat on it, the residue would be a line
    // again — which is the entire bug. It has to have body across the path.
    const spread = Math.max(...alive.map((m) => Math.abs(m.x)));
    expect(spread).toBeGreaterThan(0.1);
    // And it must not be a wall either: the scatter stays close to the orb.
    expect(spread).toBeLessThan(6);
  });

  it('never grows without bound, however long the flight', () => {
    const trail = new OrbTrail();
    fly(trail, 4000);
    // The buffer is a ring: old residue is recycled, not accumulated.
    expect(trail.mesh.geometry.getAttribute('position').count).toBe(700);
    expect(trailState(trail).length).toBeLessThanOrEqual(700);
    trail.dispose();
  });

  it('fades every mote out rather than leaving it standing', () => {
    const trail = new OrbTrail();
    fly(trail, 30);
    expect(trailState(trail).length).toBeGreaterThan(0);
    // Stop flying and let time pass: the residue has to go.
    for (let i = 0; i < 200; i++) {
      trail.update({ x: 0, y: 20, z: -36 }, { x: 0, y: 0, z: 0 }, 0, 0, 1 / 60);
    }
    expect(trailState(trail)).toHaveLength(0);
    trail.dispose();
  });

  it('drops the same residue for the same flight', () => {
    const a = new OrbTrail();
    const b = new OrbTrail();
    fly(a, 25);
    fly(b, 25);
    expect(trailState(a)).toEqual(trailState(b));
    a.dispose();
    b.dispose();
  });
});
