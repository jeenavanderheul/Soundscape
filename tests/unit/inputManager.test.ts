import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/core/EventBus';
import { InputEvents, InputManager } from '../../src/input/InputManager';

function key(type: 'keydown' | 'keyup', code: string, repeat = false): Event {
  return Object.assign(new Event(type), { code, repeat });
}

function mouse(type: 'mousedown' | 'mouseup', button: number, ms = 0): Event {
  const event = Object.assign(new Event(type), { button });
  Object.defineProperty(event, 'timeStamp', { value: ms }); // read-only getter
  return event;
}

function setup() {
  const keyboard = new EventTarget();
  const pointer = new EventTarget();
  const bus = createEventBus<InputEvents>();
  const manager = new InputManager(pointer, keyboard, bus);
  manager.attach();
  return { keyboard, pointer, bus, manager };
}

describe('InputManager', () => {
  it('maps held movement keys to axes', () => {
    const { keyboard, manager } = setup();
    keyboard.dispatchEvent(key('keydown', 'KeyW'));
    expect(manager.snapshot().axes.moveZ).toBe(1);
    keyboard.dispatchEvent(key('keyup', 'KeyW'));
    keyboard.dispatchEvent(key('keydown', 'KeyS'));
    expect(manager.snapshot().axes.moveZ).toBe(-1);
    keyboard.dispatchEvent(key('keydown', 'KeyA'));
    keyboard.dispatchEvent(key('keydown', 'KeyD'));
    expect(manager.snapshot().axes.moveX).toBe(0);
    manager.detach();
  });

  it('tracks accelerate as a held button', () => {
    const { keyboard, manager } = setup();
    keyboard.dispatchEvent(key('keydown', 'ShiftLeft'));
    expect(manager.snapshot().buttons.accelerate).toBe(true);
    keyboard.dispatchEvent(key('keyup', 'ShiftLeft'));
    expect(manager.snapshot().buttons.accelerate).toBe(false);
    manager.detach();
  });

  it('reports wind hold while the right button is down and a release pulse exactly once', () => {
    const { pointer, manager } = setup();
    pointer.dispatchEvent(mouse('mousedown', 2, 0));
    expect(manager.snapshot().buttons.windHold).toBe(true);
    pointer.dispatchEvent(mouse('mouseup', 2, 800));
    const released = manager.snapshot();
    expect(released.buttons.windHold).toBe(false);
    expect(released.windReleased).toBe(true);
    expect(manager.snapshot().windReleased).toBe(false);
    manager.detach();
  });

  it('accumulates wheel and mouse deltas and resets them per snapshot', () => {
    const { pointer, manager } = setup();
    pointer.dispatchEvent(Object.assign(new Event('wheel'), { deltaY: 100 }));
    pointer.dispatchEvent(Object.assign(new Event('wheel'), { deltaY: -40 }));
    pointer.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 5, movementY: -3 }));
    pointer.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 2, movementY: 1 }));
    const snap = manager.snapshot();
    expect(snap.wheelDelta).toBe(60);
    expect(snap.mouseDelta).toEqual({ x: 7, y: -2 });
    const next = manager.snapshot();
    expect(next.wheelDelta).toBe(0);
    expect(next.mouseDelta).toEqual({ x: 0, y: 0 });
    manager.detach();
  });

  it('emits a resonance pulse event on Space, ignoring key repeat', () => {
    const { keyboard, bus, manager } = setup();
    let pulses = 0;
    bus.on('input:resonance-pulse', () => pulses++);
    keyboard.dispatchEvent(key('keydown', 'Space'));
    keyboard.dispatchEvent(key('keydown', 'Space', true));
    expect(pulses).toBe(1);
    expect(manager.snapshot().resonancePulse).toBe(true);
    expect(manager.snapshot().resonancePulse).toBe(false);
    manager.detach();
  });

  it('emits a pause event on Escape', () => {
    const { keyboard, bus, manager } = setup();
    let paused = 0;
    bus.on('input:pause', () => paused++);
    keyboard.dispatchEvent(key('keydown', 'Escape'));
    expect(paused).toBe(1);
    expect(manager.snapshot().pausePressed).toBe(true);
    manager.detach();
  });

  it('left clicks shift, right holds the wind (user decision)', () => {
    const { pointer, manager } = setup();

    // Every left click is one gear, and it is never heard as a wind release.
    pointer.dispatchEvent(mouse('mousedown', 0, 1000));
    const clicked = manager.snapshot();
    expect(clicked.gearUp).toBe(true);
    expect(clicked.windReleased).toBe(false);
    expect(clicked.buttons.windHold).toBe(false);
    expect(manager.snapshot().gearUp).toBe(false);

    // The right button is the wind, and holding it also boosts.
    pointer.dispatchEvent(mouse('mousedown', 2, 2000));
    const holding = manager.snapshot();
    expect(holding.buttons.windHold).toBe(true);
    expect(holding.gearUp).toBe(false);
    pointer.dispatchEvent(mouse('mouseup', 2, 2600));
    expect(manager.snapshot().windReleased).toBe(true);
    manager.detach();
  });

  it('detaches cleanly: no further input reaches snapshots and held state clears', () => {
    const { keyboard, pointer, manager } = setup();
    keyboard.dispatchEvent(key('keydown', 'KeyW'));
    pointer.dispatchEvent(mouse('mousedown', 0));
    manager.detach();
    const snap = manager.snapshot();
    expect(snap.axes.moveZ).toBe(0);
    expect(snap.buttons.windHold).toBe(false);
    keyboard.dispatchEvent(key('keydown', 'KeyD'));
    pointer.dispatchEvent(Object.assign(new Event('wheel'), { deltaY: 100 }));
    const after = manager.snapshot();
    expect(after.axes.moveX).toBe(0);
    expect(after.wheelDelta).toBe(0);
  });
});
