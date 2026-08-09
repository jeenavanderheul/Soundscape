import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import type { ResonanceEvent } from '../../src/resonance/ResonanceEvent';
import { createResonator, ResonatorData } from '../../src/world/Resonator';
import {
  FORM_EMERGENCE_CONFIG,
  FormEmergence,
  FormEmergenceConfig,
  isPermanent,
  StructureEvents,
  StructuresSlice,
} from '../../src/world/FormEmergence';
import { hzToDetail, hzToScale, StructureData } from '../../src/world/StructureData';

const TEST_CONFIG: FormEmergenceConfig = {
  ...FORM_EMERGENCE_CONFIG,
  spawnOffsetUnits: 3,
  initialScaleFraction: 0.3,
  growthRatePerSec: 0.5,
  permanenceSeconds: 10,
  persistenceFloor: 0.3,
  youngAgeMs: 30_000,
  decayPerSec: 0.5,
  permanenceThreshold: 0.85,
  unstableStabilityMax: 0.3,
  releaseStrength: 0.06,
  maxStructures: 8,
  maxTickDeltaMs: 100,
};

function makeResonator(id: string, position: { x: number; y: number; z: number }): ResonatorData {
  return createResonator({
    id,
    position,
    baseHz: 330,
    waveform: 'sine',
    amplitude: 0.5,
    interactionRadius: 6,
    audibleRadius: 160,
    persistenceThreshold: 2,
    materialProfile: 'glass',
    spatialProfile: 'omni',
    active: true,
  });
}

const resonatorA = makeResonator('res-a', { x: 10, y: 0, z: 0 });
const resonatorB = makeResonator('res-b', { x: -40, y: 0, z: 30 });
const resonatorC = makeResonator('res-c', { x: 0, y: 20, z: -50 });

function makeEvent(overrides: Partial<ResonanceEvent> = {}): ResonanceEvent {
  return {
    id: 'event-1',
    atMs: 0,
    sourceId: 'player',
    targetId: 'res-a',
    sourceHz: 110,
    targetHz: 330,
    ratio: 1.5,
    consonance: 0.9,
    dissonance: 0.05,
    amplitude: 0.7,
    velocity: 0,
    phaseDifference: 0,
    sourceWaveform: 'sine',
    targetWaveform: 'sine',
    strength: 0.5,
    persistence: 0,
    classification: 'harmonic',
    ...overrides,
  };
}

function setup(config: FormEmergenceConfig = TEST_CONFIG, seed = 'test-seed') {
  const bus = createEventBus<StructureEvents>();
  const store = createStore<StructuresSlice>({ structures: [] });
  const emergence = new FormEmergence(bus, store, seed, config);
  const log: { type: 'spawned' | 'updated' | 'removed'; structure: StructureData }[] = [];
  bus.on('structure:spawned', (s) => log.push({ type: 'spawned', structure: s }));
  bus.on('structure:updated', (s) => log.push({ type: 'updated', structure: s }));
  bus.on('structure:removed', (s) => log.push({ type: 'removed', structure: s }));
  return { bus, store, emergence, log };
}

describe('FormEmergence spawning (spec §20 M3, §3.8)', () => {
  it('does not spawn below the resonator persistenceThreshold', () => {
    const { emergence, store, log } = setup();
    emergence.tick(0, [makeEvent({ persistence: 0 })], [resonatorA]);
    emergence.tick(100, [makeEvent({ persistence: 1.9 })], [resonatorA]);
    expect(store.getState().structures).toHaveLength(0);
    expect(log).toHaveLength(0);
  });

  it('spawns a structure when sustained resonance crosses the threshold', () => {
    const { emergence, store, log } = setup();
    emergence.tick(0, [makeEvent({ persistence: 2 })], [resonatorA]);

    const structures = store.getState().structures;
    expect(structures).toHaveLength(1);
    const s = structures[0]!;
    expect(log).toEqual([{ type: 'spawned', structure: s }]);
    expect(s.sourceResonatorId).toBe('res-a');
    expect(s.createdAtMs).toBe(0);
    // Pitch = space: the player's sustained frequency shapes the form.
    expect(s.hz).toBe(110);
    expect(s.waveform).toBe('sine');
    expect(s.materialProfile).toBe('glass');
    expect(s.scale).toBeCloseTo(hzToScale(110) * TEST_CONFIG.initialScaleFraction, 10);
    expect(s.detailLevel).toBeCloseTo(hzToDetail(110), 10);
    expect(s.persistence).toBeCloseTo(2 / TEST_CONFIG.permanenceSeconds, 10);
    expect(s.seed).toContain(s.id);
    // Near the interaction site: within the deterministic offset of the resonator.
    expect(Math.abs(s.position.x - resonatorA.position.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(s.position.y - resonatorA.position.y)).toBeLessThanOrEqual(3);
    expect(Math.abs(s.position.z - resonatorA.position.z)).toBeLessThanOrEqual(3);
  });

  it('derives stability from consonance', () => {
    const { emergence, store } = setup();
    emergence.tick(0, [makeEvent({ persistence: 2, consonance: 0.9 })], [resonatorA]);
    expect(store.getState().structures[0]!.stability).toBeCloseTo(0.9, 10);
  });

  it('caps stability for dissonant sustained resonance (unstable form)', () => {
    const { emergence, store } = setup();
    emergence.tick(
      0,
      [
        makeEvent({
          persistence: 2,
          consonance: 0.5,
          dissonance: 0.8,
          classification: 'dissonant',
        }),
      ],
      [resonatorA],
    );
    expect(store.getState().structures[0]!.stability).toBeLessThanOrEqual(
      TEST_CONFIG.unstableStabilityMax,
    );
  });

  it('never spawns a second structure for a resonator that already has one', () => {
    const { emergence, store } = setup();
    emergence.tick(0, [makeEvent({ persistence: 2 })], [resonatorA]);
    emergence.tick(100, [makeEvent({ persistence: 3 })], [resonatorA]);
    expect(store.getState().structures).toHaveLength(1);
  });
});

describe('FormEmergence growth (spec §5: threshold bands, no unlimited growth)', () => {
  it('grows persistence and scale while resonance continues, toward hard caps', () => {
    const { emergence, store } = setup();
    emergence.tick(0, [makeEvent({ persistence: 2 })], [resonatorA]);
    const initial = store.getState().structures[0]!;

    for (let t = 100; t <= 30_000; t += 100) {
      emergence.tick(t, [], [resonatorA]);
    }
    const grown = store.getState().structures[0]!;
    expect(grown.persistence).toBeGreaterThan(initial.persistence);
    expect(grown.scale).toBeGreaterThan(initial.scale);
    expect(grown.persistence).toBeLessThanOrEqual(1);
    expect(grown.scale).toBeLessThanOrEqual(hzToScale(grown.hz));
    expect(grown.scale).toBeCloseTo(hzToScale(grown.hz), 5);
  });
});

describe('FormEmergence decay, permanence and bounds (spec §3.8, §18)', () => {
  it('removes released young structures that stay below the persistence floor', () => {
    const { emergence, store, log } = setup();
    emergence.tick(0, [makeEvent({ persistence: 2 })], [resonatorA]); // p = 0.2 < floor 0.3
    emergence.tick(100, [makeEvent({ persistence: 2.1, strength: 0.01 })], [resonatorA]);
    for (let t = 200; t <= 2000; t += 100) {
      emergence.tick(t, [], [resonatorA]);
    }
    expect(store.getState().structures).toHaveLength(0);
    expect(log.some((e) => e.type === 'removed')).toBe(true);
  });

  it('past the permanence threshold structures never decay', () => {
    const { emergence, store } = setup();
    emergence.tick(0, [makeEvent({ persistence: 2 })], [resonatorA]);
    // Sustain until persistence crosses permanenceThreshold (0.85 → ≥ 6.5 s more).
    for (let t = 100; t <= 10_000; t += 100) {
      emergence.tick(t, [], [resonatorA]);
    }
    const grown = store.getState().structures[0]!;
    expect(isPermanent(grown, TEST_CONFIG)).toBe(true);
    // Release, then a long quiet period: it must remain.
    emergence.tick(10_100, [makeEvent({ persistence: 9, strength: 0.01 })], [resonatorA]);
    for (let t = 10_200; t <= 60_000; t += 100) {
      emergence.tick(t, [], [resonatorA]);
    }
    expect(store.getState().structures).toHaveLength(1);
  });

  it('evicts the oldest non-permanent structure at the bounded count', () => {
    const config = { ...TEST_CONFIG, maxStructures: 2 };
    const resonators = [resonatorA, resonatorB, resonatorC];
    const { emergence, store, log } = setup(config);
    emergence.tick(0, [makeEvent({ persistence: 2, targetId: 'res-a' })], resonators);
    emergence.tick(100, [makeEvent({ persistence: 2, targetId: 'res-b' })], resonators);
    emergence.tick(200, [makeEvent({ persistence: 2, targetId: 'res-c' })], resonators);

    const structures = store.getState().structures;
    expect(structures).toHaveLength(2);
    expect(structures.map((s) => s.sourceResonatorId).sort()).toEqual(['res-b', 'res-c']);
    const removed = log.filter((e) => e.type === 'removed');
    expect(removed).toHaveLength(1);
    expect(removed[0]!.structure.sourceResonatorId).toBe('res-a');
  });

  it('skips new spawns when every existing structure is permanent and at the cap', () => {
    const config = { ...TEST_CONFIG, maxStructures: 1 };
    const { emergence, store } = setup(config);
    emergence.tick(0, [makeEvent({ persistence: 2, targetId: 'res-a' })], [resonatorA, resonatorB]);
    for (let t = 100; t <= 10_000; t += 100) {
      emergence.tick(t, [], [resonatorA, resonatorB]);
    }
    expect(isPermanent(store.getState().structures[0]!, config)).toBe(true);

    emergence.tick(10_100, [makeEvent({ persistence: 2, targetId: 'res-b' })], [
      resonatorA,
      resonatorB,
    ]);
    const structures = store.getState().structures;
    expect(structures).toHaveLength(1);
    expect(structures[0]!.sourceResonatorId).toBe('res-a');
  });
});

describe('FormEmergence determinism (spec §25.16: seeded randomness)', () => {
  it('produces identical structures for the same seed and inputs', () => {
    const run = () => {
      const { emergence, store } = setup(TEST_CONFIG, 'same-seed');
      emergence.tick(0, [makeEvent({ persistence: 2 })], [resonatorA]);
      emergence.tick(100, [makeEvent({ persistence: 2, targetId: 'res-b' })], [
        resonatorA,
        resonatorB,
      ]);
      for (let t = 200; t <= 1000; t += 100) {
        emergence.tick(t, [], [resonatorA, resonatorB]);
      }
      return store.getState().structures;
    };
    expect(run()).toEqual(run());
  });

  it('produces different offsets for different world seeds', () => {
    const positionFor = (seed: string) => {
      const { emergence, store } = setup(TEST_CONFIG, seed);
      emergence.tick(0, [makeEvent({ persistence: 2 })], [resonatorA]);
      return store.getState().structures[0]!.position;
    };
    expect(positionFor('seed-one')).not.toEqual(positionFor('seed-two'));
  });
});

describe('FormEmergence rehydration (spec §18: reload → reconstruct world)', () => {
  it('continues spawn counters from loaded structure ids so post-load ids never collide', () => {
    // First session: two spawns for res-a (second after the first decays away).
    const first = setup();
    first.emergence.tick(0, [makeEvent({ persistence: 2 })], [resonatorA]);
    const saved = first.store.getState().structures;
    expect(saved[0]!.id).toBe('structure-res-a-1');

    // New session hydrated from the save: counters must resume, not restart.
    const second = setup();
    second.emergence.rehydrate(saved);
    second.emergence.tick(0, [makeEvent({ persistence: 2 })], [resonatorA]);
    expect(second.store.getState().structures[0]!.id).toBe('structure-res-a-2');
  });

  it('keeps the highest count per resonator and ignores unrelated resonators', () => {
    const loaded: StructureData[] = [
      { id: 'structure-res-a-3' } as StructureData,
      { id: 'structure-res-a-1' } as StructureData,
      { id: 'structure-res-b-2' } as StructureData,
    ];
    const { emergence, store } = setup();
    emergence.rehydrate(loaded);
    emergence.tick(0, [makeEvent({ persistence: 2 })], [resonatorA]);
    emergence.tick(100, [makeEvent({ persistence: 2, targetId: 'res-c' })], [
      resonatorA,
      resonatorC,
    ]);
    const ids = store.getState().structures.map((s) => s.id);
    expect(ids).toContain('structure-res-a-4');
    expect(ids).toContain('structure-res-c-1');
  });
});
