import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/core/EventBus';
import { LockDocument, LockElement, PointerLock, PointerLockEvents } from '../../src/input/PointerLock';

class FakeDocument extends EventTarget implements LockDocument {
  pointerLockElement: LockElement | null = null;
  exitCalls = 0;
  exitPointerLock(): void {
    this.exitCalls++;
    this.pointerLockElement = null;
    this.dispatchEvent(new Event('pointerlockchange'));
  }
}

function setup() {
  const doc = new FakeDocument();
  const element: LockElement & { requests: number } = {
    requests: 0,
    requestPointerLock() {
      this.requests++;
    },
  };
  const bus = createEventBus<PointerLockEvents>();
  const lock = new PointerLock(element, bus, doc);
  lock.attach();
  return { doc, element, bus, lock };
}

describe('PointerLock', () => {
  it('requests lock on the element and reports acquisition', () => {
    const { doc, element, bus, lock } = setup();
    const events: string[] = [];
    bus.on('pointerlock:acquired', () => events.push('acquired'));
    lock.request();
    expect(element.requests).toBe(1);
    doc.pointerLockElement = element;
    doc.dispatchEvent(new Event('pointerlockchange'));
    expect(lock.locked).toBe(true);
    expect(events).toEqual(['acquired']);
    lock.detach();
  });

  it('handles lock loss (Esc) gracefully by emitting released', () => {
    const { doc, element, bus, lock } = setup();
    const events: string[] = [];
    bus.on('pointerlock:acquired', () => events.push('acquired'));
    bus.on('pointerlock:released', () => events.push('released'));
    doc.pointerLockElement = element;
    doc.dispatchEvent(new Event('pointerlockchange'));
    // Browser Esc: lock element cleared without a call to exit().
    doc.pointerLockElement = null;
    doc.dispatchEvent(new Event('pointerlockchange'));
    expect(lock.locked).toBe(false);
    expect(events).toEqual(['acquired', 'released']);
    lock.detach();
  });

  it('exit() releases through the document', () => {
    const { doc, element, bus, lock } = setup();
    let released = 0;
    bus.on('pointerlock:released', () => released++);
    doc.pointerLockElement = element;
    doc.dispatchEvent(new Event('pointerlockchange'));
    lock.exit();
    expect(doc.exitCalls).toBe(1);
    expect(released).toBe(1);
    lock.detach();
  });

  it('emits an error event on pointerlockerror', () => {
    const { doc, bus, lock } = setup();
    let errors = 0;
    bus.on('pointerlock:error', () => errors++);
    doc.dispatchEvent(new Event('pointerlockerror'));
    expect(errors).toBe(1);
    lock.detach();
  });

  it('stops emitting after detach', () => {
    const { doc, element, bus, lock } = setup();
    let count = 0;
    bus.on('pointerlock:acquired', () => count++);
    lock.detach();
    doc.pointerLockElement = element;
    doc.dispatchEvent(new Event('pointerlockchange'));
    expect(count).toBe(0);
  });
});
