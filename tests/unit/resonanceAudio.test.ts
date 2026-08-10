import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/core/EventBus';
import { createRng } from '../../src/core/rng';
import {
  MAX_RESPONSE_VOICES,
  ResonanceAudio,
  type ResonanceAudioEvents,
  type ResonanceEvent,
} from '../../src/audio/ResonanceAudio';
import { createInitialResonators, SPAWN_POSITION } from '../../src/world/resonators';
import {
  asContext,
  asOutput,
  FakeAudioContext,
  FakeAudioParam,
  FakeNode,
  FakeOscillatorNode,
} from './audioFakes';

/** Oscillator whose scheduled stop does NOT fire onended synchronously (real Web Audio behavior). */
class DeferredOscillatorNode extends FakeOscillatorNode {
  override stop(when = 0): void {
    this.stopCalls += 1;
    this.stopTimes.push(when);
  }

  /** Test hook: simulate the oscillator actually reaching its stop time. */
  end(): void {
    this.onended?.();
  }
}

class FakeBiquadFilterNode extends FakeNode {
  type = 'lowpass';
  frequency = new FakeAudioParam(350);
  Q = new FakeAudioParam(1);
}

class TestAudioContext extends FakeAudioContext {
  createdBiquads: FakeBiquadFilterNode[] = [];

  override createOscillator(): DeferredOscillatorNode {
    const node = new DeferredOscillatorNode();
    this.createdOscillators.push(node);
    return node;
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    const node = new FakeBiquadFilterNode();
    this.createdBiquads.push(node);
    return node;
  }
}

function makeEvent(overrides: Partial<ResonanceEvent> = {}): ResonanceEvent {
  return {
    id: 'ev-1',
    atMs: 0,
    sourceId: 'player',
    targetId: 'resonator-first',
    sourceHz: 330,
    targetHz: 330,
    ratio: 1,
    consonance: 1,
    dissonance: 0,
    amplitude: 0.5,
    velocity: 1,
    phaseDifference: 0,
    sourceWaveform: 'sine',
    targetWaveform: 'sine',
    strength: 0.8,
    persistence: 0,
    classification: 'harmonic',
    ...overrides,
  };
}

function setup() {
  const fake = new TestAudioContext();
  const output = new FakeNode();
  const bus = createEventBus<ResonanceAudioEvents>();
  const audio = new ResonanceAudio(asContext(fake), asOutput(output), bus);
  return { fake, output, bus, audio };
}

describe('createInitialResonators', () => {
  const rng = () => createRng('test-seed');

  it('returns seven resonators with distinct id, hz and position (spec §7)', () => {
    const resonators = createInitialResonators(rng());
    expect(resonators).toHaveLength(7);
    expect(new Set(resonators.map((r) => r.id)).size).toBe(7);
    expect(new Set(resonators.map((r) => r.baseHz)).size).toBe(7);
    expect(new Set(resonators.map((r) => r.waveform)).size).toBeGreaterThanOrEqual(4);
    const positionKeys = resonators.map((r) => `${r.position.x},${r.position.y},${r.position.z}`);
    expect(new Set(positionKeys).size).toBe(7);
    for (const r of resonators) {
      expect(r.baseHz).toBeGreaterThan(0);
      expect(r.amplitude).toBeGreaterThan(0);
      expect(r.amplitude).toBeLessThanOrEqual(1);
      expect(r.interactionRadius).toBeGreaterThan(0);
      expect(r.audibleRadius).toBeGreaterThan(r.interactionRadius);
      expect(r.persistenceThreshold).toBeGreaterThan(0);
      expect(r.materialProfile).not.toBe('');
      expect(r.active).toBe(true);
    }
  });

  it('leads with the first resonator and spans low/mid/high register', () => {
    const resonators = createInitialResonators(rng());
    expect(resonators[0]!.id).toBe('resonator-first');
    const sorted = [...resonators].sort((a, b) => a.baseHz - b.baseHz);
    expect(sorted[0]!.baseHz).toBeLessThan(160); // low mass register (§3.1)
    expect(sorted[sorted.length - 1]!.baseHz).toBeGreaterThan(600); // detail register
  });

  // §32: every world is in its own key, so two flights never start from the
  // same harmonic material.
  it('puts each seed in its own key, in tune with itself', () => {
    const a = createInitialResonators(createRng('world-a'));
    const b = createInitialResonators(createRng('world-b'));
    expect(a[0]!.baseHz).not.toBe(b[0]!.baseHz);
    // Within one world every voice is a whole-number ratio of the key.
    const key = a.find((r) => r.id === 'resonator-deep')!.baseHz;
    for (const resonator of a) {
      const ratio = resonator.baseHz / key;
      expect(Math.abs(ratio - Math.round(ratio * 2) / 2)).toBeLessThan(1e-9);
    }
  });

  it('gives the low resonator a larger interactionRadius and elevates the high one', () => {
    const [first, deep, high] = createInitialResonators(rng());
    expect(deep!.interactionRadius).toBeGreaterThan(first!.interactionRadius);
    expect(high!.position.y).toBeGreaterThan(first!.position.y + 10);
  });

  it('is deterministic for the same seed and varies across seeds', () => {
    expect(createInitialResonators(createRng('a'))).toEqual(createInitialResonators(createRng('a')));
    expect(createInitialResonators(createRng('a'))).not.toEqual(
      createInitialResonators(createRng('b')),
    );
  });

  it('at spawn, one resonator is clearly louder than the others (§20 M2 spatial curiosity)', () => {
    // Perceived level ≈ amplitude * refDistance / distance (SpatialAudio inverse model, ref 5).
    const resonators = createInitialResonators(rng());
    const levels = resonators
      .map((r) => {
        const dx = r.position.x - SPAWN_POSITION.x;
        const dy = r.position.y - SPAWN_POSITION.y;
        const dz = r.position.z - SPAWN_POSITION.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return (r.amplitude * 5) / distance;
      })
      .sort((a, b) => b - a);
    expect(levels[0]! / levels[1]!).toBeGreaterThanOrEqual(2.0);
    expect(levels[0]! / levels[2]!).toBeGreaterThanOrEqual(2.0);
  });
});

describe('ResonanceAudio', () => {
  it('harmonic event fades in an overtone at a ratio-related multiple of targetHz', () => {
    const { fake, bus } = setup();
    bus.emit('resonance:event', makeEvent({ classification: 'harmonic', ratio: 1.5 }));
    expect(fake.createdOscillators.length).toBeGreaterThanOrEqual(1);
    const overtone = fake.createdOscillators.find(
      (osc) => osc.frequency.value > 330 && osc.frequency.value % 330 === 0,
    );
    expect(overtone).toBeDefined();
    expect(overtone!.startCalls).toBe(1);
  });

  it('amplification event produces a warm swell (gain rises via ramp from 0)', () => {
    const { fake, bus, audio } = setup();
    bus.emit('resonance:event', makeEvent({ classification: 'amplification' }));
    expect(audio.activeVoiceCount).toBe(1);
    const voiceGain = fake.createdGains[0]!;
    expect(voiceGain.gain.value).toBe(0); // starts silent
    const rampUp = voiceGain.gain.calls.find(
      (c) => c.method === 'setTargetAtTime' && c.value > 0,
    );
    expect(rampUp).toBeDefined();
  });

  it('dissonant event creates a gain LFO at the |Δf| beat rate', () => {
    const { fake, bus } = setup();
    bus.emit(
      'resonance:event',
      makeEvent({ classification: 'dissonant', sourceHz: 336, targetHz: 330, dissonance: 0.8 }),
    );
    const lfo = fake.createdOscillators.find((osc) => osc.frequency.value === 6);
    expect(lfo).toBeDefined();
    expect(lfo!.startCalls).toBe(1);
    // The LFO must be routed into a gain parameter chain (amplitude modulation).
    expect(lfo!.connections.length).toBeGreaterThan(0);
  });

  it('clamps extreme beat rates to an audible tremolo range', () => {
    const { fake, bus } = setup();
    bus.emit(
      'resonance:event',
      makeEvent({ classification: 'dissonant', sourceHz: 800, targetHz: 330 }),
    );
    const lfoRates = fake.createdOscillators.map((o) => o.frequency.value).filter((f) => f < 20);
    expect(lfoRates.length).toBe(1);
    expect(lfoRates[0]!).toBeLessThanOrEqual(16);
    expect(lfoRates[0]!).toBeGreaterThanOrEqual(0.5);
  });

  it('cancellation event inserts a notch filter at targetHz and dips then recovers', () => {
    const { fake, bus } = setup();
    bus.emit('resonance:event', makeEvent({ classification: 'cancellation', targetHz: 330 }));
    const notch = fake.createdBiquads.find((b) => b.type === 'notch');
    expect(notch).toBeDefined();
    expect(notch!.frequency!.value).toBe(330);
    const gainCalls = fake.createdGains[0]!.gain.calls;
    expect(gainCalls.some((c) => c.method === 'linearRampToValueAtTime')).toBe(true);
  });

  it('complex event creates a filtered shimmer (bandpass + modulation)', () => {
    const { fake, bus } = setup();
    bus.emit('resonance:event', makeEvent({ classification: 'complex' }));
    const bandpass = fake.createdBiquads.find((b) => b.type === 'bandpass');
    expect(bandpass).toBeDefined();
    expect(fake.createdOscillators.length).toBeGreaterThanOrEqual(2); // carrier + shimmer LFO
  });

  it('only uses ramped parameter changes after node creation (no clicks)', () => {
    const { fake, bus } = setup();
    for (const classification of [
      'harmonic',
      'dissonant',
      'cancellation',
      'complex',
    ] as const) {
      bus.emit('resonance:event', makeEvent({ classification }));
    }
    for (const gain of fake.createdGains) {
      if (gain.gain.calls.length === 0) continue; // static depth gains are set pre-connection
      // Every scheduled change is a ramp method; FakeAudioParam only records ramps,
      // so any audible change without a recorded call would leave value !== 0 by assignment.
      for (const call of gain.gain.calls) {
        expect(['setTargetAtTime', 'linearRampToValueAtTime', 'setValueAtTime']).toContain(
          call.method,
        );
      }
    }
  });

  it('bounds concurrent voices to MAX_RESPONSE_VOICES and steals the oldest', () => {
    const { fake, bus, audio } = setup();
    const total = MAX_RESPONSE_VOICES + 2;
    for (let i = 0; i < total; i++) {
      bus.emit('resonance:event', makeEvent({ id: `ev-${i}` }));
    }
    expect(audio.activeVoiceCount).toBe(MAX_RESPONSE_VOICES);
    // The two oldest voices must have had their oscillators stopped (stolen).
    const stopped = fake.createdOscillators.filter((o) => o.stopCalls > 0);
    expect(stopped.length).toBeGreaterThanOrEqual(2);
  });

  it('cleans up a voice when its oscillator ends', () => {
    const { fake, bus, audio } = setup();
    bus.emit('resonance:event', makeEvent());
    expect(audio.activeVoiceCount).toBe(1);
    for (const osc of fake.createdOscillators) (osc as DeferredOscillatorNode).end();
    expect(audio.activeVoiceCount).toBe(0);
    for (const gain of fake.createdGains) expect(gain.disconnectCalls).toBeGreaterThan(0);
  });

  it('dispose unsubscribes and disconnects everything', () => {
    const { fake, bus, audio } = setup();
    bus.emit('resonance:event', makeEvent());
    const createdBefore = fake.createdOscillators.length;
    audio.dispose();
    expect(audio.activeVoiceCount).toBe(0);
    for (const osc of fake.createdOscillators) expect(osc.disconnectCalls).toBeGreaterThan(0);
    for (const gain of fake.createdGains) expect(gain.disconnectCalls).toBeGreaterThan(0);
    bus.emit('resonance:event', makeEvent({ id: 'after-dispose' }));
    expect(fake.createdOscillators.length).toBe(createdBefore); // no new voices after dispose
  });
});
