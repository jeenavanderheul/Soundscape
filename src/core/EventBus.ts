export type EventHandler<P> = (payload: P) => void;

export interface EventBus<E extends Record<string, unknown>> {
  on<K extends keyof E>(event: K, handler: EventHandler<E[K]>): () => void;
  off<K extends keyof E>(event: K, handler: EventHandler<E[K]>): void;
  emit<K extends keyof E>(event: K, payload: E[K]): void;
}

export function createEventBus<E extends Record<string, unknown>>(): EventBus<E> {
  const handlers = new Map<keyof E, Set<EventHandler<never>>>();

  const off: EventBus<E>['off'] = (event, handler) => {
    handlers.get(event)?.delete(handler as EventHandler<never>);
  };

  return {
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler as EventHandler<never>);
      return () => off(event, handler);
    },
    off,
    emit(event, payload) {
      const set = handlers.get(event);
      if (!set) return;
      for (const handler of [...set]) {
        (handler as EventHandler<E[typeof event]>)(payload);
      }
    },
  };
}
