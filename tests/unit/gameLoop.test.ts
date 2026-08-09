import { describe, expect, it } from 'vitest';
import { Clock, MAX_DELTA_MS } from '../../src/core/Clock';
import { GameLoop } from '../../src/app/GameLoop';

// Manually driven requestAnimationFrame stand-in.
function createFakeRaf() {
  let nextId = 1;
  const pending = new Map<number, (nowMs: number) => void>();
  return {
    raf: (cb: (nowMs: number) => void): number => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    caf: (id: number): void => {
      pending.delete(id);
    },
    fire(nowMs: number): void {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb(nowMs);
    },
    get pendingCount(): number {
      return pending.size;
    },
  };
}

describe('GameLoop', () => {
  it('is not running until started', () => {
    const fake = createFakeRaf();
    const loop = new GameLoop(new Clock(), () => {}, fake.raf, fake.caf);
    expect(loop.running).toBe(false);
    expect(fake.pendingCount).toBe(0);
  });

  it('ticks with clamped deltas from the core Clock', () => {
    const fake = createFakeRaf();
    const deltas: number[] = [];
    const loop = new GameLoop(new Clock(), (deltaMs) => deltas.push(deltaMs), fake.raf, fake.caf);
    loop.start();
    fake.fire(1000);
    fake.fire(1016);
    fake.fire(9000); // suspension spike must be clamped
    expect(deltas).toEqual([0, 16, MAX_DELTA_MS]);
  });

  it('reschedules itself after every frame while running', () => {
    const fake = createFakeRaf();
    const loop = new GameLoop(new Clock(), () => {}, fake.raf, fake.caf);
    loop.start();
    expect(fake.pendingCount).toBe(1);
    fake.fire(1000);
    expect(fake.pendingCount).toBe(1);
  });

  it('stop cancels the pending frame and stops ticking', () => {
    const fake = createFakeRaf();
    const deltas: number[] = [];
    const loop = new GameLoop(new Clock(), (deltaMs) => deltas.push(deltaMs), fake.raf, fake.caf);
    loop.start();
    fake.fire(1000);
    loop.stop();
    expect(loop.running).toBe(false);
    expect(fake.pendingCount).toBe(0);
    fake.fire(2000);
    expect(deltas).toEqual([0]);
  });

  it('start is idempotent while running', () => {
    const fake = createFakeRaf();
    const loop = new GameLoop(new Clock(), () => {}, fake.raf, fake.caf);
    loop.start();
    loop.start();
    expect(fake.pendingCount).toBe(1);
  });

  it('restart after a long pause never produces a large delta jump', () => {
    const fake = createFakeRaf();
    const deltas: number[] = [];
    const loop = new GameLoop(new Clock(), (deltaMs) => deltas.push(deltaMs), fake.raf, fake.caf);
    loop.start();
    fake.fire(1000);
    fake.fire(1016);
    loop.stop();
    loop.start();
    fake.fire(60_000); // tab was hidden for almost a minute
    expect(deltas.every((d) => d <= MAX_DELTA_MS)).toBe(true);
  });
});
