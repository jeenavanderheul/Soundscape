import { describe, expect, it } from 'vitest';
import { trailHalfWidth } from '../../src/rendering/OrbTrail';

/**
 * §131: the trail is 38 world units long and the chase camera sits ~7 units
 * behind the orb, so the ribbon passes straight through the lens. A rib one
 * world unit wide half a unit from the camera covers the whole viewport — the
 * pink wedge. The half-width has to shrink with the distance to the camera, so
 * the ribbon keeps a bounded angular thickness however close it comes.
 *
 * §133 (user: "hij neemt soms vullend beeld over"): bounded was not enough. The
 * bound §131 settled on — a quarter radian — IS a band across the screen, and a
 * climb points the ribbon straight up the view. The cap is now the thing being
 * tested: a fraction of the viewport, at every distance.
 */
describe('trailHalfWidth', () => {
  /** Roughly the game's horizontal field of view, in radians. */
  const FIELD_OF_VIEW = 1.05;

  it('never covers more than a slice of the viewport, at any distance', () => {
    for (const head of [0.5, 1.33, 2.0]) {
      for (let distance = 0; distance <= 60; distance += 0.1) {
        const halfWidth = trailHalfWidth(head, 0.15, distance);
        const angular = distance > 1e-6 ? halfWidth / distance : 0;
        // Full width of the ribbon against the full width of the screen.
        expect((2 * angular) / FIELD_OF_VIEW).toBeLessThan(0.08);
      }
    }
  });

  it('collapses to nothing at the lens and at the tail', () => {
    expect(trailHalfWidth(1.33, 0, 0)).toBe(0);
    expect(trailHalfWidth(1.33, 1, 40)).toBe(0);
  });

  it('is still a visible jet where the trail actually lives', () => {
    // The body of the ribbon sits 10–40 units back; it must not be tapered
    // away to a hairline there, or the fix has removed the feature.
    expect(trailHalfWidth(1.33, 0.15, 20)).toBeGreaterThan(0.3);
    expect(trailHalfWidth(1.33, 0.5, 40)).toBeGreaterThan(0.3);
  });
});
