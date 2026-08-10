import { describe, expect, it } from 'vitest';
import { createStore } from '../../src/core/stores';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import type { InputSnapshot } from '../../src/input/InputManager';
import {
  AMPLITUDE_CONFIG,
  FLIGHT_CONFIG,
  FREQUENCY_CONFIG,
  CRUISE_SPEED,
  FULL_SPEED,
  FrequencyController,
  directionFromLook,
  mapWheelToHz,
  smoothAmplitude,
  stepVelocity,
} from '../../src/player/FrequencyController';

function snapshot(partial: Partial<InputSnapshot> = {}): InputSnapshot {
  return {
    axes: { moveX: 0, moveZ: 0 },
    buttons: { accelerate: false, windHold: false },
    windReleased: false,
    resonancePulse: false,
    pausePressed: false,
    trackExported: false,
    codeToggled: false,
    wheelDelta: 0,
    mouseDelta: { x: 0, y: 0 },
    ...partial,
    ...(partial.axes ? { axes: partial.axes } : {}),
    ...(partial.buttons ? { buttons: partial.buttons } : {}),
  };
}

describe('mapWheelToHz', () => {
  it('is monotonic: scrolling up (negative deltaY) raises frequency', () => {
    const deltas = [-300, -100, 0, 100, 300];
    const results = deltas.map((d) => mapWheelToHz(440, d));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeLessThan(results[i - 1]!);
    }
    expect(mapWheelToHz(440, -100)).toBeGreaterThan(440);
    expect(mapWheelToHz(440, 100)).toBeLessThan(440);
  });

  it('clamps to the configured frequency range', () => {
    let hz = 440;
    for (let i = 0; i < 200; i++) hz = mapWheelToHz(hz, -600);
    expect(hz).toBeLessThanOrEqual(FREQUENCY_CONFIG.maxHz);
    for (let i = 0; i < 400; i++) hz = mapWheelToHz(hz, 600);
    expect(hz).toBeGreaterThanOrEqual(FREQUENCY_CONFIG.minHz);
  });

  it('rate-limits a single enormous wheel delta', () => {
    const maxJump =
      2 ** (FREQUENCY_CONFIG.maxWheelDeltaPerUpdate * FREQUENCY_CONFIG.octavesPerWheelDelta);
    expect(mapWheelToHz(440, -1e6)).toBeLessThanOrEqual(440 * maxJump + 1e-9);
    expect(mapWheelToHz(440, 1e6)).toBeGreaterThanOrEqual((440 / maxJump) - 1e-9);
  });
});

describe('smoothAmplitude', () => {
  it('converges toward the target and stays bounded in [0, 1]', () => {
    let a = 0;
    for (let i = 0; i < 500; i++) {
      a = smoothAmplitude(a, 1, 16);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    expect(a).toBeCloseTo(1, 2);
    for (let i = 0; i < 2000; i++) a = smoothAmplitude(a, 0, 16);
    expect(a).toBeCloseTo(0, 2);
  });

  it('attack is faster than release', () => {
    const up = smoothAmplitude(0, 1, 50);
    const down = 1 - smoothAmplitude(1, 0, 50);
    expect(up).toBeGreaterThan(down);
  });

  it('is frame-rate independent: two half-steps equal one full step', () => {
    const one = smoothAmplitude(0.2, 1, 16);
    const two = smoothAmplitude(smoothAmplitude(0.2, 1, 8), 1, 8);
    expect(two).toBeCloseTo(one, 10);
  });
});

describe('stepVelocity', () => {
  it('drag brings velocity to rest without input', () => {
    let v = { x: 10, y: -4, z: 7 };
    for (let i = 0; i < 500; i++) {
      v = stepVelocity(v, { x: 0, y: 0, z: 0 }, 0, 16);
    }
    expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(0.01);
  });

  it('enforces maximum speed under sustained acceleration', () => {
    let v = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 1000; i++) {
      v = stepVelocity(v, { x: 0, y: 0, z: -1 }, FLIGHT_CONFIG.acceleration * 100, 16);
      expect(Math.hypot(v.x, v.y, v.z)).toBeLessThanOrEqual(FLIGHT_CONFIG.maxSpeed + 1e-9);
    }
  });

  it('returns a new object and does not mutate its input', () => {
    const v = Object.freeze({ x: 1, y: 2, z: 3 });
    const next = stepVelocity(v, { x: 0, y: 0, z: 0 }, 0, 16);
    expect(next).not.toBe(v);
    expect(v).toEqual({ x: 1, y: 2, z: 3 });
  });
});

describe('directionFromLook', () => {
  it('faces -Z at rest and returns unit vectors', () => {
    const d = directionFromLook(0, 0);
    expect(d.x).toBeCloseTo(0, 10);
    expect(d.y).toBeCloseTo(0, 10);
    expect(d.z).toBeCloseTo(-1, 10);
    const tilted = directionFromLook(1.2, 0.7);
    expect(Math.hypot(tilted.x, tilted.y, tilted.z)).toBeCloseTo(1, 10);
  });
});

describe('FrequencyController', () => {
  it('moves the player forward and updates the store immutably', () => {
    const store = createStore(createInitialFrequencyState());
    const controller = new FrequencyController(store);
    const before = store.getState();
    controller.update(snapshot({ axes: { moveX: 0, moveZ: 1 } }), 16);
    const after = store.getState();
    expect(after).not.toBe(before);
    expect(after.position).not.toBe(before.position);
    expect(before.position.z).toBe(0);
    expect(after.velocity).toBeGreaterThan(0);
    controller.update(snapshot({ axes: { moveX: 0, moveZ: 1 } }), 16);
    expect(store.getState().position.z).toBeLessThan(0);
  });

  it('maps wheel input to frequency inside the store', () => {
    const store = createStore(createInitialFrequencyState());
    const controller = new FrequencyController(store);
    const startHz = store.getState().hz;
    controller.update(snapshot({ wheelDelta: -100 }), 16);
    const raised = store.getState().hz;
    expect(raised).toBeGreaterThan(startHz);
    controller.update(snapshot({ wheelDelta: 200 }), 16);
    expect(store.getState().hz).toBeLessThan(raised);
  });

  it('builds amplitude while wind is held and releases it after', () => {
    const store = createStore(createInitialFrequencyState());
    const controller = new FrequencyController(store);
    for (let i = 0; i < 200; i++) {
      controller.update(snapshot({ buttons: { accelerate: false, windHold: true } }), 16);
      const a = store.getState().amplitude;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    const held = store.getState().amplitude;
    expect(held).toBeGreaterThan(0.9);
    for (let i = 0; i < 2000; i++) controller.update(snapshot(), 16);
    expect(store.getState().amplitude).toBeLessThan(0.05);
  });

  it('derives bounded energy from speed and updates look direction', () => {
    const store = createStore(createInitialFrequencyState());
    const controller = new FrequencyController(store);
    for (let i = 0; i < 300; i++) {
      controller.update(
        snapshot({
          axes: { moveX: 0, moveZ: 1 },
          buttons: { accelerate: true, windHold: false },
        }),
        16,
      );
    }
    const state = store.getState();
    expect(state.energy).toBeGreaterThan(0.5);
    expect(state.energy).toBeLessThanOrEqual(1);
    controller.update(snapshot({ mouseDelta: { x: 200, y: 0 } }), 16);
    expect(store.getState().direction.x).not.toBeCloseTo(0, 3);
  });

  it('clamps pitch so the camera cannot flip over', () => {
    const store = createStore(createInitialFrequencyState());
    const controller = new FrequencyController(store);
    controller.update(snapshot({ mouseDelta: { x: 0, y: -1e6 } }), 16);
    const d = store.getState().direction;
    expect(d.y).toBeLessThanOrEqual(1);
    expect(Math.hypot(d.x, d.z)).toBeGreaterThan(0.001);
  });

  it('respects the configured amplitude bounds config', () => {
    expect(AMPLITUDE_CONFIG.attackMs).toBeLessThan(AMPLITUDE_CONFIG.releaseMs);
  });
});

describe('§46 speed is the throttle, not a gearbox', () => {
  function settleSpeed(throttle: boolean): number {
    const store = createStore(createInitialFrequencyState());
    const controller = new FrequencyController(store);
    for (let i = 0; i < 400; i++) {
      controller.update(
        snapshot({
          axes: { moveX: 0, moveZ: 1 },
          buttons: { accelerate: throttle, windHold: throttle },
        }),
        16,
      );
    }
    return store.getState().velocity;
  }

  it('cruises without the throttle and reaches full speed with it', () => {
    expect(settleSpeed(false)).toBeGreaterThan(CRUISE_SPEED * 0.9);
    expect(settleSpeed(false)).toBeLessThanOrEqual(CRUISE_SPEED + 0.01);
    expect(settleSpeed(true)).toBeGreaterThan(FULL_SPEED * 0.9);
    expect(settleSpeed(true)).toBeLessThanOrEqual(FULL_SPEED + 0.01);
  });

  it('full speed is a different kind of flying, not a nudge', () => {
    expect(settleSpeed(true)).toBeGreaterThan(settleSpeed(false) * 3);
  });

  it('releasing the throttle coasts down slowly instead of dropping', () => {
    const store = createStore(createInitialFrequencyState());
    const controller = new FrequencyController(store);
    const fly = (throttle: boolean, ms: number) => {
      for (let t = 0; t < ms; t += 16) {
        controller.update(
          snapshot({
            axes: { moveX: 0, moveZ: 1 },
            buttons: { accelerate: throttle, windHold: throttle },
          }),
          16,
        );
      }
    };
    fly(true, 6000);
    const wideOpen = store.getState().velocity;
    fly(false, 700);
    const justAfter = store.getState().velocity;
    // Still clearly fast a moment later: the boost is something you ride out.
    expect(justAfter).toBeLessThan(wideOpen);
    expect(justAfter).toBeGreaterThan(CRUISE_SPEED * 2);
    fly(false, 6000);
    expect(store.getState().velocity).toBeLessThanOrEqual(CRUISE_SPEED + 0.01);
  });
});
