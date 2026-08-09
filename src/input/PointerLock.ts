import { EventBus } from '../core/EventBus';

export type PointerLockEvents = {
  'pointerlock:acquired': null;
  'pointerlock:released': null;
  'pointerlock:error': null;
};

// Structural interfaces so the browser document/element satisfy them and
// tests can substitute fakes (no DOM in the unit test environment).
export interface LockElement {
  requestPointerLock(): void;
}

export interface LockDocument extends EventTarget {
  pointerLockElement: unknown;
  exitPointerLock(): void;
}

/**
 * Pointer lock acquire/release helper (spec §5 mouse look).
 * Emits typed events on the EventBus; lock loss via Esc arrives as a
 * plain `pointerlockchange` with a null lock element and is reported
 * as a normal release.
 */
export class PointerLock {
  private wasLocked = false;

  constructor(
    private readonly element: LockElement,
    private readonly bus: EventBus<PointerLockEvents>,
    private readonly doc: LockDocument = document,
  ) {}

  get locked(): boolean {
    return this.doc.pointerLockElement === this.element;
  }

  attach(): void {
    this.doc.addEventListener('pointerlockchange', this.onChange);
    this.doc.addEventListener('pointerlockerror', this.onError);
  }

  detach(): void {
    this.doc.removeEventListener('pointerlockchange', this.onChange);
    this.doc.removeEventListener('pointerlockerror', this.onError);
    this.wasLocked = false;
  }

  request(): void {
    try {
      // Some browsers return a Promise; a rejection must not go unhandled.
      const result = this.element.requestPointerLock() as unknown;
      if (result instanceof Promise) {
        result.catch(() => this.bus.emit('pointerlock:error', null));
      }
    } catch {
      this.bus.emit('pointerlock:error', null);
    }
  }

  exit(): void {
    if (this.locked) this.doc.exitPointerLock();
  }

  private readonly onChange = (): void => {
    const locked = this.locked;
    if (locked === this.wasLocked) return;
    this.wasLocked = locked;
    this.bus.emit(locked ? 'pointerlock:acquired' : 'pointerlock:released', null);
  };

  private readonly onError = (): void => {
    this.bus.emit('pointerlock:error', null);
  };
}
