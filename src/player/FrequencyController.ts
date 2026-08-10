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
  /**
   * Hard bottom of the world, kept BELOW the deepest terrain so the landscape
   * itself is what stops the orb (§35) — not an invisible plane.
   */
  minY: -12,
  maxY: 70,
  /** §35: how far the orb's centre stays clear of the ground. */
  orbRadius: 1.6,
  /** Upward push when the orb touches the landscape — a bump, not a wall. */
  bumpSpeed: 7,
  /** Fraction of downward speed kept after a bump: the rest is absorbed. */
  bumpRestitution: 0.25,
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
  /** §35: samples the solid landscape; unset means the old flat floor. */
  private groundAt: ((x: number, z: number) => number) | null = null;
  private grounded = false;

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
    this.store.setState((state) => {
      const x = state.position.x + vx * dt;
      const z = state.position.z + vz * dt;
      let y = clamp(state.position.y + vy * dt, FLIGHT_CONFIG.minY, FLIGHT_CONFIG.maxY);
      // §35 HARD RULE: the landscape is solid. Touching it lifts the orb back
      // out and absorbs most of the downward speed — a bump, never a wall and
      // never a fall through the floor.
      const floor = (this.groundAt?.(x, z) ?? FLIGHT_CONFIG.minY) + FLIGHT_CONFIG.orbRadius;
      if (y < floor) {
        y = floor;
        this.velocityVec.y =
          this.velocityVec.y < 0
            ? -this.velocityVec.y * FLIGHT_CONFIG.bumpRestitution + FLIGHT_CONFIG.bumpSpeed * dt
            : this.velocityVec.y;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
      return {
        ...state,
        hz: mapWheelToHz(state.hz, input.wheelDelta),
        amplitude: smoothAmplitude(state.amplitude, input.buttons.windHold ? 1 : 0, deltaMs),
        velocity: speed,
        energy: clamp(speed / FLIGHT_CONFIG.maxSpeed, 0, 1),
        direction,
        position: { x, y, z },
      };
    });
  }

  /** §35: the landscape height sampler. Without one the old flat floor applies. */
  setGroundSampler(sampler: (x: number, z: number) => number): void {
    this.groundAt = sampler;
  }

  /** True on the frame the orb is resting on the landscape. */
  get onGround(): boolean {
    return this.grounded;
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
