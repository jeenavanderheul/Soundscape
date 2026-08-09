import { describe, expect, it } from 'vitest';
import type { ResonanceEvent } from '../../src/resonance/InterferenceField';
import { InterferenceVisuals, VISUAL_CONFIG } from '../../src/rendering/InterferenceVisuals';

function makeEvent(overrides: Partial<ResonanceEvent> = {}): ResonanceEvent {
  return {
    id: `evt-${Math.random()}`,
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
    persistence: 0.3,
    classification: 'harmonic',
    ...overrides,
  };
}

const A = { x: 0, y: 0, z: 0 };
const B = { x: 10, y: 0, z: 0 };

describe('InterferenceVisuals', () => {
  it('spawns one pattern per resonance event', () => {
    const visuals = new InterferenceVisuals();
    expect(visuals.activeCount).toBe(0);
    visuals.handleResonance(makeEvent(), A, B);
    expect(visuals.activeCount).toBe(1);
    visuals.dispose();
  });

  it('expires patterns back to the pool after their envelope decays', () => {
    const visuals = new InterferenceVisuals();
    visuals.handleResonance(makeEvent({ persistence: 0 }), A, B);
    for (let i = 0; i < 600; i++) visuals.update(0.1);
    expect(visuals.activeCount).toBe(0);
    visuals.dispose();
  });

  it('never exceeds the preallocated pool and never grows the geometry', () => {
    const visuals = new InterferenceVisuals();
    const vertexCount = visuals.lines.geometry.getAttribute('position').count;
    for (let i = 0; i < VISUAL_CONFIG.maxPatterns + 5; i++) {
      visuals.handleResonance(makeEvent({ id: `evt-${i}` }), A, B);
    }
    expect(visuals.activeCount).toBe(VISUAL_CONFIG.maxPatterns);
    expect(visuals.lines.geometry.getAttribute('position').count).toBe(vertexCount);
    visuals.dispose();
  });

  it('unsubscribes and stops reacting after the returned detach runs', () => {
    const visuals = new InterferenceVisuals();
    const handlers = new Map<string, (e: ResonanceEvent) => void>();
    const bus = {
      on(event: string, handler: (e: ResonanceEvent) => void) {
        handlers.set(event, handler);
        return () => handlers.delete(event);
      },
    };
    const detach = visuals.subscribe(bus, () => ({ source: A, target: B }));
    handlers.get('resonance:event')?.(makeEvent());
    expect(visuals.activeCount).toBe(1);
    detach();
    expect(handlers.size).toBe(0);
    visuals.dispose();
  });

  it('ramps intensity smoothly instead of appearing at full brightness (§23)', () => {
    const visuals = new InterferenceVisuals();
    visuals.handleResonance(makeEvent({ strength: 1 }), A, B);
    visuals.update(0.016);
    const colors = visuals.lines.geometry.getAttribute('color').array as Float32Array;
    const early = Math.max(...colors);
    visuals.update(VISUAL_CONFIG.attackSeconds);
    const settled = Math.max(
      ...(visuals.lines.geometry.getAttribute('color').array as Float32Array),
    );
    expect(early).toBeLessThan(settled);
    visuals.dispose();
  });

  it('writes deterministic geometry for the same event and timeline', () => {
    const run = (): Float32Array => {
      const visuals = new InterferenceVisuals('seed-x');
      visuals.handleResonance(makeEvent({ id: 'evt-fixed', classification: 'dissonant' }), A, B);
      visuals.update(0.2);
      const snapshot = Float32Array.from(
        visuals.lines.geometry.getAttribute('position').array as Float32Array,
      );
      visuals.dispose();
      return snapshot;
    };
    expect(run()).toEqual(run());
  });
});
