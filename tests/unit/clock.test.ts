import { describe, expect, it } from 'vitest';
import { Clock, MAX_DELTA_MS } from '../../src/core/Clock';

describe('Clock', () => {
  it('first tick returns zero delta', () => {
    const clock = new Clock();
    expect(clock.tick(1000)).toBe(0);
  });

  it('returns the real delta for normal frames', () => {
    const clock = new Clock();
    clock.tick(1000);
    expect(clock.tick(1016)).toBe(16);
    expect(clock.tick(1033)).toBe(17);
  });

  it('clamps large deltas to MAX_DELTA_MS', () => {
    const clock = new Clock();
    clock.tick(1000);
    expect(clock.tick(6000)).toBe(MAX_DELTA_MS);
  });

  it('MAX_DELTA_MS is 100 per spec section 15', () => {
    expect(MAX_DELTA_MS).toBe(100);
  });

  it('recovers with normal deltas after a suspension spike', () => {
    const clock = new Clock();
    clock.tick(0);
    clock.tick(10_000); // tab suspension
    expect(clock.tick(10_016)).toBe(16);
  });

  it('never returns a negative delta', () => {
    const clock = new Clock();
    clock.tick(1000);
    expect(clock.tick(900)).toBe(0);
  });

  it('accumulates elapsed clamped time', () => {
    const clock = new Clock();
    clock.tick(0);
    clock.tick(16);
    clock.tick(5000);
    expect(clock.elapsedMs).toBe(16 + MAX_DELTA_MS);
  });
});
