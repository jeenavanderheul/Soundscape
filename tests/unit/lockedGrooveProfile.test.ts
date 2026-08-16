import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/core/EventBus';
import { GenreAffinityEngine, GenreEvents } from '../../src/genres/GenreAffinityEngine';
import { scoreLockedGroove, tempoTendency } from '../../src/genres/LockedGrooveProfile';
import { createInitialMusicState, type MusicState } from '../../src/music/MusicState';

function lockedGrooveState(): MusicState {
  return {
    ...createInitialMusicState(),
    bpm: 128,
    tempoConfidence: 0.9,
    rhythmicRegularity: 0.95,
    repetition: 0.9,
    lowEndEnergy: 0.7,
    timbreBrightness: 0.6,
    timbreNoise: 0.2,
    textureDensity: 0.5,
  };
}

describe('scoreLockedGroove (§9.1)', () => {
  it('scores high for a repetitive, pulsed, low-end-heavy 128 BPM state', () => {
    expect(scoreLockedGroove(lockedGrooveState())).toBeGreaterThan(0.5);
  });

  it('scores near zero without repetition, whatever the BPM (BPM never decides alone)', () => {
    const state = { ...lockedGrooveState(), repetition: 0, rhythmicRegularity: 0.1, tempoConfidence: 0.1 };
    expect(scoreLockedGroove(state)).toBeLessThan(0.1);
  });

  it('scores an ambient-like state low', () => {
    const state: MusicState = {
      ...createInitialMusicState(),
      bpm: 0,
      repetition: 0.1,
      lowEndEnergy: 0.2,
      timbreBrightness: 0.1,
      textureDensity: 0.1,
    };
    expect(scoreLockedGroove(state)).toBeLessThan(0.1);
  });

  it('tempoTendency peaks inside 120-145 and is 0 without tempo', () => {
    expect(tempoTendency(0)).toBe(0);
    expect(tempoTendency(132)).toBeGreaterThan(tempoTendency(100));
    expect(tempoTendency(132)).toBeGreaterThan(tempoTendency(170));
  });
});

describe('GenreAffinityEngine (§9)', () => {
  it('smooths toward the profile score, throttles to the interval, freezes snapshots and bounds history', () => {
    const bus = createEventBus<GenreEvents>();
    const engine = new GenreAffinityEngine(bus, {
      intervalMs: 100,
      smoothingRate: 5,
      dominantThreshold: 0.4,
      historyLimit: 4,
    });
    let emitted = 0;
    bus.on('genre:snapshot', () => {
      emitted += 1;
    });
    const state = lockedGrooveState();
    // Same timestamp twice: second call must be throttled away (never per frame).
    engine.update(0, state);
    engine.update(10, state);
    expect(emitted).toBe(1);
    for (let t = 100; t <= 2000; t += 100) engine.update(t, state);
    const snap = engine.current!;
    expect(snap.affinity['locked-groove']).toBeGreaterThan(0.4);
    expect(snap.dominant).toBe('locked-groove');
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.affinity)).toBe(true);
    expect(engine.history.length).toBeLessThanOrEqual(4);
    // Affinity decays when the music stops being locked groove-like WHILE the
    // player keeps moving (motion 1). Without motion this same fade was the
    // §194 bug: standing still erased the world you were in.
    const silent = createInitialMusicState();
    for (let t = 2100; t <= 4000; t += 100) engine.update(t, silent, undefined, 1);
    expect(engine.current!.affinity['locked-groove']).toBeLessThan(0.2);
  });
});
