import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import { StructureRenderer } from '../../src/rendering/StructureRenderer';
import { ResonanceEngine, type ResonanceEvents } from '../../src/resonance/ResonanceEngine';
import type { ResonanceEvent } from '../../src/resonance/ResonanceEvent';
import {
  FormEmergence,
  type StructureEvents,
  type StructuresSlice,
} from '../../src/world/FormEmergence';
import { createInitialWorldState } from '../../src/world/WorldState';

const LOGIC_STEP_MS = 100;

/**
 * Integration (spec §20 M3, §25.19): sustained resonance flows
 * ResonanceEngine → collected events → FormEmergence → structure bus →
 * StructureRenderer mesh — exactly as Game wires the pipeline.
 */
describe('structure wiring integration (M3 form emergence)', () => {
  function setup() {
    const resonanceBus = createEventBus<ResonanceEvents>();
    const structureBus = createEventBus<StructureEvents>();
    const world = createInitialWorldState('structure-wiring-seed');
    const structuresStore = createStore<StructuresSlice>({ structures: [] });
    const engine = new ResonanceEngine(resonanceBus);
    const formEmergence = new FormEmergence(structureBus, structuresStore, 'structure-wiring-seed');
    const renderer = new StructureRenderer();
    const detachRenderer = renderer.subscribe(structureBus);

    // Game collects each emitted event and hands the batch to FormEmergence.
    const pending: ResonanceEvent[] = [];
    const detachCollector = resonanceBus.on('resonance:event', (event) => pending.push(event));

    const frequency = createInitialFrequencyState();
    const target = world.resonators[0]!;
    frequency.position = { ...target.position };
    frequency.hz = target.baseHz; // consonant: stable form
    frequency.amplitude = 0.8;

    const step = (nowMs: number): void => {
      engine.tick(nowMs, frequency, world.resonators);
      formEmergence.tick(nowMs, pending, world.resonators);
      pending.length = 0;
    };

    return { world, target, frequency, renderer, structuresStore, step, detachRenderer, detachCollector };
  }

  it('sustained resonance produces a persistent renderer mesh from store-backed data', () => {
    const { target, renderer, structuresStore, step, detachRenderer, detachCollector } = setup();

    // Sustain past the resonator's persistence threshold (seconds → ms).
    const sustainMs = (target.persistenceThreshold + 1) * 1000;
    for (let nowMs = 0; nowMs <= sustainMs; nowMs += LOGIC_STEP_MS) step(nowMs);

    const structures = structuresStore.getState().structures;
    expect(structures).toHaveLength(1);
    const structure = structures[0]!;
    expect(structure.sourceResonatorId).toBe(target.id);
    expect(renderer.count).toBe(1);
    expect(renderer.has(structure.id)).toBe(true);
    expect(renderer.group.children).toHaveLength(1);

    // Continued resonance grows the structure; the renderer tracks the update.
    for (let nowMs = sustainMs; nowMs <= sustainMs + 2000; nowMs += LOGIC_STEP_MS) step(nowMs);
    const grown = structuresStore.getState().structures[0]!;
    expect(grown.persistence).toBeGreaterThan(structure.persistence);
    expect(renderer.count).toBe(1);

    detachRenderer();
    detachCollector();
    renderer.dispose();
    expect(renderer.group.children).toHaveLength(0);
  });

  it('detached renderer no longer reacts to structure events', () => {
    const { target, renderer, structuresStore, step, detachRenderer, detachCollector } = setup();
    detachRenderer();

    const sustainMs = (target.persistenceThreshold + 1) * 1000;
    for (let nowMs = 0; nowMs <= sustainMs; nowMs += LOGIC_STEP_MS) step(nowMs);

    expect(structuresStore.getState().structures).toHaveLength(1);
    expect(renderer.count).toBe(0);

    detachCollector();
    renderer.dispose();
  });
});
