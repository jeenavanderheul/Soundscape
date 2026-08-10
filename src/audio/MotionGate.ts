/**
 * §42 MOVEMENT IS THE MUSIC — the one place that decides how loud the world is
 * allowed to be right now. Flying opens it, standing still closes it, and the
 * closing is slow so a stop reads as a decay and not as a switch.
 *
 * Pure on purpose: the whole rule is testable without an AudioContext, and the
 * track gain, the player tone and the resonator drones all read the same level.
 */

/** Below this speed the orb counts as standing still. */
const STILL_VELOCITY = 0.4;
/** Speed above STILL_VELOCITY at which the world is fully open. */
const FULL_VELOCITY_SPAN = 3;
/** Time constant for opening up — quick enough that leaving feels immediate. */
const ATTACK_TAU_S = 0.25;
/** §42 follow-up: a stop fades out over ~1.5s instead of cutting. */
const RELEASE_TAU_S = 1.5;

/**
 * Resonators keep this fraction of their level when the world falls silent.
 * §P1 says sound is the waypoint: if standing still muted them completely you
 * could no longer stop and listen for where something is.
 */
export const RESONATOR_SILENCE_FLOOR = 0.35;

/** How open the world would be at this speed, ignoring history. */
export function motionTarget(velocity: number): number {
  return clamp01((velocity - STILL_VELOCITY) / FULL_VELOCITY_SPAN);
}

/** One step of the gate: fast to open, slow to close. */
export function nextMotionLevel(current: number, velocity: number, dtSeconds: number): number {
  const target = motionTarget(velocity);
  const tau = target > current ? ATTACK_TAU_S : RELEASE_TAU_S;
  const alpha = 1 - Math.exp(-Math.max(0, dtSeconds) / tau);
  return clamp01(current + (target - current) * alpha);
}

/** The level a spatial resonator drone plays at, given the gate. */
export function resonatorLevel(motion: number): number {
  return RESONATOR_SILENCE_FLOOR + (1 - RESONATOR_SILENCE_FLOOR) * clamp01(motion);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
