import { describe, expect, it } from 'vitest';
import { trailHalfWidth } from '../../src/rendering/OrbTrail';

/**
 * §131: the trail is 38 world units long and the chase camera sits ~7 units
 * behind the orb, so the ribbon passes straight through the lens. A rib one
 * world unit wide half a unit from the camera covers the whole viewport — the
 * pink wedge. The half-width has to shrink with the distance to the camera, so
 * the ribbon keeps a bounded angular thickness however close it comes.
 */
describe('trailHalfWidth', () => {
  it('keeps the ribbon angularly bounded however close it passes the camera', () => {
    const head = 1.33; // full throttle on a four-layer track
    for (let distance = 0; distance <= 12; distance += 0.1) {
      const halfWidth = trailHalfWidth(head, 0.15, distance);
      // Angular half-size ~ halfWidth / distance; a quarter radian is already
      // a wide ribbon, the old index-only taper reached hundreds here.
      const angular = distance > 1e-6 ? halfWidth / distance : 0;
      expect(angular).toBeLessThan(0.25);
    }
  });

  it('collapses to nothing at the lens and is untouched far away', () => {
    expect(trailHalfWidth(1.33, 0, 0)).toBe(0);
    expect(trailHalfWidth(1.33, 0, 40)).toBeCloseTo(1.33);
    expect(trailHalfWidth(1.33, 1, 40)).toBe(0);
  });
});
