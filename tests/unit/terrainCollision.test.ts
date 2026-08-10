import { describe, expect, it } from 'vitest';

import { createStore } from '../../src/core/stores';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import { FLIGHT_CONFIG, FrequencyController } from '../../src/player/FrequencyController';
import type { InputSnapshot } from '../../src/input/InputManager';
import { createNoiseTable, terrainHeight, valueNoise } from '../../src/rendering/terrainField';

function snapshot(partial: Partial<InputSnapshot> = {}): InputSnapshot {
  return {
    axes: { moveX: 0, moveZ: 0 },
    buttons: { accelerate: false, windHold: false },
    gearUp: false,
    gearDown: false,
    windReleased: false,
    resonancePulse: false,
    pausePressed: false,
    trackExported: false,
    codeToggled: false,
    wheelDelta: 0,
    mouseDelta: { x: 0, y: 0 },
    ...partial,
  };
}

describe('§35 the height field is one field', () => {
  const table = createNoiseTable('world-a');

  it('is deterministic and bounded', () => {
    expect(valueNoise(table, 1.7, -3.2)).toBe(valueNoise(table, 1.7, -3.2));
    for (const [x, y] of [
      [0, 0],
      [12.5, -7.25],
      [-100.1, 60.9],
    ]) {
      const n = valueNoise(table, x!, y!);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it('is continuous — no cliffs between neighbouring samples', () => {
    let previous = terrainHeight(table, 0, 0, 0, 1);
    for (let x = 0; x < 200; x += 0.5) {
      const height = terrainHeight(table, x, 40, 0, 1);
      expect(Math.abs(height - previous)).toBeLessThan(2);
      previous = height;
    }
  });

  it('keeps the void flat and grows relief with distance', () => {
    const near = terrainHeight(table, 5, 5, 0, 1);
    expect(Math.abs(near)).toBeLessThan(0.5);
    let highest = 0;
    for (let x = 100; x < 400; x += 7) {
      highest = Math.max(highest, terrainHeight(table, x, x, 0, 1));
    }
    expect(highest).toBeGreaterThan(5);
  });

  it('stays flat in a region with no relief', () => {
    expect(Math.abs(terrainHeight(table, 300, 300, 0, 0))).toBeLessThan(0.5);
  });

  it('gives two worlds different landscapes', () => {
    const other = createNoiseTable('world-b');
    const a = terrainHeight(table, 250, 120, 0, 1);
    const b = terrainHeight(other, 250, 120, 0, 1);
    expect(a).not.toBeCloseTo(b, 2);
  });
});

describe('§35 HARD RULE — the orb never gets under the landscape', () => {
  const table = createNoiseTable('world-a');
  const ground = (x: number, z: number) => terrainHeight(table, x, z, 0, 1);

  function flyInto(dive: number, steps: number) {
    const store = createStore({
      ...createInitialFrequencyState(),
      position: { x: 200, y: 30, z: 200 },
    });
    const controller = new FrequencyController(store);
    controller.setGroundSampler(ground);
    // Look down and hold forward: fly straight into the ground.
    controller.update(snapshot({ mouseDelta: { x: 0, y: dive } }), 16);
    // Top gear, so the dive is as fast as the game allows.
    for (let i = 0; i < 4; i++) controller.update(snapshot({ gearUp: true }), 16);
    const breaches: number[] = [];
    for (let i = 0; i < steps; i++) {
      controller.update(snapshot({ axes: { moveX: 0, moveZ: 1 }, buttons: { accelerate: true, windHold: false } }), 16);
      const p = store.getState().position;
      const clearance = p.y - ground(p.x, p.z);
      if (clearance < FLIGHT_CONFIG.orbRadius - 0.01) breaches.push(+clearance.toFixed(2));
    }
    return { breaches, final: store.getState().position };
  }

  it('never lets the orb sink below the surface, however hard it dives', () => {
    const { breaches } = flyInto(4000, 400);
    expect(breaches).toEqual([]);
  });

  it('bumps back up instead of stopping dead', () => {
    const { final } = flyInto(4000, 400);
    expect(final.y).toBeGreaterThan(ground(final.x, final.z));
    // It still travelled: a bump is not a wall.
    expect(Math.hypot(final.x - 200, final.z - 200)).toBeGreaterThan(5);
  });

  it('still respects the ceiling', () => {
    const store = createStore({
      ...createInitialFrequencyState(),
      position: { x: 0, y: 0, z: 0 },
    });
    const controller = new FrequencyController(store);
    controller.setGroundSampler(ground);
    controller.update(snapshot({ mouseDelta: { x: 0, y: -4000 } }), 16);
    for (let i = 0; i < 800; i++) {
      controller.update(snapshot({ axes: { moveX: 0, moveZ: 1 }, buttons: { accelerate: true, windHold: false } }), 16);
    }
    expect(store.getState().position.y).toBeLessThanOrEqual(FLIGHT_CONFIG.maxY);
  });
});
