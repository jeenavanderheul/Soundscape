import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../src/core/stores';

interface Counter {
  count: number;
  nested: { label: string };
}

const initial = (): Counter => ({ count: 0, nested: { label: 'a' } });

describe('createStore', () => {
  it('getState returns the initial state', () => {
    const store = createStore(initial());
    expect(store.getState()).toEqual({ count: 0, nested: { label: 'a' } });
  });

  it('setState replaces state via a pure updater producing a new object', () => {
    const store = createStore(initial());
    const before = store.getState();
    store.setState((s) => ({ ...s, count: s.count + 1 }));
    const after = store.getState();
    expect(after.count).toBe(1);
    expect(after).not.toBe(before);
  });

  it('a previously taken snapshot is not mutated by setState', () => {
    const store = createStore(initial());
    const snapshot = store.getState();
    store.setState((s) => ({ ...s, count: 99, nested: { label: 'b' } }));
    expect(snapshot.count).toBe(0);
    expect(snapshot.nested.label).toBe('a');
  });

  it('snapshots are immutable (frozen)', () => {
    const store = createStore(initial());
    const snapshot = store.getState();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.nested)).toBe(true);
  });

  it('subscribe notifies with the new state and returns unsubscribe', () => {
    const store = createStore(initial());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setState((s) => ({ ...s, count: 5 }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ count: 5 });
    unsubscribe();
    store.setState((s) => ({ ...s, count: 6 }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
