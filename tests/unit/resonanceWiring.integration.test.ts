import { describe, expect, it } from 'vitest';
import { ResonanceAudio } from '../../src/audio/ResonanceAudio';
import { createEventBus } from '../../src/core/EventBus';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import { InterferenceVisuals } from '../../src/rendering/InterferenceVisuals';
import { ResonanceEngine, type ResonanceEvents } from '../../src/resonance/ResonanceEngine';
import type { ResonanceEvent } from '../../src/resonance/ResonanceEvent';
import { createInitialWorldState } from '../../src/world/WorldState';
import { asContext, asOutput, FakeAudioContext, FakeNode, FakeOscillatorNode } from './audioFakes';

/** Oscillator whose scheduled stop does NOT fire onended synchronously (real Web Audio behavior). */
class DeferredOscillatorNode extends FakeOscillatorNode {
  override stop(when = 0): void {
    this.stopCalls += 1;
    this.stopTimes.push(when);
  }
}

class DeferredAudioContext extends FakeAudioContext {
  override createOscillator(): DeferredOscillatorNode {
    const node = new DeferredOscillatorNode();
    this.createdOscillators.push(node);
    return node;
  }
}

/**
 * Integration (P5, spec §8, §15): the ResonanceEngine emits ONE immutable
 * event on the shared bus, and BOTH ResonanceAudio and InterferenceVisuals
 * react to that same instance — exactly as Game wires them.
 */
describe('resonance wiring integration (one shared event, P5)', () => {
  function setup() {
    const bus = createEventBus<ResonanceEvents>();
    const world = createInitialWorldState('wiring-test-seed');
    const fake = new DeferredAudioContext();
    const audio = new ResonanceAudio(asContext(fake), asOutput(new FakeNode()), bus);
    const visuals = new InterferenceVisuals('wiring-test');
    const frequency = createInitialFrequencyState();
    const target = world.resonators[0]!;
    // Player sits on the first resonator at full wind: guaranteed engagement.
    frequency.position = { ...target.position };
    frequency.amplitude = 0.8;
    const detach = visuals.subscribe(bus, (event) => {
      const resonator = world.resonators.find((r) => r.id === event.targetId);
      return resonator ? { source: frequency.position, target: resonator.position } : null;
    });
    const engine = new ResonanceEngine(bus);
    return { bus, world, audio, visuals, frequency, engine, detach };
  }

  it('one engine tick drives audio and visuals from the same event instance', () => {
    const { bus, world, audio, visuals, frequency, engine, detach } = setup();
    const received: ResonanceEvent[] = [];
    bus.on('resonance:event', (event) => received.push(event));

    engine.tick(0, frequency, world.resonators);

    expect(received).toHaveLength(1);
    expect(engine.history[0]).toBe(received[0]); // same immutable instance
    expect(Object.isFrozen(received[0])).toBe(true);
    expect(audio.activeVoiceCount).toBe(1);
    expect(visuals.activeCount).toBe(1);

    detach();
    audio.dispose();
    visuals.dispose();
  });

  it('unsubscribed visuals no longer react while audio still does', () => {
    const { world, audio, visuals, frequency, engine, detach } = setup();
    detach();
    engine.tick(0, frequency, world.resonators);
    expect(audio.activeVoiceCount).toBe(1);
    expect(visuals.activeCount).toBe(0);
    audio.dispose();
    visuals.dispose();
  });
});
