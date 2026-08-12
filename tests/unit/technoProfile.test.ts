import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/core/EventBus';
import { GenreAffinityEngine, GenreEvents } from '../../src/genres/GenreAffinityEngine';
import { scoreTechno, tempoTendency } from '../../src/genres/TechnoProfile';
import { createInitialMusicState, type GenreAffinity, MusicState } from '../../src/music/MusicState';

function technoState(): MusicState {
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

describe('scoreTechno (§9.1)', () => {
  it('scores high for a repetitive, pulsed, low-end-heavy 128 BPM state', () => {
    expect(scoreTechno(technoState())).toBeGreaterThan(0.5);
  });

  it('scores near zero without repetition, whatever the BPM (BPM never decides alone)', () => {
    const state = { ...technoState(), repetition: 0, rhythmicRegularity: 0.1, tempoConfidence: 0.1 };
    expect(scoreTechno(state)).toBeLessThan(0.1);
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
    expect(scoreTechno(state)).toBeLessThan(0.1);
  });

  it('tempoTendency peaks inside 120-145 and is 0 without tempo', () => {
    expect(tempoTendency(0)).toBe(0);
    expect(tempoTendency(132)).toBeGreaterThan(tempoTendency(100));
    expect(tempoTendency(132)).toBeGreaterThan(tempoTendency(170));
  });
});

describe('GenreAffinityEngine (§9)', () => {
  it('never lets a dormant genre become active or dominant', () => {
    const engine = new GenreAffinityEngine(createEventBus<GenreEvents>(), {
      intervalMs: 100,
      smoothingRate: 20,
      dominantThreshold: 0.4,
      historyLimit: 4,
    });
    const zone: GenreAffinity = {
      techno: 0,
      'sub-pressure': 0,
      ambient: 1,
      jazz: 0,
      bass: 0,
      garage: 0,
      house: 0,
      trap: 0,
      breakbeat: 0,
      dub: 0,
      experimental: 0,
    };
    const music = { ...createInitialMusicState(), bpm: 120, dynamics: 1 };
    for (let t = 0; t <= 1000; t += 100) engine.update(t, music, zone);

    expect(engine.current!.affinity.ambient).toBe(0);
    expect(engine.current!.dominant).not.toBe('ambient');
  });

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
    const state = technoState();
    // Same timestamp twice: second call must be throttled away (never per frame).
    engine.update(0, state);
    engine.update(10, state);
    expect(emitted).toBe(1);
    for (let t = 100; t <= 2000; t += 100) engine.update(t, state);
    const snap = engine.current!;
    expect(snap.affinity.techno).toBeGreaterThan(0.4);
    expect(snap.dominant).toBe('techno');
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.affinity)).toBe(true);
    expect(engine.history.length).toBeLessThanOrEqual(4);
    // Affinity decays when the music stops being techno-like.
    const silent = createInitialMusicState();
    for (let t = 2100; t <= 4000; t += 100) engine.update(t, silent);
    expect(engine.current!.affinity.techno).toBeLessThan(0.2);
  });
});
