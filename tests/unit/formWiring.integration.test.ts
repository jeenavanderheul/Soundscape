import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import { StructureRenderer } from '../../src/rendering/StructureRenderer';
import { ResonanceEngine, type ResonanceEvents } from '../../src/resonance/ResonanceEngine';
import type { ResonanceEvent } from '../../src/resonance/ResonanceEvent';
import { FormEmergence, type StructureEvents } from '../../src/world/FormEmergence';
import { createInitialWorldState, type WorldState } from '../../src/world/WorldState';

type BusEvents = ResonanceEvents & StructureEvents;

const STEP_MS = 100;

/**
 * Integration (M3 gate, §20): sustained resonance flows engine → bus →
 * FormEmergence → world store AND StructureRenderer — the exact wiring Game
 * uses, so the player's sound visibly causes the object (P5).
 */
describe('form emergence wiring integration (sound → persistent form)', () => {
  function setup() {
    const bus = createEventBus<BusEvents>();
    const store = createStore<WorldState>(createInitialWorldState('form-wiring-seed'));
    const engine = new ResonanceEngine(bus);
    const form = new FormEmergence(bus, store, 'form-wiring-seed');
    const renderer = new StructureRenderer();
    const detach = renderer.subscribe(bus);
    // Game buffers bus events between logic steps and drains them into tick().
    const pending: ResonanceEvent[] = [];
    bus.on('resonance:event', (event) => pending.push(event));
    return { store, engine, form, renderer, detach, pending };
  }

  it('sustained resonance spawns a structure in the store and a mesh in the renderer', () => {
    const { store, engine, form, renderer, detach, pending } = setup();
    const target = store.getState().resonators[0]!;
    const frequency = createInitialFrequencyState();
    frequency.position = { ...target.position };
    frequency.amplitude = 0.8;
    frequency.hz = target.baseHz; // consonant: stable form

    const steps = Math.ceil((target.persistenceThreshold * 1000) / STEP_MS) + 2;
    for (let i = 0; i <= steps; i++) {
      const nowMs = i * STEP_MS;
      engine.tick(nowMs, frequency, store.getState().resonators);
      form.tick(nowMs, pending, store.getState().resonators);
      pending.length = 0;
    }

    const structures = store.getState().structures;
    expect(structures).toHaveLength(1);
    expect(structures[0]!.sourceResonatorId).toBe(target.id);
    expect(structures[0]!.hz).toBe(target.baseHz);
    expect(renderer.count).toBe(1);
    expect(renderer.has(structures[0]!.id)).toBe(true);

    detach();
    renderer.dispose();
  });
});
