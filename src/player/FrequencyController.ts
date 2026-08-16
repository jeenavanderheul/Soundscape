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
  /** units/s — top gear. Twelfth gear has to FEEL like a motorway (user). */
  maxSpeed: 66,
  /**
   * Hard bottom of the world, kept BELOW the deepest terrain so the landscape
   * itself is what stops the orb (§35) — not an invisible plane.
   */
  minY: -12,
  /**
   * §180: the sky has to stand above the world's tallest thing, or climbing
   * stops dead in mid-air. It sat at 70 from when a tree was ~30 units. Since
   * §176-§179 the world is measured in 140-unit dancers: the SHORTEST growth
   * is drawn at 280 units and a giant reaches ~1125, so a 70-unit ceiling was
   * below a dancer's waist — measured, the orb was pinned at exactly y=70 with
   * +132 u/s of climb still being asked for. 1200 clears the whole canopy.
   */
  maxY: 1200,
  /** §35: how far the orb's centre stays clear of the ground. */
  orbRadius: 1.6,
  /** Upward push when the orb touches the landscape — a bump, not a wall. */
  bumpSpeed: 7,
  /** Fraction of downward speed kept after a bump: the rest is absorbed. */
  bumpRestitution: 0.25,
  /**
   * §35 HARD RULE, made unmissable: an invisible field above the landscape.
   * Inside this clearance the orb is pushed back up ever harder, so in practice
   * it never reaches the surface at all — the hard clamp below is the backstop,
   * not the mechanism.
   */
  repelClearance: 3.2,
  /** units/s² lifting the orb out, strongest right above the surface. */
  repelAcceleration: 34,
  /** Descent speed allowed at the top of the field; it scales to 0 at the surface. */
  repelMaxDescent: 14,
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
  config: Omit<typeof FLIGHT_CONFIG, 'maxSpeed'> & { maxSpeed: number } = FLIGHT_CONFIG,
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
/**
 * Speed is no longer a gearbox and no longer the clock (user decision, spec
 * §46). Flying is two speeds: you cruise, and holding the wind pulls you up to
 * full speed. What that changes is how fast the TRACK develops and how quickly
 * you cross the world — never which tempo the music is in.
 */
export const CRUISE_SPEED = 13;
/**
 * §119 (user decision): twice as fast at the top. The MUSIC does not follow —
 * `TrackBuilder.pace()` saturates at its own `fullSpeed` of 66, so everything
 * above that is pure travel: reaching a beacon, crossing into another world,
 * covering ground. §87 set the arc at ~90 seconds deliberately after it was
 * finishing a whole production in 24, and that stays exactly where it is.
 */
export const FULL_SPEED = 132;
/**
 * §51 (user decision): the throttle is NOTCHED. Five blocks of four quarters,
 * twenty notches in all. A tap gives you a notch straight away and letting go
 * steps back down one quarter at a time, so speed is something you tap and
 * ride rather than a slider you hold — and the HUD bar shows exactly the notch
 * you are on.
 */
export const THROTTLE_NOTCHES = 20;

/** §129: hyper speed is twice whatever the throttle is already giving you. */
export const HYPER_MULTIPLIER = 2;
/** Notches a single press adds immediately — a tap has to DO something. */
const TAP_NOTCHES = 2;
/** Seconds per notch: holding fills the bar in ~1.2s, releasing empties in ~2.6s. */
const NOTCH_RISE_S = 1.2 / THROTTLE_NOTCHES;
const NOTCH_FALL_S = 2.6 / THROTTLE_NOTCHES;

export class FrequencyController {
  private yaw = 0;
  private pitch = 0;
  /** §35: samples the solid landscape; unset means the old flat floor. */
  private groundAt: ((x: number, z: number) => number) | null = null;
  /** §36: the largest formations are solid too — they push the orb aside. */
  private obstacles: (() => readonly { x: number; z: number; radius: number; height: number }[]) | null =
    null;
  private grounded = false;
  /** §29.6: the orb grows with the track, so what it clears grows with it. */
  private orbRadius: number = FLIGHT_CONFIG.orbRadius;

  setOrbRadius(radius: number): void {
    this.orbRadius = Math.max(0.2, radius);
  }

  /** Turn rate in radians/s: positive is banking left (§33 turn throws). */
  get yawRate(): number {
    return this.yawRateValue;
  }

  /**
   * 0..1 how far the throttle is open right now — what the HUD bar draws.
   * §129: hyper is NOT folded in here. It is a burst you hold, not a gear you
   * left open, and folding it in would have halved the nine blocks §120 put
   * there for the ordinary range. The HUD says HYPER next to the bar instead.
   */
  get throttleLevel(): number {
    return this.notches / THROTTLE_NOTCHES;
  }

  /** Whether the hyper boost is being held right now. */
  get hyper(): boolean {
    return this.hyperOpen;
  }

  /** Vertical speed in units/s: positive is climbing (§29.7 arrangement). */
  get climbRate(): number {
    return this.velocityVec.y;
  }

  /** Reset world (§17): look level again, matching the fresh spawn state. */
  resetOrientation(): void {
    this.yaw = 0;
    this.pitch = 0;
  }
  private velocityVec: Vec3Data = { x: 0, y: 0, z: 0 };
  private yawRateValue = 0;
  /** 0..THROTTLE_NOTCHES — the notch the throttle is resting on. */
  private notches = 0;
  private notchTimer = 0;
  private wasThrottling = false;
  private hyperOpen = false;

  constructor(private readonly store: Store<FrequencyState>) {}

  update(input: InputSnapshot, deltaMs: number): void {
    if (deltaMs <= 0) return;

    const yawDelta = -input.mouseDelta.x * LOOK_CONFIG.radiansPerPixel;
    this.yawRateValue = yawDelta / (deltaMs / 1000);
    this.yaw += yawDelta;
    this.pitch = clamp(
      this.pitch - input.mouseDelta.y * LOOK_CONFIG.radiansPerPixel,
      -LOOK_CONFIG.maxPitch,
      LOOK_CONFIG.maxPitch,
    );
    const direction = directionFromLook(this.yaw, this.pitch);

    const accelDirection = this.accelDirection(direction, input.axes);
    // Inside the field you cannot even STEER into the ground: the downward part
    // of the thrust is cancelled as the gap closes (§35). Without this, holding
    // forward while looking straight down out-pushes any repulsion.
    const here = this.store.getState().position;
    const gap =
      here.y - ((this.groundAt?.(here.x, here.z) ?? FLIGHT_CONFIG.minY) + this.orbRadius);
    const speedNow = Math.hypot(this.velocityVec.x, this.velocityVec.y, this.velocityVec.z);
    const fieldNow = FLIGHT_CONFIG.repelClearance + speedNow * 0.08;
    if (gap < fieldNow && accelDirection.y < 0) {
      accelDirection.y *= Math.max(0, gap) / fieldNow;
    }
    // Drag alone would settle far below full speed, so the pull scales with the
    // ceiling: opening the throttle has to feel like opening a throttle.
    // Holding the wind opens the throttle (§3.2 dynamics = force); letting go
    // lets it fall away slowly, so boosting and releasing IS how you steer your
    // speed (user decision) — never an on/off switch.
    const seconds = deltaMs / 1000;
    const throttling = input.buttons.accelerate;
    // A press is worth a notch on its own: tapping is how you steer the speed.
    if (throttling && !this.wasThrottling) {
      this.notches = Math.min(THROTTLE_NOTCHES, this.notches + TAP_NOTCHES);
      this.notchTimer = 0;
    }
    this.wasThrottling = throttling;
    this.notchTimer += seconds;
    const step = throttling ? NOTCH_RISE_S : NOTCH_FALL_S;
    while (this.notchTimer >= step) {
      this.notchTimer -= step;
      this.notches = throttling
        ? Math.min(THROTTLE_NOTCHES, this.notches + 1)
        : Math.max(0, this.notches - 1);
    }
    // §129 (user decision): a separate hyper boost on top of the throttle —
    // held, it doubles wherever the throttle already is. It is a burst you
    // choose, not a gear you leave open, so it multiplies rather than adding
    // notches: tapping it at a crawl is still a crawl.
    const opened =
      CRUISE_SPEED + (FULL_SPEED - CRUISE_SPEED) * (this.notches / THROTTLE_NOTCHES);
    this.hyperOpen = input.buttons.hyper;
    const topSpeed = opened * (this.hyperOpen ? HYPER_MULTIPLIER : 1);
    const accelMagnitude = Math.max(
      FLIGHT_CONFIG.acceleration,
      topSpeed * FLIGHT_CONFIG.drag * 1.25,
    );
    const throttled = { ...FLIGHT_CONFIG, maxSpeed: topSpeed };
    this.velocityVec = stepVelocity(
      this.velocityVec,
      accelDirection,
      accelMagnitude,
      deltaMs,
      throttled,
    );
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
      const floor = (this.groundAt?.(x, z) ?? FLIGHT_CONFIG.minY) + this.orbRadius;
      // The force field: the closer to the ground, the harder it lifts, and it
      // eats downward speed so a dive is caught instead of stopped dead.
      const clearance = y - floor;
      // At motorway speed the orb covers a unit per frame, so the field has to
      // reach further out the faster you go.
      const fieldDepth = FLIGHT_CONFIG.repelClearance + speed * 0.08;
      if (clearance < fieldDepth) {
        const room = Math.max(0, clearance) / fieldDepth;
        // How fast you are still allowed to fall shrinks with the room left,
        // so the remaining gap can only ever be a fraction of itself: the orb
        // is caught by the field and never reaches the surface at all.
        const allowedDescent = room * FLIGHT_CONFIG.repelMaxDescent;
        if (this.velocityVec.y < -allowedDescent) this.velocityVec.y = -allowedDescent;
        // And it is pushed back out, hardest right above the ground.
        this.velocityVec.y += FLIGHT_CONFIG.repelAcceleration * (1 - room) * (1 - room) * dt;
        // §165: but only as far as the EDGE of the field. Without this the
        // impulse overshoots, every hill that passes under you adds another
        // one, and the orb ratchets up to the ceiling over a long flight — the
        // measured reason altitude did nothing. Enough to clear, never more.
        const toEdge = Math.max(0, fieldDepth - clearance) / 0.3;
        if (this.velocityVec.y > toEdge) this.velocityVec.y = toEdge;
      } else if (this.velocityVec.y > 0 && accelDirection.y <= 0.02) {
        // §165: the field was a RATCHET. It pushed up near the ground and
        // nothing ever gave the height back, so flying dead level — direction
        // y exactly 0 — still climbed 12 units to 24 in eight seconds, and over
        // a long flight everything ended up pinned at the ceiling. Measured, it
        // is why altitude did nothing: there was only ever one flying height.
        //
        // Once clear of the field, upward speed the PLAYER did not ask for
        // bleeds away. Ask for it — pitch up — and this does not touch you.
        this.velocityVec.y *= Math.max(0, 1 - dt * 2.4);
      }
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
      // §36: push out of any solid formation, horizontally — you fly AROUND a
      // giant, you never fly through it. Only the largest are solid.
      let px = x;
      let pz = z;
      for (const solid of this.obstacles?.() ?? []) {
        const groundY = this.groundAt?.(solid.x, solid.z) ?? FLIGHT_CONFIG.minY;
        if (y > groundY + solid.height) continue; // above the canopy: clear
        const dx = px - solid.x;
        const dz = pz - solid.z;
        const distance = Math.hypot(dx, dz);
        const clear = solid.radius + this.orbRadius;
        if (distance >= clear || distance < 1e-6) continue;
        px = solid.x + (dx / distance) * clear;
        pz = solid.z + (dz / distance) * clear;
      }
      return {
        ...state,
        hz: mapWheelToHz(state.hz, input.wheelDelta),
        amplitude: smoothAmplitude(state.amplitude, input.buttons.windHold ? 1 : 0, deltaMs),
        velocity: speed,
        energy: clamp(speed / FLIGHT_CONFIG.maxSpeed, 0, 1),
        direction,
        position: { x: px, y, z: pz },
      };
    });
  }

  /** §35: the landscape height sampler. Without one the old flat floor applies. */
  setGroundSampler(sampler: (x: number, z: number) => number): void {
    this.groundAt = sampler;
  }

  /** §36: the solid formations to fly around. */
  setObstacleSource(
    source: () => readonly { x: number; z: number; radius: number; height: number }[],
  ): void {
    this.obstacles = source;
  }

  /** True on the frame the orb is resting on the landscape. */
  /**
   * Dev-only, for the debug API: aim the flight at a bearing, the way the
   * mouse would. Headless test drivers have no pointer lock, and §56 decides
   * the world from where you LOOK — so without this, a scripted flight can
   * only ever fly north.
   */
  face(bearing: number): void {
    // Yaw counts the other way round than a compass bearing does — measured:
    // yaw=+1.05 flew NW. The API promises a bearing, so it converts.
    this.yaw = -bearing;
  }

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
