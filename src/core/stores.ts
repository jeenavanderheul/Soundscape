export type SerializablePrimitive = string | number | boolean | null;
export type Serializable =
  | SerializablePrimitive
  | Serializable[]
  | { [key: string]: Serializable | undefined };

export interface Store<T> {
  getState(): Readonly<T>;
  setState(updater: (current: Readonly<T>) => T): void;
  subscribe(listener: (state: Readonly<T>) => void): () => void;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

// Constraint is structural (`object`) because TS interfaces lack index signatures;
// the store contract per spec §6 is still serializable-data-only.
export function createStore<T extends object>(initial: T): Store<T> {
  let state = deepFreeze(initial);
  const listeners = new Set<(state: Readonly<T>) => void>();

  return {
    getState: () => state,
    setState(updater) {
      const next = updater(state);
      if (next === state) {
        throw new Error('setState updater must return a new object, not the current state');
      }
      state = deepFreeze(next);
      for (const listener of [...listeners]) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
