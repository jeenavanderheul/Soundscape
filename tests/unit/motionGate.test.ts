import { describe, expect, it } from 'vitest';
import {
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
    spatial.setMotion(0);
    expect(last(gain.gain.calls).value).toBeCloseTo(
      resonator.amplitude * RESONATOR_SILENCE_FLOOR,
      5,
    );
    spatial.setMotion(1);
    expect(last(gain.gain.calls).value).toBeCloseTo(resonator.amplitude, 5);
  });
});

function last<T>(calls: readonly T[]): T {
  return calls[calls.length - 1]!;
}
