import { describe, expect, it } from 'vitest';
import { STREAK_CONFIG, altitudeBoost } from '../../src/rendering/SpeedStreaks';

describe('speed reads the same high as it does low', () => {
  it('leaves the streaks alone on the deck', () => {
    // Down here the ground and the forest already carry the speed; touching the
    // streaks would change a look the user has already approved.
    expect(altitudeBoost(0)).toBe(1);
  });

  it('lifts them the higher you get, and stops lifting', () => {
    const low = altitudeBoost(10);
    const mid = altitudeBoost(30);
    const full = altitudeBoost(STREAK_CONFIG.altitudeFullLift);
    expect(low).toBeGreaterThan(1);
    expect(mid).toBeGreaterThan(low);
    expect(full).toBeGreaterThan(mid);
    // Past the ceiling it must not keep growing, or the top of the flight band
    // turns into a white smear.
    expect(altitudeBoost(400)).toBe(full);
    expect(full).toBe(1 + STREAK_CONFIG.altitudeLift);
  });

  it('never reads a dive below the ground as negative lift', () => {
    // altitude is measured against the terrain and can go slightly negative
    // while the orb is being pushed back out of a slope.
    expect(altitudeBoost(-5)).toBe(1);
  });

  it('lets a slower flight up high match a faster one down low', () => {
    // The point of the whole change: same felt speed, different altitude.
    const onTheDeck = (speed: number) => Math.min(1, speed / STREAK_CONFIG.fullSpeed);
    const upHigh = (speed: number, alt: number) =>
      Math.min(1, (speed / STREAK_CONFIG.fullSpeed) * altitudeBoost(alt));
    expect(upHigh(20, STREAK_CONFIG.altitudeFullLift)).toBeGreaterThan(onTheDeck(20));
  });
});
