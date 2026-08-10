/**
 * Integration (§20 M4 synchronized world behavior): a running StrudelEngine's
 * beat-boundary callbacks are bridged onto the typed event bus as 'beat'
 * events, which BeatSync consumes into a world pulse. This is the same wiring
 * Game.ts performs (engine.onBeat -> events.emit('beat') -> BeatSync).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrudelEngine } from '../../src/audio/StrudelEngine';
import {
  buildLayerGraph,
  TEMPO_CONFIDENCE_THRESHOLD,
} from '../../src/audio/MusicalPrimitives';
import type { AnalysisSnapshot } from '../../src/audio/AudioAnalyser';
import { createEventBus } from '../../src/core/EventBus';
import { createInitialMusicState } from '../../src/music/MusicState';
import { BeatSync, type BeatEvent } from '../../src/rendering/BeatSync';
import { asContext, FakeAudioContext } from './audioFakes';

const strudel = vi.hoisted(() => {
  const repl = {
    evaluate: vi.fn(async (_code: string, _autostart?: boolean) => undefined),
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    setCps: vi.fn(),
    scheduler: { now: () => 0 },
  };
  const destinationGain = {
    connect(target: unknown) {
      return target;
    },
    disconnect() {},
  };
  return { repl, destinationGain, initStrudel: vi.fn(async () => repl) };
});

vi.mock('@strudel/web', () => ({
  initStrudel: strudel.initStrudel,
  getSuperdoughAudioController: () => ({ output: { destinationGain: strudel.destinationGain } }),
}));

const QUIET_SNAPSHOT: AnalysisSnapshot = {
  rms: 0,
  lowBand: 0,
  midBand: 0,
  highBand: 0,
  onset: false,
  spectralCentroid: 0,
};

describe('beat wiring integration: StrudelEngine -> bus -> BeatSync', () => {
  let engine: StrudelEngine;

  beforeEach(async () => {
    vi.useFakeTimers();
    engine = new StrudelEngine();
    await engine.initialize(asContext(new FakeAudioContext()));
  });

  afterEach(() => {
    engine.dispose();
    vi.useRealTimers();
  });

  it('a running engine produces beat events that pulse BeatSync', async () => {
    const bus = createEventBus<{ beat: BeatEvent }>();
    const beatSync = new BeatSync();
    beatSync.subscribe(bus);
    engine.onBeat((event) => bus.emit('beat', event));

    await engine.start();
    engine.setLayerGraph(
      buildLayerGraph({
        ...createInitialMusicState(),
        bpm: 120,
        tempoConfidence: TEMPO_CONFIDENCE_THRESHOLD + 0.1,
        rhythmDensity: 1,
        pitchCenter: 220,
      }),
      'bar',
    );
    await vi.advanceTimersByTimeAsync(0); // graph applies at the boundary

    // No beat yet: the pulse stays flat.
    beatSync.update(QUIET_SNAPSHOT, 0.016);
    expect(beatSync.pulse).toBe(0);

    await vi.advanceTimersByTimeAsync(500); // 120 bpm -> first beat boundary
    beatSync.update(QUIET_SNAPSHOT, 0.016);
    expect(beatSync.pulse).toBeGreaterThan(0);
  });
});
