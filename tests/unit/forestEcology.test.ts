import { describe, expect, it } from 'vitest';

import {
  cellRandom,
  ECOLOGIES,
  ecologyFor,
  FOREST_GRID,
  growthsInCell,
  isEarned,
  NEUTRAL_ECOLOGY,
  roleFor,
  type GrowthRole,
} from '../../src/rendering/ForestEcology';
import { createInitialTrackState } from '../../src/music/TrackState';

const SEED = 12345;

describe('§36 the forest is the score', () => {
  it('grows the same forest for the same cell, every time', () => {
    const a = growthsInCell(SEED, 4, -2, ECOLOGIES.techno, undefined);
    const b = growthsInCell(SEED, 4, -2, ECOLOGIES.techno, undefined);
    expect(a).toEqual(b);
  });

  it('grows a different forest in a different place', () => {
    const a = growthsInCell(SEED, 4, -2, ECOLOGIES.techno, undefined);
    const b = growthsInCell(SEED, 5, -2, ECOLOGIES.techno, undefined);
    expect(a).not.toEqual(b);
  });

  it('places growths inside their own cell', () => {
    for (const growth of growthsInCell(SEED, 3, 7, ECOLOGIES.jazz, undefined)) {
      expect(growth.x).toBeGreaterThanOrEqual(3 * FOREST_GRID.cellSize);
      expect(growth.x).toBeLessThan(4 * FOREST_GRID.cellSize);
      expect(growth.z).toBeGreaterThanOrEqual(7 * FOREST_GRID.cellSize);
      expect(growth.z).toBeLessThan(8 * FOREST_GRID.cellSize);
    }
  });

  it('gives every grammar its own ecosystem name and shape', () => {
    const names = Object.values(ECOLOGIES).map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    // The machine forest stands straight; the mutation forest does not.
    expect(ECOLOGIES.techno.irregularity).toBeLessThan(ECOLOGIES.experimental.irregularity);
    // Trap is the heaviest, ambient the lightest.
    expect(ECOLOGIES.trap.heightScale).toBeGreaterThan(ECOLOGIES.ambient.heightScale);
    expect(ecologyFor(null)).toBe(NEUTRAL_ECOLOGY);
  });

  it('lets each ecology favour its own growths', () => {
    const draws = 400;
    const count = (ecology: typeof ECOLOGIES.techno, role: GrowthRole) => {
      let n = 0;
      for (let i = 0; i < draws; i++) if (roleFor(ecology, i / draws) === role) n++;
      return n;
    };
    // Dub is roots and canopy; techno is trunks and needles.
    expect(count(ECOLOGIES.dub, 'root')).toBeGreaterThan(count(ECOLOGIES.techno, 'root'));
    expect(count(ECOLOGIES.techno, 'thin')).toBeGreaterThan(count(ECOLOGIES.dub, 'thin'));
  });

  it('marks growths earned only once their layer is unlocked', () => {
    const track = createInitialTrackState();
    expect(isEarned('trunk', track)).toBe(false);
    track.drums.kick = { unlocked: true, level: 1 };
    expect(isEarned('trunk', track)).toBe(true);
    expect(isEarned('canopy', track)).toBe(false);
    track.harmony = { unlocked: true, level: 1 };
    expect(isEarned('canopy', track)).toBe(true);
  });

  it('makes only the largest formations solid', () => {
    const growths = [];
    for (let cx = 0; cx < 30; cx++) {
      growths.push(...growthsInCell(SEED, cx, 0, ECOLOGIES.trap, undefined));
    }
    const solid = growths.filter((g) => g.solid);
    expect(solid.length).toBeGreaterThan(0);
    expect(solid.length).toBeLessThan(growths.length / 2);
    for (const g of solid) expect(g.height).toBeGreaterThanOrEqual(FOREST_GRID.solidHeight);
  });

  it('spreads its randomness evenly', () => {
    let sum = 0;
    const n = 500;
    for (let i = 0; i < n; i++) sum += cellRandom(SEED, i, i * 3, 1);
    expect(sum / n).toBeGreaterThan(0.4);
    expect(sum / n).toBeLessThan(0.6);
  });
});

describe('§55 every world has its own shape language', () => {
  const WORLDS = [
    'techno', 'garage', 'jazz', 'house', 'ambient',
    'breakbeat', 'dnb', 'trap', 'dub', 'experimental',
  ] as const;

  it('no two worlds are built from the same pair of forms', () => {
    const pairs = WORLDS.map((genre) => ecologyFor(genre).forms.join('+'));
    expect(new Set(pairs).size).toBe(WORLDS.length);
  });

  it('and no world is built from one form twice', () => {
    for (const genre of WORLDS) {
      const [primary, accent] = ecologyFor(genre).forms;
      expect(`${genre}:${primary}`).not.toBe(`${genre}:${accent}`);
    }
  });

  it('keeps the machine straight and the cloud soft', () => {
    expect(ecologyFor('techno').forms[0]).toBe('pillar');
    expect(ecologyFor('ambient').forms[0]).toBe('membrane');
    expect(ecologyFor('dnb').forms[0]).toBe('shard');
    expect(ecologyFor('trap').forms[0]).toBe('monolith');
    expect(ecologyFor('breakbeat').forms[0]).toBe('monolith');
  });
});
