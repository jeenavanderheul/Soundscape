/**
 * §195 DEMO FLIGHT (user decision): an automatic pilot that tours all six
 * worlds so a visitor can SEE the experience without knowing a single key.
 *
 * Everything here is pure: elapsed time + what the orb currently senses →
 * the same values a pair of hands would produce (throttle, wind, look). The
 * glue in Game.ts pushes those into the ONE InputManager snapshot every other
 * sensor feeds (§56) — there is no second path through the tick.
 *
 * It flies rather than teleports, because §56/§194 decide the world from the
 * heading you are actually travelling: the only honest way to reach the next
 * sector is to turn into it and go.
 */

/** The compass is six 60° sectors; the tour walks them in order and repeats. */
const SECTOR_COUNT = 6;
const SECTOR_STEP = (Math.PI * 2) / SECTOR_COUNT;

export const DEMO_CONFIG = {
  /** ~20 s per world → ~2 minutes for the full round (user decision). */
  legMs: 20_000,
  /** How long the turn into the next world takes. A person leans, not snaps. */
  turnMs: 4500,
  /** Look pixels per frame the pilot may spend, per axis. Its speed limit. */
  maxLookPx: { x: 9, y: 6 },
  /** Look pixels per radian of heading error — proportional, so it eases in. */
  yawGainPxPerRad: 34,
  /** A slow lean laid over the course so the line is never dead straight. */
  wanderRad: 0.05,
  wanderPeriodMs: 7300,
  /** Height above ground the arcs are allowed to reach (§: AIR_ALTITUDE 250). */
  minAltitude: 35,
  maxAltitude: 900,
  /** Altitude error → asked-for climb rate, and its ceiling in units/s. */
  climbGain: 0.35,
  maxClimbRate: 26,
  /** Climb-rate error → pitch pixels. */
  pitchGainPxPerUnit: 0.6,
} as const;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** Angle wrapped to (−π, π]. */
function wrapAngle(a: number): number {
  const turns = (a + Math.PI) / (Math.PI * 2);
  return (turns - Math.floor(turns)) * (Math.PI * 2) - Math.PI;
}

/** Deterministic 0..1 from two small integers — no RNG state to carry. */
function hash01(a: number, b: number): number {
  let h = Math.imul(a + 0x9e37, 0x85eb_ca6b) ^ Math.imul(b + 0x165b, 0xc2b2_ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4_eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 0x1_0000_0000;
}

/** Smooth 0→1 with zero slope at both ends: the shape of a human turn. */
function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Which leg of the tour a moment falls in. Leg 0 is the first world. */
export function legIndex(elapsedMs: number): number {
  return Math.max(0, Math.floor(elapsedMs / DEMO_CONFIG.legMs));
}

/** The world a leg belongs to: 0..5, then round again, forever. */
export function worldIndex(elapsedMs: number): number {
  return ((legIndex(elapsedMs) % SECTOR_COUNT) + SECTOR_COUNT) % SECTOR_COUNT;
}

/**
 * The bearing the pilot is steering for. It keeps turning the same way — one
 * sector per leg — and eases across the border over `turnMs`, so the change of
 * world is a lean into a curve rather than a snap.
 */
export function targetBearing(elapsedMs: number): number {
  const leg = legIndex(elapsedMs);
  const phase = (elapsedMs - leg * DEMO_CONFIG.legMs) / DEMO_CONFIG.turnMs;
  // The first leg has nothing to turn out of: the orb spawns looking north,
  // which is already the first world. Starting it mid-turn would swing away.
  const from = leg === 0 ? 0 : (leg - 1) * SECTOR_STEP;
  const to = leg * SECTOR_STEP;
  const eased = from + (to - from) * smoothstep(phase);
  const wander =
    Math.sin((elapsedMs / DEMO_CONFIG.wanderPeriodMs) * Math.PI * 2) * DEMO_CONFIG.wanderRad;
  return eased + wander;
}

/**
 * The height above ground the pilot wants right now. Each world gets its own
 * arc — a different base, swing and rhythm — so over a round the flight goes
 * from skimming (dark, heavy) to well above AIR_ALTITUDE (open) and back.
 */
export function targetAltitude(elapsedMs: number): number {
  const leg = legIndex(elapsedMs);
  const world = worldIndex(elapsedMs);
  const phase = (elapsedMs - leg * DEMO_CONFIG.legMs) / DEMO_CONFIG.legMs;
  // The floor and ceiling of THIS world's arc, so it always covers ground to
  // sky without ever being clamped — a clamp would flatten it into a plateau.
  const low = 40 + hash01(world, 1) * 60;
  const high = 260 + hash01(world, 2) * 280;
  const cycles = 0.5 + hash01(world, 3) * 0.3;
  const offset = hash01(world, 4);
  const arc = Math.sin((phase * cycles + offset) * Math.PI * 2);
  const middle = (low + high) / 2;
  return clamp(
    middle + ((high - low) / 2) * arc,
    DEMO_CONFIG.minAltitude,
    DEMO_CONFIG.maxAltitude,
  );
}

export interface Gust {
  startMs: number;
  durationMs: number;
}

/**
 * The wind this leg — irregular on purpose. Gaps of 2.2–6.8 s and holds of
 * 0.22–1.5 s, both drawn from the leg's own hash, so it reads as somebody
 * playing rather than a metronome. Every round repeats exactly (seeded), which
 * is what makes the demo testable and equally good each time.
 */
export function gustsForLeg(leg: number): Gust[] {
  const world = ((leg % SECTOR_COUNT) + SECTOR_COUNT) % SECTOR_COUNT;
  const out: Gust[] = [];
  let at = 1200 + hash01(world, 90) * 2000;
  for (let i = 0; i < 8; i++) {
    const durationMs = 220 + hash01(world, 200 + i) * 1280;
    if (at + durationMs > DEMO_CONFIG.legMs - 400) break;
    out.push({ startMs: at, durationMs });
    at += durationMs + 2200 + hash01(world, 300 + i) * 4600;
  }
  return out;
}

/** Whether the wind is being held at this moment of the flight. */
export function windAt(elapsedMs: number): boolean {
  const leg = legIndex(elapsedMs);
  const local = elapsedMs - leg * DEMO_CONFIG.legMs;
  return gustsForLeg(leg).some(
    (gust) => local >= gust.startMs && local < gust.startMs + gust.durationMs,
  );
}

/** What the orb can feel: where it points, how high it is, how fast it rises. */
export interface PilotSense {
  /** Travel heading in radians, 0 = north, +east — the §56 heading. */
  heading: number;
  /** Height above the ground under the orb, in units. */
  altitude: number;
  /** Vertical speed in units/s, positive is climbing. */
  climbRate: number;
}

export interface PilotCommand {
  axes: { moveX: number; moveZ: number };
  windHold: boolean;
  /** Synthetic mouse pixels for this frame — exactly what a hand would move. */
  look: { x: number; y: number };
  worldIndex: number;
  targetBearing: number;
  targetAltitude: number;
}

/**
 * One frame of piloting. Throttle is held flat the whole tour (the user asked
 * for one constant speed), and the two loops that remain are closed on what
 * the orb senses: heading chases the eased target bearing, pitch chases the
 * climb rate the altitude arc is asking for. Proportional, so both ease out
 * instead of arriving square.
 */
export function pilotCommand(elapsedMs: number, sense: PilotSense): PilotCommand {
  const bearing = targetBearing(elapsedMs);
  const altitude = targetAltitude(elapsedMs);

  const headingError = wrapAngle(bearing - sense.heading);
  const lookX = clamp(
    headingError * DEMO_CONFIG.yawGainPxPerRad,
    -DEMO_CONFIG.maxLookPx.x,
    DEMO_CONFIG.maxLookPx.x,
  );

  const wantedClimb = clamp(
    (altitude - sense.altitude) * DEMO_CONFIG.climbGain,
    -DEMO_CONFIG.maxClimbRate,
    DEMO_CONFIG.maxClimbRate,
  );
  // Pitching UP is negative mouse-y, the same as pushing the mouse forward.
  const lookY = clamp(
    -(wantedClimb - sense.climbRate) * DEMO_CONFIG.pitchGainPxPerUnit,
    -DEMO_CONFIG.maxLookPx.y,
    DEMO_CONFIG.maxLookPx.y,
  );

  return {
    // Full forward, never a strafe: heading comes from the look, as it does
    // for a player. The throttle stays open so the speed never changes.
    axes: { moveX: 0, moveZ: 1 },
    windHold: windAt(elapsedMs),
    look: { x: lookX, y: lookY },
    worldIndex: worldIndex(elapsedMs),
    targetBearing: bearing,
    targetAltitude: altitude,
  };
}
