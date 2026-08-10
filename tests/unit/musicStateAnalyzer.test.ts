import { describe, expect, it } from 'vitest';
import { createStore, Store } from '../../src/core/stores';
import { createInitialMusicState, MusicState } from '../../src/music/MusicState';
import { MusicStateAnalyzer } from '../../src/music/MusicStateAnalyzer';
import { RhythmDetector } from '../../src/music/RhythmDetector';
import { createInitialFrequencyState, FrequencyState } from '../../src/player/FrequencyState';

function makeFrequency(overrides: Partial<FrequencyState> = {}): FrequencyState {
  return { ...createInitialFrequencyState(), ...overrides };
}

function setup() {
  const store: Store<MusicState> = createStore(createInitialMusicState());
  const rhythm = new RhythmDetector();
  const analyzer = new MusicStateAnalyzer(store, rhythm);
  return { store, rhythm, analyzer };
}

/** Run the analyzer at the logic rate for `durationMs`, feeding a fixed frequency state. */
function run(
  analyzer: MusicStateAnalyzer,
  frequency: FrequencyState,
  startMs: number,
  durationMs: number,
  stepMs = 100,
): number {
  let t = startMs;
  const end = startMs + durationMs;
  while (t <= end) {
    analyzer.update(t, frequency);
    t += stepMs;
  }
  return t;
}

describe('MusicStateAnalyzer', () => {
  it('publishes rhythm detector output into the music store', () => {
    const { store, rhythm, analyzer } = setup();
    const frequency = makeFrequency({ amplitude: 0.5 });
    for (let t = 0; t <= 12_000; t += 100) {
      if (t % 500 === 0) rhythm.onOnset(t);
      analyzer.update(t, frequency);
    }
    const state = store.getState();
    expect(state.bpm).toBeGreaterThan(118);
    expect(state.bpm).toBeLessThan(122);
    expect(state.tempoConfidence).toBeGreaterThan(0.6);
    expect(state.rhythmicRegularity).toBeGreaterThan(0.8);
    expect(state.rhythmDensity).toBeGreaterThan(1.5);
  });

  it('smooths dynamics instead of jumping on an amplitude step', () => {
    const { store, analyzer } = setup();
    analyzer.update(0, makeFrequency({ amplitude: 0 }));
    analyzer.update(100, makeFrequency({ amplitude: 1 }));
    const afterOneStep = store.getState().dynamics;
    expect(afterOneStep).toBeGreaterThan(0);
    expect(afterOneStep).toBeLessThan(0.9);

    run(analyzer, makeFrequency({ amplitude: 1 }), 200, 5_000);
    expect(store.getState().dynamics).toBeGreaterThan(0.9);
  });

  it('smooths pitchCenter toward hz', () => {
    const { store, analyzer } = setup();
    analyzer.update(0, makeFrequency({ hz: 220 }));
    analyzer.update(100, makeFrequency({ hz: 880 }));
    const stepped = store.getState().pitchCenter;
    expect(stepped).toBeGreaterThan(220);
    expect(stepped).toBeLessThan(880);

    run(analyzer, makeFrequency({ hz: 880 }), 200, 8_000);
    expect(store.getState().pitchCenter).toBeGreaterThan(800);
    expect(store.getState().pitchCenter).toBeLessThanOrEqual(880);
  });

  it('rates saw at high hz brighter than sine at low hz', () => {
    const bright = setup();
    run(bright.analyzer, makeFrequency({ waveform: 'saw', hz: 2000 }), 0, 5_000);
    const dark = setup();
    run(dark.analyzer, makeFrequency({ waveform: 'sine', hz: 110 }), 0, 5_000);
    const brightness = bright.store.getState().timbreBrightness;
    const darkness = dark.store.getState().timbreBrightness;
    expect(brightness).toBeGreaterThan(darkness + 0.2);
    expect(brightness).toBeLessThanOrEqual(1);
    expect(darkness).toBeGreaterThanOrEqual(0);
  });

  it('bounds unit-range fields even with out-of-range input', () => {
    const { store, analyzer } = setup();
    run(analyzer, makeFrequency({ amplitude: 5, hz: 20_000 }), 0, 5_000);
    const state = store.getState();
    expect(state.dynamics).toBeLessThanOrEqual(1);
    expect(state.timbreBrightness).toBeLessThanOrEqual(1);
    expect(state.transientDensity).toBeLessThanOrEqual(1);
    expect(state.transientDensity).toBeGreaterThanOrEqual(0);
  });

  it('derives transientDensity from onset rate, bounded to [0, 1]', () => {
    const { store, rhythm, analyzer } = setup();
    const frequency = makeFrequency();
    for (let t = 0; t <= 10_000; t += 100) {
      if (t % 250 === 0) rhythm.onOnset(t); // 4 onsets/sec
      analyzer.update(t, frequency);
    }
    const value = store.getState().transientDensity;
    expect(value).toBeGreaterThan(0.2);
    expect(value).toBeLessThanOrEqual(1);
  });

  it('starts in void and transitions to intro only after sustained energy', () => {
    const { store, rhythm, analyzer } = setup();
    expect(store.getState().formPhase).toBe('void');

    // Brief blip of energy: still void.
    run(analyzer, makeFrequency({ amplitude: 0.8 }), 0, 500);
    run(analyzer, makeFrequency({ amplitude: 0 }), 600, 5_000);
    expect(store.getState().formPhase).toBe('void');

    // Sustained energy with pulses: intro.
    for (let t = 6_000; t <= 20_000; t += 100) {
      if (t % 500 === 0) rhythm.onOnset(t);
      analyzer.update(t, makeFrequency({ amplitude: 0.8 }));
    }
    expect(store.getState().formPhase).toBe('intro');

    // Intro persists even when energy drops (no further phases in M4).
    run(analyzer, makeFrequency({ amplitude: 0 }), 21_000, 10_000);
    expect(store.getState().formPhase).toBe('intro');
  });

  it('updates the store immutably', () => {
    const { store, analyzer } = setup();
    const before = store.getState();
    const beforeDynamics = before.dynamics;
    analyzer.update(0, makeFrequency({ amplitude: 1 }));
    analyzer.update(100, makeFrequency({ amplitude: 1 }));
    expect(store.getState()).not.toBe(before);
    expect(before.dynamics).toBe(beforeDynamics);
    expect(Object.isFrozen(store.getState())).toBe(true);
  });
});
