import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/core/EventBus';

interface TestEvents {
  ping: { value: number };
  note: { hz: number };
  [key: string]: unknown;
}

describe('EventBus', () => {
  it('delivers emitted payloads to subscribers', () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('ping', handler);
    bus.emit('ping', { value: 42 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('only notifies handlers of the emitted event', () => {
    const bus = createEventBus<TestEvents>();
    const pingHandler = vi.fn();
    const noteHandler = vi.fn();
    bus.on('ping', pingHandler);
    bus.on('note', noteHandler);
    bus.emit('note', { hz: 220 });
    expect(pingHandler).not.toHaveBeenCalled();
    expect(noteHandler).toHaveBeenCalledWith({ hz: 220 });
  });

  it('on() returns an unsubscribe function', () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    const unsubscribe = bus.on('ping', handler);
    bus.emit('ping', { value: 1 });
    unsubscribe();
    bus.emit('ping', { value: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('off() removes a handler', () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('ping', handler);
    bus.off('ping', handler);
    bus.emit('ping', { value: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('supports multiple subscribers per event', () => {
    const bus = createEventBus<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('ping', a);
    bus.on('ping', b);
    bus.emit('ping', { value: 7 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('unsubscribing twice is safe and does not remove other handlers', () => {
    const bus = createEventBus<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = bus.on('ping', a);
    bus.on('ping', b);
    unsubA();
    unsubA();
    bus.emit('ping', { value: 3 });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});
