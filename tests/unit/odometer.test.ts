import { describe, expect, it } from 'vitest';

import { formatDistance, METRES_PER_UNIT, metresBetween } from '../../src/player/Odometer';
import { LAND_CONFIG } from '../../src/world/LandField';
import { FLIGHT_CONFIG } from '../../src/player/FrequencyController';

/**
 * §220 (user decision): a counter for how far this flight has gone.
 */
describe('§220 the odometer', () => {
  it('uses the terrain\'s own scale, not a number that looked nice', () => {
    // The land is real — AHN heights over Amsterdam, laid out so the baked
    // 20 km square IS 20 km. If `unitsPerMetre` ever moves, the readout has to
    // move with it or the game will be measuring in two different worlds.
    expect(METRES_PER_UNIT).toBe(1 / LAND_CONFIG.unitsPerMetre);
  });

  it('counts every metre travelled, bends and climbs included', () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 3, y: 0, z: 4 };
    expect(metresBetween(a, b)).toBe(5 * METRES_PER_UNIT);
    // Vertical counts too: a dive is distance.
    expect(metresBetween(a, { x: 0, y: 10, z: 0 })).toBe(10 * METRES_PER_UNIT);
    // And it is a length, so direction cannot subtract from it.
    expect(metresBetween(b, a)).toBe(metresBetween(a, b));
  });

  it('is a distance travelled, not a distance from home', () => {
    // Out and back is twice the leg, not zero — the point of an odometer.
    const home = { x: 0, y: 0, z: 0 };
    const away = { x: 500, y: 0, z: 0 };
    const total = metresBetween(home, away) + metresBetween(away, home);
    expect(total).toBe(2000);
  });

  it('reads in metres until a kilometre, then in kilometres', () => {
    expect(formatDistance(0)).toBe('0 M');
    expect(formatDistance(340)).toBe('340 M');
    expect(formatDistance(999.4)).toBe('999 M');
    expect(formatDistance(1000)).toBe('1.0 KM');
    expect(formatDistance(15_800)).toBe('15.8 KM');
    // Never a negative reading, whatever arithmetic upstream produces.
    expect(formatDistance(-5)).toBe('0 M');
  });

  it('rolls past a kilometre in seconds, which is why it switches at all', () => {
    // Full throttle is 66 units/s; at two metres a unit that is 132 m/s. The
    // switch is not a preference, it is what this speed does to a metre count.
    const metresPerSecond = FLIGHT_CONFIG.maxSpeed * METRES_PER_UNIT;
    expect(metresPerSecond).toBe(132);
    expect(1000 / metresPerSecond).toBeLessThan(10);
  });
});
