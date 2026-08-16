import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_LEVEL,
  RESONATOR_SILENCE_FLOOR,
  motionTarget,
  nextMotionLevel,
  resonatorLevel,
} from '../../src/audio/MotionGate';
import { PlayerTone } from '../../src/audio/PlayerTone';
import { SpatialAudio } from '../../src/audio/SpatialAudio';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import { createFirstResonator } from '../../src/world/Resonator';
import { FakeAudioContext, asContext, asOutput } from './audioFakes';
import { DRONE_HEADROOM } from '../../src/audio/SpatialAudio';
import { DRONE_DUCK, droneDuck, nextDronePresence } from '../../src/audio/MotionGate';

/** Runs the gate at 60 fps for `seconds` at a fixed velocity. */
function settle(level: number, velocity: number, seconds: number): number {
  const dt = 1 / 60;
  let current = level;
  for (let t = 0; t < seconds; t += dt) current = nextMotionLevel(current, velocity, dt);
  return current;
}

describe('§42 motion gate', () => {
  it('is closed while the orb stands still and fully open when flying', () => {
    expect(motionTarget(0)).toBe(0);
    expect(motionTarget(0.4)).toBe(0);
    expect(motionTarget(20)).toBe(1);
  });

  it('opens quickly when the flight starts', () => {
    expect(settle(0, 12, 0.5)).toBeGreaterThan(0.8);
  });

  it('fades out slowly instead of cutting: still audible after 0.5s, gone by 5s', () => {
    const halfSecond = settle(1, 0, 0.5);
    expect(halfSecond).toBeGreaterThan(0.5);
    expect(halfSecond).toBeLessThan(1);
    expect(settle(1, 0, 5)).toBeLessThan(0.05);
  });

  it('never leaves the 0..1 range', () => {
    expect(nextMotionLevel(1, 0, 100)).toBeGreaterThanOrEqual(0);
    expect(nextMotionLevel(0, 999, 100)).toBeLessThanOrEqual(1);
  });

  it('keeps a floor under the resonators so sound stays the waypoint (§P1)', () => {
    expect(resonatorLevel(0)).toBe(RESONATOR_SILENCE_FLOOR);
    expect(resonatorLevel(1)).toBe(1);
    expect(RESONATOR_SILENCE_FLOOR).toBeGreaterThan(0);
  });
});

describe('§42 gate applied to the voices', () => {
  it('silences the player tone at rest and lets it sound while moving', () => {
    const ctx = new FakeAudioContext();
    const tone = new PlayerTone(asContext(ctx), asOutput(ctx.destination));
    const state = { ...createInitialFrequencyState(), amplitude: 1 };
    tone.start(state);
    const gain = ctx.createdGains[0]!;
    tone.update(state, 1 / 60, 0);
    expect(last(gain.gain.calls).value).toBe(0);
    tone.update(state, 1 / 60, 1);
    expect(last(gain.gain.calls).value).toBeGreaterThan(0);
  });

  it('ducks resonator drones to the floor at rest, full level while moving', () => {
    const ctx = new FakeAudioContext();
    const spatial = new SpatialAudio(asContext(ctx), asOutput(ctx.destination));
    const resonator = createFirstResonator();
    spatial.addResonator(resonator);
    const gain = ctx.createdGains[0]!;
    // The RATIO between rest and motion is the claim; the absolute level is
    // DRONE_HEADROOM's business (§196 — a raw sine at the same number as a
    // mixed bus is far louder than the number suggests).
    spatial.setMotion(0);
    const atRest = last(gain.gain.calls).value;
    spatial.setMotion(1);
    const moving = last(gain.gain.calls).value;
    expect(atRest / moving).toBeCloseTo(RESONATOR_SILENCE_FLOOR, 5);
    expect(moving).toBeCloseTo(resonator.amplitude * DRONE_HEADROOM, 5);
    // And the cue stays well under the music it is a waypoint for.
    expect(moving).toBeLessThan(0.2);
  });
});

function last<T>(calls: readonly T[]): T {
  return calls[calls.length - 1]!;
}

/**
 * §184: arriving is not the same as stopping. §42 (standing still is silence)
 * was written about a player who has been flying and lets go; it was also
 * governing the visitor who has not moved yet, and gave them a world that made
 * no sound at all — measured at rms 0.005 twenty seconds in.
 */
describe('the world breathes before you have flown', () => {
  it('opens the gate on arrival even at a standstill', () => {
    expect(nextMotionLevel(0, 0, 1 / 60, ARRIVAL_LEVEL)).toBeGreaterThan(0);
  });

  it('reaches the arrival level and stops there, without flying', () => {
    let level = 0;
    for (let i = 0; i < 300; i++) level = nextMotionLevel(level, 0, 1 / 60, ARRIVAL_LEVEL);
    expect(level).toBeCloseTo(ARRIVAL_LEVEL, 3);
  });

  it('still lets flying open it further than arriving does', () => {
    let level = ARRIVAL_LEVEL;
    for (let i = 0; i < 300; i++) level = nextMotionLevel(level, 20, 1 / 60, ARRIVAL_LEVEL);
    // Asymptotic: it approaches wide open, it never lands on it exactly.
    expect(level).toBeGreaterThan(0.99);
  });

  it('falls to full silence once the floor is withdrawn', () => {
    // Which is what happens the moment the player first touches the controls:
    // from then on §42 governs the whole flight.
    let level = 1;
    // Five seconds is the claim that matters: by then it is inaudible.
    for (let i = 0; i < 300; i++) level = nextMotionLevel(level, 0, 1 / 60, 0);
    expect(level).toBeLessThan(0.04);
  });
});

/**
 * §197 (user: the waypoint tone is "alleen een referentie", nu veel te
 * aanwezig). Not a smaller number — two behaviours: it ducks under the music,
 * and it settles once it has been heard.
 */
describe('the waypoint drone is a reference, not a layer', () => {
  const settle = (seconds: number, moving: boolean, from = 1) => {
    let p = from;
    for (let i = 0; i < seconds * 60; i++) {
      p = nextDronePresence(p, { moving, dtSeconds: 1 / 60 });
    }
    return p;
  };

  it('fades to a whisper within a few seconds of standing still', () => {
    expect(settle(6, false)).toBeLessThan(0.2);
  });

  it('is still audible in the first moment, so the bearing can be taken', () => {
    // It announces itself: half a second in it is still most of its level.
    expect(settle(0.5, false)).toBeGreaterThan(0.7);
  });

  it('comes back quickly the moment you move again', () => {
    const settled = settle(8, false);
    expect(settled).toBeLessThan(0.2);
    expect(settle(1.5, true, settled)).toBeGreaterThan(0.85);
  });

  it('disappears under a full track and owns the silence', () => {
    expect(droneDuck(0)).toBe(1);
    expect(droneDuck(1)).toBeCloseTo(1 - DRONE_DUCK, 5);
    expect(droneDuck(1)).toBeLessThan(0.2);
  });

  it('never goes to absolute zero — §P1 keeps sound as the waypoint', () => {
    expect(settle(60, false)).toBeGreaterThan(0);
    expect(droneDuck(1)).toBeGreaterThan(0);
  });
});
