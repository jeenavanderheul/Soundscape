import { describe, expect, it } from 'vitest';
import { TOUCH_CONFIG, lookDeltaPerFrame, stickDeflection, touchZone } from '../../src/input/touch';
import { InputManager } from '../../src/input/InputManager';
import { guideLines, type GuideState } from '../../src/ui/Guide';

describe('touchZone', () => {
  it('gives the left half to flight and the right half to wind', () => {
    expect(touchZone(0, 800)).toBe('flight');
    expect(touchZone(399, 800)).toBe('flight');
    expect(touchZone(400, 800)).toBe('wind');
    expect(touchZone(799, 800)).toBe('wind');
  });
});

describe('stickDeflection', () => {
  it('is zero at the landing point', () => {
    expect(stickDeflection(100, 100, 100, 100)).toEqual({ x: 0, y: 0 });
  });

  it('ignores movement inside the deadzone', () => {
    const inside = TOUCH_CONFIG.stickRadiusPx * TOUCH_CONFIG.deadzone * 0.9;
    expect(stickDeflection(100, 100, 100 + inside, 100 - inside)).toEqual({ x: 0, y: 0 });
  });

  it('maps radius to full deflection and clamps beyond it', () => {
    const r = TOUCH_CONFIG.stickRadiusPx;
    expect(stickDeflection(100, 100, 100 + r, 100)).toEqual({ x: 1, y: 0 });
    expect(stickDeflection(100, 100, 100 + 3 * r, 100)).toEqual({ x: 1, y: 0 });
    // Screen y grows downward; deflection y is up-positive.
    expect(stickDeflection(100, 100, 100, 100 - r)).toEqual({ x: 0, y: 1 });
    expect(stickDeflection(100, 100, 100, 100 + r)).toEqual({ x: 0, y: -1 });
  });

  it('scales linearly between deadzone and radius', () => {
    const half = stickDeflection(0, 0, TOUCH_CONFIG.stickRadiusPx / 2, 0);
    expect(half.x).toBeCloseTo(0.5);
  });
});

describe('lookDeltaPerFrame', () => {
  it('turns right-deflection into positive mouse-x (turn right)', () => {
    expect(lookDeltaPerFrame({ x: 1, y: 0 }).x).toBe(TOUCH_CONFIG.lookPxPerFrame.x);
  });

  it('turns up-deflection into negative mouse-y (climb, like pushing the mouse up)', () => {
    expect(lookDeltaPerFrame({ x: 0, y: 1 }).y).toBe(-TOUCH_CONFIG.lookPxPerFrame.y);
  });

  it('is silent at rest', () => {
    expect(lookDeltaPerFrame({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('InputManager touch layer', () => {
  const make = (): InputManager => new InputManager(new EventTarget(), new EventTarget());

  it('touch throttle is this game\'s W: accelerate AND forward thrust, persisting', () => {
    const input = make();
    input.setSyntheticThrottle(true);
    const snap = input.snapshot();
    expect(snap.buttons.accelerate).toBe(true);
    expect(snap.axes.moveZ).toBe(1);
    expect(input.snapshot().axes.moveZ).toBe(1);
    input.setSyntheticThrottle(false);
    const off = input.snapshot();
    expect(off.buttons.accelerate).toBe(false);
    expect(off.axes.moveZ).toBe(0);
  });

  it('a held deflection keeps steering every frame', () => {
    const input = make();
    input.setSyntheticLook(TOUCH_CONFIG.lookPxPerFrame.x, 0);
    expect(input.snapshot().mouseDelta.x).toBe(TOUCH_CONFIG.lookPxPerFrame.x);
    expect(input.snapshot().mouseDelta.x).toBe(TOUCH_CONFIG.lookPxPerFrame.x);
    input.setSyntheticLook(0, 0);
    expect(input.snapshot().mouseDelta.x).toBe(0);
  });

  it('wind press/release behaves like LMB: hold then a single timed pulse', () => {
    const input = make();
    input.syntheticWindPress();
    expect(input.snapshot().buttons.windHold).toBe(true);
    expect(input.snapshot().windReleased).toBe(false);
    input.syntheticWindRelease();
    const released = input.snapshot();
    expect(released.buttons.windHold).toBe(false);
    expect(released.windReleased).toBe(true);
    expect(input.snapshot().windReleased).toBe(false);
  });

  it('release without a press is not a pulse', () => {
    const input = make();
    input.syntheticWindRelease();
    expect(input.snapshot().windReleased).toBe(false);
  });

  it('detach clears the touch state', () => {
    const input = make();
    input.attach();
    input.setSyntheticThrottle(true);
    input.setSyntheticLook(1, 1);
    input.detach();
    const snap = input.snapshot();
    expect(snap.buttons.accelerate).toBe(false);
    expect(snap.mouseDelta).toEqual({ x: 0, y: 0 });
  });
});

describe('guideLines on touch', () => {
  const state: GuideState = { genre: null, heading: 'N', energy: 0.2, beacon: null };

  it('speaks thumb instead of W', () => {
    expect(guideLines(state, true)[2]).toBe('hold your left thumb · speed is what builds it');
    expect(guideLines(state, false)[2]).toBe('hold W · speed is what builds it');
  });
});
