import { Store } from '../core/stores';
import { InputSnapshot } from '../input/InputManager';
import { FrequencyState, Vec3Data } from './FrequencyState';

// Tuning constants (spec §5): raw input is smoothed, rate-limited and
// constrained here before it can ever reach music.

export const FREQUENCY_CONFIG = {
  minHz: 30,
  maxHz: 8000,
  /** One 100-delta wheel notch ≈ a semitone (logarithmic pitch space). */
  octavesPerWheelDelta: 1 / 1200,
  /** Rate limit: caps the pitch jump a single frame can cause. */
  maxWheelDeltaPerUpdate: 600,
} as const;

export const AMPLITUDE_CONFIG = {
  attackMs: 120,
  releaseMs: 450,
} as const;

export const FLIGHT_CONFIG = {
  /** units/s² */
  acceleration: 18,
  boostMultiplier: 2.5,
  /** exponential drag coefficient, 1/s */
  drag: 1.6,
  /** units/s */
  maxSpeed: 24,
  /** Flight band above the terrain plane (y −6): the field below is the
   * always-visible reference, so the player never dives under or loses it. */
  minY: -3,
  maxY: 70,
} as const;

export const LOOK_CONFIG = {
  radiansPerPixel: 0.0022,
  /** Just short of straight up/down so the camera never flips (spec §5 comfort). */
  maxPitch: 1.53,
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** Logarithmic wheel → frequency mapping, clamped to the playable range. */
export function mapWheelToHz(
  hz: number,
  wheelDelta: number,
  config = FREQUENCY_CONFIG,
): number {
  const limited = clamp(wheelDelta, -config.maxWheelDeltaPerUpdate, config.maxWheelDeltaPerUpdate);
  // Scroll up (negative deltaY) raises pitch.
  const next = hz * 2 ** (-limited * config.octavesPerWheelDelta);
  return clamp(next, config.minHz, config.maxHz);
}

/**
 * Time-based exponential attack/release smoothing, bounded to [0, 1].
 * Frame-rate independent: n small steps equal one large step of the same total time.
 */
export function smoothAmplitude(
  current: number,
  target: number,
  deltaMs: number,
  config = AMPLITUDE_CONFIG,
): number {
  const tau = target > current ? config.attackMs : config.releaseMs;
  const alpha = 1 - Math.exp(-deltaMs / tau);
  return clamp(current + (target - current) * alpha, 0, 1);
}

/** Vector acceleration + exponential drag + max speed. Returns a new vector. */
export function stepVelocity(
  velocity: Vec3Data,
  accelDirection: Vec3Data,
  accelMagnitude: number,
  deltaMs: number,
  config = FLIGHT_CONFIG,
): Vec3Data {
  const dt = deltaMs / 1000;
  const dragFactor = Math.exp(-config.drag * dt);
  let x = (velocity.x + accelDirection.x * accelMagnitude * dt) * dragFactor;
  let y = (velocity.y + accelDirection.y * accelMagnitude * dt) * dragFactor;
  let z = (velocity.z + accelDirection.z * accelMagnitude * dt) * dragFactor;
  const speed = Math.hypot(x, y, z);
  if (speed > config.maxSpeed) {
    const scale = config.maxSpeed / speed;
    x *= scale;
    y *= scale;
    z *= scale;
  }
  return { x, y, z };
}

/** Unit look direction from yaw/pitch; yaw 0, pitch 0 faces -Z. */
export function directionFromLook(yaw: number, pitch: number): Vec3Data {
  const cosPitch = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cosPitch,
  };
}

/**
 * Consumes an InputSnapshot each tick and advances the FrequencyStore
 * (spec §5, §15): free-flight movement, logarithmic frequency focus,
 * attack/release amplitude and velocity → energy. All updates immutable.
 */
export class FrequencyController {
  private yaw = 0;
  private pitch = 0;

  /** Reset world (§17): look level again, matching the fresh spawn state. */
  resetOrientation(): void {
    this.yaw = 0;
    this.pitch = 0;
  }
  private velocityVec: Vec3Data = { x: 0, y: 0, z: 0 };

  constructor(private readonly store: Store<FrequencyState>) {}

  update(input: InputSnapshot, deltaMs: number): void {
    if (deltaMs <= 0) return;

    this.yaw -= input.mouseDelta.x * LOOK_CONFIG.radiansPerPixel;
    this.pitch = clamp(
      this.pitch - input.mouseDelta.y * LOOK_CONFIG.radiansPerPixel,
      -LOOK_CONFIG.maxPitch,
      LOOK_CONFIG.maxPitch,
    );
    const direction = directionFromLook(this.yaw, this.pitch);

    const accelDirection = this.accelDirection(direction, input.axes);
    const accelMagnitude =
      FLIGHT_CONFIG.acceleration * (input.buttons.accelerate ? FLIGHT_CONFIG.boostMultiplier : 1);
    this.velocityVec = stepVelocity(this.velocityVec, accelDirection, accelMagnitude, deltaMs);
    const speed = Math.hypot(this.velocityVec.x, this.velocityVec.y, this.velocityVec.z);
    const dt = deltaMs / 1000;

    const { x: vx, y: vy, z: vz } = this.velocityVec;
    this.store.setState((state) => ({
      ...state,
      hz: mapWheelToHz(state.hz, input.wheelDelta),
      amplitude: smoothAmplitude(state.amplitude, input.buttons.windHold ? 1 : 0, deltaMs),
      velocity: speed,
      energy: clamp(speed / FLIGHT_CONFIG.maxSpeed, 0, 1),
      direction,
      position: {
        x: state.position.x + vx * dt,
        y: clamp(state.position.y + vy * dt, FLIGHT_CONFIG.minY, FLIGHT_CONFIG.maxY),
        z: state.position.z + vz * dt,
      },
    }));
  }

  private accelDirection(forward: Vec3Data, axes: InputSnapshot['axes']): Vec3Data {
    // Right vector on the horizontal plane; forward includes pitch so the
    // player flies where they look.
    const right = { x: Math.cos(this.yaw), y: 0, z: -Math.sin(this.yaw) };
    const x = forward.x * axes.moveZ + right.x * axes.moveX;
    const y = forward.y * axes.moveZ;
    const z = forward.z * axes.moveZ + right.z * axes.moveX;
    const length = Math.hypot(x, y, z);
    if (length < 1e-9) return { x: 0, y: 0, z: 0 };
    return { x: x / length, y: y / length, z: z / length };
  }
}
