import { createInitialTrackState } from '../../src/music/TrackState';
import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/core/EventBus';
import { createRng } from '../../src/core/rng';
import { createStore } from '../../src/core/stores';
import { createInitialMusicState } from '../../src/music/MusicState';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import { SaveManager, type StorageLike } from '../../src/persistence/SaveManager';
import type { SerializableWorld } from '../../src/persistence/WorldSerializer';
import { buildStructureGeometry } from '../../src/rendering/structureGeometry';
import type { ResonanceEvent } from '../../src/resonance/ResonanceEvent';
import {
  FormEmergence,
  type StructureEvents,
  type StructuresSlice,
} from '../../src/world/FormEmergence';
import { createResonator, type ResonatorData } from '../../src/world/Resonator';

const WORLD_SEED = 'roundtrip-seed';

function makeResonator(id: string, x: number): ResonatorData {
  return createResonator({
    id,
    position: { x, y: 0, z: 0 },
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

function makeEvent(overrides: Partial<ResonanceEvent>): ResonanceEvent {
  return {
    id: 'event',
    atMs: 0,
    sourceId: 'player',
    targetId: 'res-a',
    sourceHz: 110,
    targetHz: 330,
    ratio: 3,
    consonance: 0.9,
    dissonance: 0.05,
    amplitude: 0.7,
    velocity: 0,
    phaseDifference: 0,
    sourceWaveform: 'sine',
    targetWaveform: 'sine',
    strength: 0.5,
    persistence: 2,
    classification: 'harmonic',
    ...overrides,
  };
}

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** Run real FormEmergence output through spawn + growth ticks. */
function emergeStructures() {
  const bus = createEventBus<StructureEvents>();
  const store = createStore<StructuresSlice>({ structures: [] });
  const resonators = [makeResonator('res-a', 10), makeResonator('res-b', -30)];
  const emergence = new FormEmergence(bus, store, WORLD_SEED);
  // Consonant low tone on res-a → massive stable form; dissonant high tone
  // on res-b → fine unstable form (§3.1, §3.6).
  emergence.tick(0, [makeEvent({ targetId: 'res-a' })], resonators);
  emergence.tick(
    100,
    [
      makeEvent({ targetId: 'res-a', persistence: 2.1 }),
      makeEvent({
        targetId: 'res-b',
        sourceHz: 5000,
        sourceWaveform: 'saw',
        consonance: 0.1,
        dissonance: 0.9,
        classification: 'dissonant',
        persistence: 2,
      }),
    ],
    resonators,
  );
  emergence.tick(200, [], resonators);
  return store.getState().structures;
}

/**
 * Spec §18 goal — reload save → reconstruct world — plus §25.16 seeded
 * reproducibility: the actual FormEmergence output survives save → load
 * byte-for-byte, and the loaded data rebuilds identical geometry.
 */
describe('persistence round trip (FormEmergence → save → load → geometry)', () => {
  it('round-trips real FormEmergence structures without loss', () => {
    const structures = emergeStructures();
    expect(structures.length).toBe(2);

    const world: SerializableWorld = {
      seed: WORLD_SEED,
      frequencyState: createInitialFrequencyState(),
      musicState: createInitialMusicState(),
      resonators: [],
      structures: [...structures],
      genreHistory: [],
      progression: { controlsRevealed: 0, resonanceClassesSeen: [], structuresCreated: 0, permanentStructures: 0, genresSeen: [], playerResonatorsCreated: 0 },
    trackState: createInitialTrackState(),
    };

    const manager = new SaveManager(memoryStorage(), () => 1_000);
    expect(manager.save(world)).toEqual({ ok: true });
    const loaded = manager.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.structures).toEqual(structures);
  });

  it('rebuilds deterministically identical geometry from a loaded save', () => {
    const structures = emergeStructures();
    const world: SerializableWorld = {
      seed: WORLD_SEED,
      frequencyState: createInitialFrequencyState(),
      musicState: createInitialMusicState(),
      resonators: [],
      structures: [...structures],
      genreHistory: [],
      progression: { controlsRevealed: 0, resonanceClassesSeen: [], structuresCreated: 0, permanentStructures: 0, genresSeen: [], playerResonatorsCreated: 0 },
    trackState: createInitialTrackState(),
    };
    const manager = new SaveManager(memoryStorage(), () => 1_000);
    manager.save(world);
    const loaded = manager.load()!;

    for (let i = 0; i < structures.length; i++) {
      const original = structures[i]!;
      const restored = loaded.structures[i]!;
      expect(restored.seed).toBe(original.seed);
      expect(restored.waveform).toBe(original.waveform);
      const before = buildStructureGeometry(original, createRng(original.seed));
      const after = buildStructureGeometry(restored, createRng(restored.seed));
      const a = before.getAttribute('position')!.array as Float32Array;
      const b = after.getAttribute('position')!.array as Float32Array;
      expect(b.length).toBe(a.length);
      expect(Array.from(b)).toEqual(Array.from(a));
      before.dispose();
      after.dispose();
    }
  });
});
