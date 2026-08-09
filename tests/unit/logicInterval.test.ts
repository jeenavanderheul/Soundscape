import { describe, expect, it } from 'vitest';
import { LogicInterval } from '../../src/app/GameLoop';

describe('LogicInterval (lower-frequency logical loop gate, spec §15)', () => {
  it('does not step before the interval has accumulated', () => {
    const interval = new LogicInterval(100);
    expect(interval.shouldStep(16)).toBe(false);
    expect(interval.shouldStep(16)).toBe(false);
  });

  it('steps once the accumulated delta reaches the interval', () => {
    const interval = new LogicInterval(100);
    let steps = 0;
    for (let i = 0; i < 60; i++) {
      if (interval.shouldStep(16.67)) steps += 1;
    }
    // 60 frames * 16.67ms ≈ 1000ms → ~10 steps at a 100ms interval
    expect(steps).toBeGreaterThanOrEqual(9);
    expect(steps).toBeLessThanOrEqual(11);
  });

  it('steps at most once per call even after a large clamped delta', () => {
    const interval = new LogicInterval(100);
    expect(interval.shouldStep(100)).toBe(true);
    expect(interval.shouldStep(0)).toBe(false);
  });

  it('carries the remainder so cadence stays stable', () => {
    const interval = new LogicInterval(100);
    expect(interval.shouldStep(150)).toBe(true); // 50ms remainder
    expect(interval.shouldStep(50)).toBe(true); // 50 + 50 = 100
  });
});
