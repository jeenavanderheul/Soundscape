import { describe, expect, it } from 'vitest';

import {
  driftOrigin,
  lookDeltaPerFrame,
  stickDeflection,
  TOUCH_CONFIG,
} from '../../src/input/touch';
import { LOOK_CONFIG } from '../../src/player/FrequencyController';

/**
 * §206: A THUMB THAT STOPS MOVING HAS TO FLY STRAIGHT.
 *
 * The touch stick steered on POSITION — look pixels proportional to where the
 * thumb sits — and those pixels were re-applied every frame. So any thumb not
 * within 8.4 px of the invisible point where it landed turned you forever: 4.6
 * seconds per world at the edge of the deadzone, 0.8 at full deflection. The
 * world is the heading you travel (§56), so a phone player was permanently
 * emigrating and every track restarted at rung one. Measured against the demo
 * pilot, which steers on ERROR and therefore settles, that was the whole
 * difference between hearing a build and never hearing one.
 *
 * The mouse never had this problem: MOVING it turns you, holding it still does
 * not. The origin now creeps after the thumb, which gives touch the same law.
 */

/** Degrees per second of yaw a given thumb offset asks for, at 60 fps. */
function degreesPerSecond(offsetPx: number): number {
  const look = lookDeltaPerFrame(stickDeflection(0, 0, offsetPx, 0));
  return Math.abs(look.x) * LOOK_CONFIG.radiansPerPixel * 60 * (180 / Math.PI);
}

/** Total degrees swept by landing a thumb, dragging `offsetPx`, and holding. */
function degreesSweptByHolding(offsetPx: number, seconds = 6): number {
  const dt = 1 / 60;
  let origin = { x: 0, y: 0 };
  const thumb = { x: offsetPx, y: 0 };
  let degrees = 0;
  for (let t = 0; t < seconds; t += dt) {
    const look = lookDeltaPerFrame(stickDeflection(origin.x, origin.y, thumb.x, thumb.y));
    degrees += Math.abs(look.x) * LOOK_CONFIG.radiansPerPixel * (180 / Math.PI);
    origin = driftOrigin(origin, thumb, dt);
  }
  return degrees;
}

describe('§206 a held thumb settles onto a heading', () => {
  it('flies straight again within two seconds of the thumb going still', () => {
    // Not "eventually" — a track restarts after 1.2 s in a new sector, so the
    // straightening has to beat that by a clear margin.
    const dt = 1 / 60;
    let origin = { x: 0, y: 0 };
    const thumb = { x: 70, y: 0 };
    let straightAt: number | null = null;
    for (let t = 0; t < 4; t += dt) {
      origin = driftOrigin(origin, thumb, dt);
      const still = stickDeflection(origin.x, origin.y, thumb.x, thumb.y).x === 0;
      if (still && straightAt === null) straightAt = t;
    }
    expect(straightAt).not.toBeNull();
    expect(straightAt!).toBeLessThan(2);
  });

  it('turns by a bounded amount per gesture instead of forever', () => {
    // Before: a thumb parked 12 px out crossed a whole 60° world every 4.6 s,
    // without end. Now one gesture spends its turn and stops.
    expect(degreesSweptByHolding(12)).toBeLessThan(20);
    expect(degreesSweptByHolding(70)).toBeLessThan(60);
    // …and still turns enough to be worth doing.
    expect(degreesSweptByHolding(70)).toBeGreaterThan(20);
  });

  it('keeps full authority while the thumb is actually being dragged', () => {
    // Dragging IS the mouse moving: a steady drag has to hold a steady rate,
    // or steering into the next world becomes a chore of tiny repeated swipes.
    const degreesPerSecondOfDrag = (speedPxPerSecond: number): number => {
      const dt = 1 / 60;
      let origin = { x: 0, y: 0 };
      let thumbX = 0;
      let degrees = 0;
      for (let t = 0; t < 1; t += dt) {
        thumbX += speedPxPerSecond * dt;
        const look = lookDeltaPerFrame(stickDeflection(origin.x, origin.y, thumbX, 0));
        degrees += Math.abs(look.x) * LOOK_CONFIG.radiansPerPixel * (180 / Math.PI);
        origin = driftOrigin(origin, { x: thumbX, y: 0 }, dt);
      }
      return degrees;
    };
    // A brisk drag still crosses a whole 60° world inside a second — steering
    // deliberately into the next grammar stays one gesture, not a campaign.
    expect(degreesPerSecondOfDrag(250)).toBeGreaterThan(60);
    // An unhurried one turns most of a world: enough to aim, not enough to
    // wander out of the one you are in.
    expect(degreesPerSecondOfDrag(150)).toBeGreaterThan(45);
  });

  it('never overshoots the thumb, and stands still when dt is zero', () => {
    const origin = driftOrigin({ x: 0, y: 0 }, { x: 100, y: -40 }, 10);
    expect(origin.x).toBeLessThanOrEqual(100);
    expect(origin.y).toBeGreaterThanOrEqual(-40);
    expect(driftOrigin({ x: 5, y: 5 }, { x: 99, y: 99 }, 0)).toEqual({ x: 5, y: 5 });
  });

  it('records what the old stick did, so this cannot quietly come back', () => {
    // The arithmetic that caused it, kept as a fact rather than a memory.
    expect(degreesPerSecond(TOUCH_CONFIG.deadzone * TOUCH_CONFIG.stickRadiusPx + 4)).toBeGreaterThan(
      10,
    );
    expect(degreesPerSecond(70)).toBeGreaterThan(70);
  });
});
