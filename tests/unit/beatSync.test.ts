import { describe, expect, it } from 'vitest';
import type { AnalysisSnapshot } from '../../src/audio/AudioAnalyser';
import { BEAT_SYNC_CONFIG, BeatSync, type BeatEvent } from '../../src/rendering/BeatSync';

function silentSnapshot(overrides: Partial<AnalysisSnapshot> = {}): AnalysisSnapshot {
  return {
    rms: 0,
    lowBand: 0,
    midBand: 0,
    highBand: 0,
    onset: false,
    spectralCentroid: 0,
    ...overrides,
  };
}

const beat: BeatEvent = { atMs: 0 };

describe('BeatSync pulse envelope', () => {
  it('starts at zero and stays at zero without beats or onsets', () => {
    const sync = new BeatSync();
    expect(sync.pulse).toBe(0);
    sync.update(silentSnapshot(), 0.016);
    expect(sync.pulse).toBe(0);
  });

  it('attacks toward 1 on a beat, but not instantly in one small step', () => {
    const sync = new BeatSync();
    sync.handleBeat(beat);
    sync.update(silentSnapshot(), 0.008);
    expect(sync.pulse).toBeGreaterThan(0);
    expect(sync.pulse).toBeLessThan(1);
  });

  it('reaches a strong peak within the attack window', () => {
    const sync = new BeatSync();
    sync.handleBeat(beat);
    for (let i = 0; i < 8; i++) sync.update(silentSnapshot(), 0.016);
    expect(sync.pulse).toBeGreaterThan(0.5);
  });

  it('decays smoothly and monotonically after the peak', () => {
    const sync = new BeatSync();
    sync.handleBeat(beat);
    for (let i = 0; i < 8; i++) sync.update(silentSnapshot(), 0.016);
    const peak = sync.pulse;
    let previous = peak;
    for (let i = 0; i < 60; i++) {
      sync.update(silentSnapshot(), 0.016);
      expect(sync.pulse).toBeLessThanOrEqual(previous + 1e-9);
      previous = sync.pulse;
    }
    expect(sync.pulse).toBeLessThan(peak * 0.2);
  });

  it('never exceeds 1 even with rapid repeated beats', () => {
    const sync = new BeatSync();
    for (let i = 0; i < 50; i++) {
      sync.handleBeat(beat);
      sync.update(silentSnapshot(), 0.016);
      expect(sync.pulse).toBeLessThanOrEqual(1);
      expect(sync.pulse).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('BeatSync onset response', () => {
  it('an analysis onset raises the pulse without a beat', () => {
    const sync = new BeatSync();
    sync.update(silentSnapshot({ onset: true }), 0.016);
    for (let i = 0; i < 6; i++) sync.update(silentSnapshot(), 0.016);
    expect(sync.pulse).toBeGreaterThan(0);
  });

  it('an onset pulse is weaker than a beat pulse', () => {
    const onsetSync = new BeatSync();
    onsetSync.update(silentSnapshot({ onset: true }), 0.016);
    const beatSync = new BeatSync();
    beatSync.handleBeat(beat);
    beatSync.update(silentSnapshot(), 0.016);
    for (let i = 0; i < 10; i++) {
      onsetSync.update(silentSnapshot(), 0.016);
      beatSync.update(silentSnapshot(), 0.016);
    }
    expect(beatSync.pulse).toBeGreaterThan(onsetSync.pulse);
  });
});

describe('BeatSync modulation depth cap (§23 reduced flashing)', () => {
  it('modulation never exceeds the configured maximum depth', () => {
    const sync = new BeatSync();
    for (let i = 0; i < 100; i++) {
      sync.handleBeat(beat);
      sync.update(silentSnapshot({ onset: true }), 0.016);
      expect(sync.modulation).toBeLessThanOrEqual(BEAT_SYNC_CONFIG.maxModulationDepth);
      expect(sync.modulation).toBeGreaterThanOrEqual(0);
    }
  });

  it('modulation is proportional to the pulse', () => {
    const sync = new BeatSync();
    sync.handleBeat(beat);
    for (let i = 0; i < 8; i++) sync.update(silentSnapshot(), 0.016);
    expect(sync.modulation).toBeCloseTo(
      sync.pulse * BEAT_SYNC_CONFIG.maxModulationDepth,
      6,
    );
  });
});

describe('BeatSync targets and bus wiring', () => {
  it('pushes the capped modulation to every registered target each update', () => {
    const received: number[][] = [[], []];
    const sync = new BeatSync([
      { setPulse: (value) => received[0]!.push(value) },
      { setPulse: (value) => received[1]!.push(value) },
    ]);
    sync.handleBeat(beat);
    sync.update(silentSnapshot(), 0.016);
    sync.update(silentSnapshot(), 0.016);
    expect(received[0]).toHaveLength(2);
    expect(received[1]).toHaveLength(2);
    expect(received[0]![1]).toBe(sync.modulation);
    for (const value of received[0]!) {
      expect(value).toBeLessThanOrEqual(BEAT_SYNC_CONFIG.maxModulationDepth);
    }
  });

  it('subscribes to a typed beat bus and detaches cleanly', () => {
    const handlers = new Set<(payload: BeatEvent) => void>();
    const bus = {
      on(_event: 'beat', handler: (payload: BeatEvent) => void): () => void {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    };
    const sync = new BeatSync();
    const off = sync.subscribe(bus);
    for (const handler of handlers) handler(beat);
    sync.update(silentSnapshot(), 0.016);
    expect(sync.pulse).toBeGreaterThan(0);
    off();
    expect(handlers.size).toBe(0);
  });
});
