import { describe, expect, it } from 'vitest';
import {
  computeInterference,
  envelopeAt,
  INTERFERENCE_CONFIG,
  ringSpacingForHz,
  type ResonanceEvent,
  type WaveSource,
} from '../../src/resonance/InterferenceField';

function makeSource(overrides: Partial<WaveSource> = {}): WaveSource {
  return {
    position: { x: 0, y: 0, z: 0 },
    hz: 220,
    amplitude: 0.5,
    phase: 0,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<ResonanceEvent> = {}): ResonanceEvent {
  return {
    id: 'evt-1',
    atMs: 1000,
    sourceId: 'player',
    targetId: 'resonator-first',
    sourceHz: 220,
    targetHz: 330,
    ratio: 1.5,
    consonance: 0.9,
    dissonance: 0.1,
    amplitude: 0.5,
    velocity: 2,
    phaseDifference: 0,
    sourceWaveform: 'sine',
    targetWaveform: 'sine',
    strength: 0.7,
    persistence: 0.5,
    classification: 'harmonic',
    ...overrides,
  };
}

describe('ringSpacingForHz', () => {
  it('spacing shrinks as mean frequency rises (wavelength relation)', () => {
    const low = ringSpacingForHz(110, 110);
    const mid = ringSpacingForHz(220, 330);
    const high = ringSpacingForHz(880, 1760);
    expect(low).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(high);
  });

  it('stays within configured bounds for extreme frequencies', () => {
    expect(ringSpacingForHz(1, 1)).toBeLessThanOrEqual(INTERFERENCE_CONFIG.maxSpacing);
    expect(ringSpacingForHz(20000, 20000)).toBeGreaterThanOrEqual(INTERFERENCE_CONFIG.minSpacing);
  });
});

describe('envelopeAt', () => {
  it('starts at full strength', () => {
    expect(envelopeAt(4, 0)).toBe(1);
  });

  it('decays strictly monotonically over time', () => {
    let previous = envelopeAt(4, 0);
    for (const t of [0.5, 1, 2, 4, 8, 16]) {
      const value = envelopeAt(4, t);
      expect(value).toBeLessThan(previous);
      expect(value).toBeGreaterThanOrEqual(0);
      previous = value;
    }
  });

  it('longer decay keeps more energy at the same moment', () => {
    expect(envelopeAt(8, 2)).toBeGreaterThan(envelopeAt(2, 2));
  });
});

describe('computeInterference', () => {
  const a = makeSource({ position: { x: 0, y: 0, z: 0 }, hz: 220 });
  const b = makeSource({ position: { x: 10, y: 0, z: 0 }, hz: 330 });

  it('is deterministic for identical inputs', () => {
    const event = makeEvent();
    expect(computeInterference(a, b, event)).toEqual(computeInterference(a, b, event));
  });

  it('produces a serializable descriptor (JSON round-trips)', () => {
    const d = computeInterference(a, b, makeEvent());
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });

  it('centers between the sources and orients along their axis, normalized', () => {
    const d = computeInterference(a, b, makeEvent());
    expect(d.center).toEqual({ x: 5, y: 0, z: 0 });
    expect(d.axis.x).toBeCloseTo(1);
    expect(d.axis.y).toBeCloseTo(0);
    expect(d.axis.z).toBeCloseTo(0);
    expect(d.extent).toBeCloseTo(10);
  });

  it('falls back to a stable default axis for coincident sources', () => {
    const d = computeInterference(a, makeSource({ position: { x: 0, y: 0, z: 0 } }), makeEvent());
    const length = Math.hypot(d.axis.x, d.axis.y, d.axis.z);
    expect(length).toBeCloseTo(1);
  });

  it('maps consonance to coherence and dissonance to warp, clamped to 0..1', () => {
    const consonant = computeInterference(a, b, makeEvent({ consonance: 0.95, dissonance: 0.05 }));
    const dissonant = computeInterference(a, b, makeEvent({ consonance: 0.2, dissonance: 0.8 }));
    expect(consonant.coherence).toBeGreaterThan(dissonant.coherence);
    expect(dissonant.warp).toBeGreaterThan(consonant.warp);
    const wild = computeInterference(a, b, makeEvent({ consonance: 7, dissonance: -3 }));
    expect(wild.coherence).toBeLessThanOrEqual(1);
    expect(wild.warp).toBeGreaterThanOrEqual(0);
  });

  it('takes ring spacing from the sources, not the event defaults', () => {
    const lowPair = computeInterference(
      makeSource({ hz: 110 }),
      makeSource({ position: { x: 10, y: 0, z: 0 }, hz: 110 }),
      makeEvent(),
    );
    const highPair = computeInterference(
      makeSource({ hz: 880 }),
      makeSource({ position: { x: 10, y: 0, z: 0 }, hz: 880 }),
      makeEvent(),
    );
    expect(lowPair.ringSpacing).toBeGreaterThan(highPair.ringSpacing);
  });

  it('derives intensity from strength and decay from persistence', () => {
    const weak = computeInterference(a, b, makeEvent({ strength: 0.1, persistence: 0 }));
    const strong = computeInterference(a, b, makeEvent({ strength: 0.9, persistence: 1 }));
    expect(strong.intensity).toBeGreaterThan(weak.intensity);
    expect(strong.decaySeconds).toBeGreaterThan(weak.decaySeconds);
    expect(weak.decaySeconds).toBeGreaterThan(0);
  });

  it('caps beat wobble so dissonant pairs cannot strobe (§23)', () => {
    const d = computeInterference(
      makeSource({ hz: 220 }),
      makeSource({ position: { x: 10, y: 0, z: 0 }, hz: 700 }),
      makeEvent(),
    );
    expect(d.beatWobbleHz).toBeLessThanOrEqual(INTERFERENCE_CONFIG.maxBeatWobbleHz);
    expect(d.beatWobbleHz).toBeGreaterThan(0);
  });

  it('carries the classification and event identity through', () => {
    const d = computeInterference(a, b, makeEvent({ id: 'evt-9', classification: 'cancellation' }));
    expect(d.id).toBe('evt-9');
    expect(d.classification).toBe('cancellation');
    expect(d.seed).toContain('evt-9');
  });
});
