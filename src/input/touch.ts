/**
 * Touch mapping (pure). This game is "hold W and steer with your look", so
 * touch keeps that shape with two thumbs: the LEFT half is one thumb that is
 * both throttle and look (touching = W held; dragging from where you landed =
 * steering, like the mouse), and the RIGHT half is the wind (hold = LMB held,
 * release = the timed pulse). A separate strafe stick would add a control the
 * flight model barely uses — heading comes from look, not from moveX.
 *
 * Everything here is pure geometry so it can be unit-tested without a DOM;
 * TouchControls.ts owns the events, InputManager owns the snapshot.
 */

export const TOUCH_CONFIG = {
  /** Fraction of the viewport width that belongs to the flight thumb. */
  zoneSplit: 0.5,
  /** Full deflection is reached this many px from where the thumb landed. */
  stickRadiusPx: 70,
  /** Below this deflection the thumb is considered resting (no steering). */
  deadzone: 0.12,
  /**
   * Synthetic mouse pixels per frame at full deflection. 10 px/frame at
   * LOOK_CONFIG.radiansPerPixel (0.0022) ≈ 1.3 rad/s yaw at 60 fps.
   */
  lookPxPerFrame: { x: 10, y: 6 },
  /**
   * §203 HYPER ON A PHONE. On a desk it is Shift — "a burst you hold, not a
   * gear you shift into" (§129). Two thumbs cannot hold a third thing: the left
   * one is flying and the right one is the wind. So on touch it LATCHES on a
   * double tap of the flight zone and latches off on the next one, and the HUD
   * says so, because a state you cannot feel in your hand has to be visible.
   *
   * 320 ms is the window a second tap has to land in, and 40 px is how far it
   * may stray — beyond that it is a thumb repositioning to steer, not a tap.
   */
  doubleTapMs: 320,
  doubleTapSlopPx: 40,
  /**
   * §206: how fast the thumb's landing point creeps after the thumb, in
   * seconds. This is what makes a still thumb fly STRAIGHT.
   *
   * The stick steered on position and re-applied those pixels every frame, so
   * a thumb parked 12 px out turned through a whole 60° world every 4.6
   * seconds, forever — and the world is the heading you travel (§56), so a
   * phone player emigrated continuously and no track ever passed its opening.
   * The demo flight steers on heading ERROR, settles, and therefore hears a
   * whole build; that gap was this number missing.
   *
   * The mouse never had the problem: moving it turns you, holding it still
   * does not. With the origin creeping after the thumb, dragging holds full
   * authority (a second of ordinary drag still crosses a border) and stopping
   * spends the last of the turn and straightens out.
   */
  centreTauS: 0.7,
} as const;

export type TouchZone = 'flight' | 'wind';

/** Which control a touch that lands at clientX belongs to. */
export function touchZone(clientX: number, viewportWidth: number): TouchZone {
  return clientX < viewportWidth * TOUCH_CONFIG.zoneSplit ? 'flight' : 'wind';
}

/**
 * Thumb deflection from its landing point, each axis −1..1 with deadzone.
 * x is right-positive, y is UP-positive (screen y inverted).
 */
export function stickDeflection(
  originX: number,
  originY: number,
  x: number,
  y: number,
): { x: number; y: number } {
  const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
  const dead = (v: number): number => (Math.abs(v) < TOUCH_CONFIG.deadzone ? 0 : v);
  return {
    x: dead(clamp((x - originX) / TOUCH_CONFIG.stickRadiusPx)),
    y: dead(clamp((originY - y) / TOUCH_CONFIG.stickRadiusPx)),
  };
}

/**
 * Deflection → synthetic mouseDelta pixels for one frame. Drag right turns
 * right (positive mouseDelta.x yaws right via the −x in the controller — same
 * sign as moving the mouse right); drag up climbs (negative mouseDelta.y).
 */
export function lookDeltaPerFrame(deflection: { x: number; y: number }): {
  x: number;
  y: number;
} {
  return {
    x: deflection.x * TOUCH_CONFIG.lookPxPerFrame.x,
    // `0 +` folds the −0 a negated zero deflection would produce.
    y: 0 + -deflection.y * TOUCH_CONFIG.lookPxPerFrame.y,
  };
}

/**
 * §206: the landing point creeps toward where the thumb actually is, so the
 * deflection that steers you decays to nothing once the thumb stops moving.
 * Exponential, so it never overshoots and a zero step changes nothing.
 */
export function driftOrigin(
  origin: { x: number; y: number },
  thumb: { x: number; y: number },
  dtSeconds: number,
): { x: number; y: number } {
  const alpha = 1 - Math.exp(-Math.max(0, dtSeconds) / TOUCH_CONFIG.centreTauS);
  return {
    x: origin.x + (thumb.x - origin.x) * alpha,
    y: origin.y + (thumb.y - origin.y) * alpha,
  };
}

/**
 * Was this tap the second half of a double tap? Pure so the rule can be tested
 * without a DOM: the caller keeps the previous tap and asks.
 */
export function isDoubleTap(
  previous: { atMs: number; x: number; y: number } | null,
  tap: { atMs: number; x: number; y: number },
): boolean {
  if (previous === null) return false;
  const withinTime = tap.atMs - previous.atMs <= TOUCH_CONFIG.doubleTapMs;
  const moved = Math.hypot(tap.x - previous.x, tap.y - previous.y);
  return withinTime && moved <= TOUCH_CONFIG.doubleTapSlopPx;
}
