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

/**
 * How open the world is before the player has ever moved.
 *
 * §42 says standing still is silence, and that stays true — but it was written
 * about STOPPING, and it was being applied to ARRIVING as well. A visitor who
 * does not yet know that W exists got a world that made no sound at all: 20
 * seconds in, measured, rms 0.005 and nothing playing. On a music site that
 * reads as broken rather than as quiet.
 *
 * So the world breathes on its own until you first move, and from that moment
 * §42 governs the rest of the flight: stop, and it falls silent. This does not
 * unlock a layer or start the track — it is the room, not the record.
 */
export const ARRIVAL_LEVEL = 0.4;

/** One step of the gate: fast to open, slow to close. */
export function nextMotionLevel(
  current: number,
  velocity: number,
  dtSeconds: number,
  floor = 0,
): number {
  const target = Math.max(motionTarget(velocity), clamp01(floor));
  const tau = target > current ? ATTACK_TAU_S : RELEASE_TAU_S;
  const alpha = 1 - Math.exp(-Math.max(0, dtSeconds) / tau);
  return clamp01(current + (target - current) * alpha);
}

/**
 * §197 (user): the waypoint drone is "alleen een referentie" — it may announce
 * itself and must then get out of the way. Two behaviours, not a smaller
 * number: it DUCKS under the music, and it SETTLES after it has been heard.
 *
 * Ducking is what makes it a reference rather than a layer: at rest, with
 * nothing playing, it is the only thing there and can be heard; as the track
 * fills in, it disappears underneath what you built. Settling is what stops it
 * droning at someone standing still — it fades toward a whisper over a few
 * seconds and comes back the moment you move again, which is exactly when a
 * bearing is worth taking.
 */
export const DRONE_DUCK = 0.85;
/** What it settles to when you stand still and stop asking, as a fraction. */
export const DRONE_SETTLED = 0.12;
/** Seconds for that settling — slow enough to read as a fade, not a gate. */
export const DRONE_SETTLE_TAU_S = 2.2;
/** Seconds to come back once you are moving again. */
export const DRONE_WAKE_TAU_S = 0.5;

export interface DroneInput {
  /**
   * Is the player actually travelling? NOT the §42 gate: since §184 gave
   * arrival a floor, that gate reads 0.4 while a visitor stands perfectly
   * still, so it can no longer answer this question.
   */
  moving: boolean;
  dtSeconds: number;
}

/**
 * One step of the drone's own envelope. `current` is a 0..1 presence, not a
 * gain: `resonatorLevel` still decides the §42 duck, and DRONE_HEADROOM in
 * SpatialAudio still decides the ceiling.
 */
export function nextDronePresence(current: number, input: DroneInput): number {
  const target = input.moving ? 1 : DRONE_SETTLED;
  const tau = input.moving ? DRONE_WAKE_TAU_S : DRONE_SETTLE_TAU_S;
  const alpha = 1 - Math.exp(-Math.max(0, input.dtSeconds) / tau);
  return clamp01(current + (target - current) * alpha);
}

/** How much of its level survives the music playing over it. */
export function droneDuck(music: number): number {
  return 1 - clamp01(music) * DRONE_DUCK;
}

/** The level a spatial resonator drone plays at, given the gate. */
export function resonatorLevel(motion: number): number {
  return RESONATOR_SILENCE_FLOOR + (1 - RESONATOR_SILENCE_FLOOR) * clamp01(motion);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
