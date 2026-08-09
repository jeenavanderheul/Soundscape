import { describe, expect, it } from 'vitest';
import {
  createEventIdCounter,
  createResonanceEvent,
  ResonanceEventFields,
} from '../../src/resonance/ResonanceEvent';

const fields: ResonanceEventFields = {
  atMs: 1234,
  sourceId: 'player',
  targetId: 'resonator-first',
  sourceHz: 220,
  targetHz: 330,
  ratio: 1.5,
  consonance: 0.9,
  dissonance: 0.05,
  amplitude: 0.7,
  velocity: 3.2,
  phaseDifference: 0.4,
  sourceWaveform: 'sine',
  targetWaveform: 'triangle',
  strength: 0.6,
  persistence: 0,
  classification: 'harmonic',
};

describe('createResonanceEvent', () => {
  it('produces a frozen, immutable event (P5)', () => {
    const event = createResonanceEvent(fields, createEventIdCounter());
    expect(Object.isFrozen(event)).toBe(true);
    expect(() => {
      (event as { strength: number }).strength = 9;
    }).toThrowError();
    expect(event.strength).toBe(0.6);
  });

  it('carries all §8 fields plus the generated id', () => {
    const event = createResonanceEvent(fields, createEventIdCounter());
    expect(event).toEqual({ id: event.id, ...fields });
  });

  it('does not alias the input fields object', () => {
    const input = { ...fields };
    const event = createResonanceEvent(input, createEventIdCounter());
    input.strength = 999;
    expect(event.strength).toBe(0.6);
  });
});

describe('createEventIdCounter', () => {
  it('is deterministic and sequential — no Date.now, no Math.random', () => {
    const a = createEventIdCounter();
    const b = createEventIdCounter();
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('supports a custom prefix', () => {
    const next = createEventIdCounter('rx');
    expect(next()).toMatch(/^rx/);
  });
});
