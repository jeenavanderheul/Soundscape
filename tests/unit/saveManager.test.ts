import { createInitialTrackState } from '../../src/music/TrackState';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../src/core/rng';
import { createInitialMusicState } from '../../src/music/MusicState';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import {
  PREV_KEY,
  PRIMARY_KEY,
  SaveManager,
  type StorageLike,
} from '../../src/persistence/SaveManager';
import { serialize, type SerializableWorld } from '../../src/persistence/WorldSerializer';
import { createInitialResonators } from '../../src/world/resonators';

function sampleWorld(seed = 'seed-a'): SerializableWorld {
  return {
    seed,
    frequencyState: createInitialFrequencyState(),
    musicState: createInitialMusicState(),
    resonators: createInitialResonators(createRng(seed)),
    structures: [],
    progression: { controlsRevealed: 0, resonanceClassesSeen: [], structuresCreated: 0, permanentStructures: 0, genresSeen: [], playerResonatorsCreated: 0 },
    trackState: createInitialTrackState(),
    genreHistory: [],
  };
}

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('SaveManager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('save then load roundtrips the world state', () => {
    const storage = memoryStorage();
    const manager = new SaveManager(storage, () => 42_000);
    expect(manager.save(sampleWorld())).toEqual({ ok: true });
    const loaded = manager.load();
    expect(loaded).toEqual(serialize(sampleWorld(), 42_000));
  });

  it('retains the previous snapshot in the prev key on each save', () => {
    const storage = memoryStorage();
    const manager = new SaveManager(storage, () => 1);
    manager.save(sampleWorld('seed-a'));
    manager.save(sampleWorld('seed-b'));
    expect(JSON.parse(storage.map.get(PRIMARY_KEY)!).seed).toBe('seed-b');
    expect(JSON.parse(storage.map.get(PREV_KEY)!).seed).toBe('seed-a');
  });

  it('returns null when nothing is saved', () => {
    const manager = new SaveManager(memoryStorage(), () => 0);
    expect(manager.load()).toBeNull();
  });

  it('falls back to the prev snapshot when the primary is malformed JSON', () => {
    const storage = memoryStorage();
    const manager = new SaveManager(storage, () => 7);
    manager.save(sampleWorld('seed-old'));
    manager.save(sampleWorld('seed-new'));
    storage.map.set(PRIMARY_KEY, '{corrupt!!!');
    const loaded = manager.load();
    expect(loaded?.seed).toBe('seed-old');
  });

  it('falls back to prev when the primary fails validation', () => {
    const storage = memoryStorage();
    const manager = new SaveManager(storage, () => 7);
    manager.save(sampleWorld('seed-old'));
    manager.save(sampleWorld('seed-new'));
    storage.map.set(PRIMARY_KEY, JSON.stringify({ schemaVersion: 999 }));
    expect(manager.load()?.seed).toBe('seed-old');
  });

  it('returns null when both snapshots are unusable', () => {
    const storage = memoryStorage();
    storage.map.set(PRIMARY_KEY, 'garbage');
    storage.map.set(PREV_KEY, 'also garbage');
    const manager = new SaveManager(storage, () => 0);
    expect(manager.load()).toBeNull();
  });

  it('reset backs up the primary to prev and clears the primary', () => {
    const storage = memoryStorage();
    const manager = new SaveManager(storage, () => 5);
    manager.save(sampleWorld('seed-a'));
    expect(manager.reset()).toEqual({ ok: true });
    expect(storage.map.has(PRIMARY_KEY)).toBe(false);
    expect(JSON.parse(storage.map.get(PREV_KEY)!).seed).toBe('seed-a');
    expect(manager.load()?.seed).toBe('seed-a'); // recoverable via prev fallback
  });

  it('reset cancels a pending autosave', () => {
    const storage = memoryStorage();
    const manager = new SaveManager(storage, () => 5);
    manager.autosave(sampleWorld(), 100);
    manager.reset();
    vi.advanceTimersByTime(500);
    expect(storage.map.has(PRIMARY_KEY)).toBe(false);
  });

  it('autosave debounces: rapid calls coalesce into one write of the latest state', () => {
    const storage = memoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const manager = new SaveManager(storage, () => 9);
    manager.autosave(sampleWorld('seed-1'), 100);
    vi.advanceTimersByTime(50);
    manager.autosave(sampleWorld('seed-2'), 100);
    vi.advanceTimersByTime(50);
    manager.autosave(sampleWorld('seed-3'), 100);
    vi.advanceTimersByTime(100);
    expect(setItem).toHaveBeenCalledTimes(1); // no prior primary, so no prev write
    expect(JSON.parse(storage.map.get(PRIMARY_KEY)!).seed).toBe('seed-3');
  });

  it('returns a typed error when storage write fails (quota)', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    const manager = new SaveManager(storage, () => 0);
    const result = manager.save(sampleWorld());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('quota');
  });

  it('load returns null instead of throwing when storage reads fail', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    const manager = new SaveManager(storage, () => 0);
    expect(manager.load()).toBeNull();
  });

  it('dispose cancels a pending autosave', () => {
    const storage = memoryStorage();
    const manager = new SaveManager(storage, () => 0);
    manager.autosave(sampleWorld(), 100);
    manager.dispose();
    vi.advanceTimersByTime(500);
    expect(storage.map.has(PRIMARY_KEY)).toBe(false);
  });
});
