import { describe, expect, it } from 'vitest';
import { createStore } from '../../src/core/stores';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import type { InputSnapshot } from '../../src/input/InputManager';
import {
  AMPLITUDE_CONFIG,
  FLIGHT_CONFIG,
  CRUISE_SPEED,
  FULL_SPEED,
  THROTTLE_NOTCHES,
  FrequencyController,
  directionFromLook,
  smoothAmplitude,
  stepVelocity,
} from '../../src/player/FrequencyController';

function snapshot(partial: Partial<InputSnapshot> = {}): InputSnapshot {
  return {
    axes: { moveX: 0, moveZ: 0 },
    buttons: { accelerate: false, windHold: false, hyper: false },
    windReleased: false,
    resonancePulse: false,
    pausePressed: false,
    trackExported: false,
    guideToggled: false,
    codeToggled: false,
    mouseDelta: { x: 0, y: 0 },
    ...partial,
    ...(partial.axes ? { axes: partial.axes } : {}),
    ...(partial.buttons ? { buttons: partial.buttons } : {}),
  };
}

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


  it('builds amplitude while wind is held and releases it after', () => {
    const store = createStore(createInitialFrequencyState());
    const controller = new FrequencyController(store);
    for (let i = 0; i < 200; i++) {
      controller.update(snapshot({ buttons: { accelerate: false, windHold: true, hyper: false } }), 16);
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
          buttons: { accelerate: true, windHold: false, hyper: false },
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
          buttons: { accelerate: throttle, windHold: throttle, hyper: false },
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
            buttons: { accelerate: throttle, windHold: throttle, hyper: false },
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

describe('§51 the throttle is notched, so tapping steers the speed', () => {
  function press(controller: FrequencyController, downMs: number, upMs: number): void {
    for (let t = 0; t < downMs; t += 16) {
      controller.update(snapshot({ buttons: { accelerate: true, windHold: true, hyper: false } }), 16);
    }
    for (let t = 0; t < upMs; t += 16) {
      controller.update(snapshot({ buttons: { accelerate: false, windHold: false, hyper: false } }), 16);
    }
  }

  it('a single tap moves it by a visible amount', () => {
    const controller = new FrequencyController(createStore(createInitialFrequencyState()));
    press(controller, 60, 0);
    expect(controller.throttleLevel).toBeGreaterThan(0.05);
    expect(controller.throttleLevel).toBeLessThan(0.3);
  });

  it('tapping repeatedly climbs, and letting go walks back down', () => {
    const controller = new FrequencyController(createStore(createInitialFrequencyState()));
    for (let i = 0; i < 6; i++) press(controller, 60, 60);
    const tapped = controller.throttleLevel;
    expect(tapped).toBeGreaterThan(0.3);
    press(controller, 0, 600);
    const after = controller.throttleLevel;
    expect(after).toBeLessThan(tapped);
    expect(after).toBeGreaterThan(0); // it steps down, it does not fall off
  });

  it('rests on quarters of a block, never between them', () => {
    const controller = new FrequencyController(createStore(createInitialFrequencyState()));
    for (let i = 0; i < 40; i++) {
      press(controller, 32, 48);
      const notch = controller.throttleLevel * THROTTLE_NOTCHES;
      expect(Math.abs(notch - Math.round(notch))).toBeLessThan(1e-9);
    }
  });
});

describe('§129 W flies, the wind sounds, Shift is hyper', () => {
  const speedAfter = (
    buttons: { accelerate: boolean; windHold: boolean; hyper: boolean },
    seconds: number,
  ): number => {
    const store = createStore(createInitialFrequencyState());
    const controller = new FrequencyController(store);
    const input = snapshot({
      axes: { moveX: 0, moveZ: buttons.accelerate ? 1 : 0 },
      buttons,
    });
    for (let ms = 0; ms < seconds * 1000; ms += 16) controller.update(input, 16);
    return store.getState().velocity;
  };

  it('doubles the speed the throttle had reached', () => {
    const open = speedAfter({ accelerate: true, windHold: false, hyper: false }, 40);
    const hyper = speedAfter({ accelerate: true, windHold: false, hyper: true }, 40);
    expect(hyper / open).toBeGreaterThan(1.8);
    expect(hyper / open).toBeLessThan(2.2);
  });

  it('is a burst, not a gear: held at a standstill it takes you nowhere', () => {
    // Multiplying rather than adding notches is what makes this true — hyper
    // doubles whatever the throttle already gave you, so at rest it is rest.
    expect(speedAfter({ accelerate: false, windHold: false, hyper: true }, 6)).toBeLessThan(1);
  });

  it('the wind alone never moves the orb', () => {
    // It used to open the throttle, so a long tone flew you across the world.
    expect(speedAfter({ accelerate: false, windHold: true, hyper: false }, 8)).toBeLessThan(1);
  });
});

describe('§180 the sky stands above the canopy', () => {
  const climbFor = (seconds: number, throttle: boolean): number => {
    const store = createStore(createInitialFrequencyState());
    const controller = new FrequencyController(store);
    controller.setGroundSampler(() => 0);
    store.setState((s) => ({ ...s, position: { x: 0, y: 2, z: 0 } }));
    controller.update(snapshot({ mouseDelta: { x: 0, y: -2000 } }), 16); // look straight up
    const input = snapshot({
      axes: { moveX: 0, moveZ: 1 },
      buttons: { accelerate: throttle, windHold: false, hyper: false },
    });
    for (let ms = 0; ms < seconds * 1000; ms += 16) controller.update(input, 16);
    return store.getState().position.y;
  };

  it('climbing over the forest is possible at all: past the shortest tree in ten seconds', () => {
    // A growth is drawn at 280 units at its FLOOR (§179b: two 140-unit
    // dancers). With the old 70-unit ceiling this was unreachable — the orb
    // stopped in mid-air with full thrust still pointing up.
    expect(climbFor(10, true)).toBeGreaterThan(280);
  });

  it('the ceiling clears the tallest giant, so climbing never stops under the trees', () => {
    expect(FLIGHT_CONFIG.maxY).toBeGreaterThan(1125);
  });

  it('cruising up still climbs steadily rather than hitting a wall', () => {
    const five = climbFor(5, false);
    const ten = climbFor(10, false);
    expect(five).toBeGreaterThan(50);
    expect(ten - five).toBeGreaterThan(50);
  });
});
