import { createInitialTrackState } from '../../src/music/TrackState';
import { describe, expect, it } from 'vitest';
import { createInitialMusicState } from '../../src/music/MusicState';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import {
  SCHEMA_VERSION,
  serialize,
  validate,
  type SerializableWorld,
} from '../../src/persistence/WorldSerializer';
import { createInitialResonators } from '../../src/world/resonators';
import { createRng } from '../../src/core/rng';

function sampleWorld(): SerializableWorld {
  return {
    seed: 'test-seed',
    frequencyState: createInitialFrequencyState(),
    musicState: createInitialMusicState(),
    resonators: createInitialResonators(createRng('test-seed')),
    structures: [
      {
        id: 'structure-1',
        createdAtMs: 1234,
        position: { x: 1, y: 2, z: 3 },
        sourceResonatorId: 'resonator-1',
        hz: 110,
        waveform: 'sine',
        scale: 12,
        detailLevel: 0.2,
        stability: 0.9,
        persistence: 0.4,
        seed: 'test-seed:structure-1',
        materialProfile: 'glass',
      },
    ],
    progression: { controlsRevealed: 2, resonanceClassesSeen: [], structuresCreated: 0, permanentStructures: 0, genresSeen: [], playerResonatorsCreated: 0 },
    trackState: createInitialTrackState(),
    genreHistory: [],
  };
}

// Recursively asserts a value is pure JSON data: no functions, class instances,
// AudioNodes, or Three.js objects. Runs BEFORE any JSON.stringify roundtrip,
// which would silently strip such contamination.
function assertIsJsonSafe(value: unknown, path = '$'): void {
  if (value === null) return;
  const type = typeof value;
  if (type === 'boolean' || type === 'string') return;
  if (type === 'number') {
    if (!Number.isFinite(value as number)) throw new Error(`Non-finite number at ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertIsJsonSafe(item, `${path}[${i}]`));
    return;
  }
  if (type === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error(`Class instance (non-plain object) at ${path}`);
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      assertIsJsonSafe(child, `${path}.${key}`);
    }
    return;
  }
  throw new Error(`Non-JSON value (${type}) at ${path}`);
}

describe('assertIsJsonSafe walker', () => {
  it('rejects functions, class instances, and AudioNode-like objects', () => {
    expect(() => assertIsJsonSafe({ onEnd: () => {} })).toThrow(/Non-JSON value \(function\)/);

    class FakeVector3 {
      x = 0;
      y = 0;
      z = 0;
    }
    expect(() => assertIsJsonSafe({ position: new FakeVector3() })).toThrow(/Class instance/);

    class MockAudioNode {
      context = {};
      connect(): void {}
    }
    expect(() => assertIsJsonSafe({ deep: [{ node: new MockAudioNode() }] })).toThrow(
      /Class instance/,
    );

    expect(() => assertIsJsonSafe({ hz: Number.NaN })).toThrow(/Non-finite/);
  });
});

describe('serialize', () => {
  it('injects schemaVersion and savedAt and copies world fields', () => {
    const save = serialize(sampleWorld(), 42_000);
    expect(save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(save.savedAt).toBe(42_000);
    expect(save.seed).toBe('test-seed');
    expect(save.structures).toHaveLength(1);
    expect(save.genreHistory).toEqual([]);
  });

  it('deep-copies so mutating the source does not affect the save', () => {
    const world = sampleWorld();
    const save = serialize(world, 0);
    world.frequencyState.position.x = 999;
    world.resonators[0]!.position.x = 999;
    world.structures[0]!.position.x = 999;
    expect(save.frequencyState.position.x).toBe(0);
    expect(save.resonators[0]!.position.x).not.toBe(999);
    expect(save.structures[0]!.position.x).toBe(1);
  });

  it('overrides caller-supplied schemaVersion and savedAt (re-serializing a loaded save)', () => {
    const stale = { ...sampleWorld(), schemaVersion: 0, savedAt: 123 };
    const save = serialize(stale, 99_999);
    expect(save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(save.savedAt).toBe(99_999);
  });

  it('produces a deeply JSON-safe snapshot and save (no functions, class instances, or Three/Audio objects)', () => {
    const world = sampleWorld();
    // Pre-serialization snapshot: catches contamination at its source, before
    // serialize()'s internal JSON roundtrip could silently strip it.
    assertIsJsonSafe(world);
    assertIsJsonSafe(serialize(world, 42_000));
  });

  it('survives a lossless JSON roundtrip through validate', () => {
    const save = serialize(sampleWorld(), 42_000);
    const result = validate(JSON.parse(JSON.stringify(save)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.save).toEqual(save);
  });
});

describe('validate', () => {
  it('round-trips SUB PRESSURE tracks and snapshots', () => {
    const world = sampleWorld();
    world.trackState.genre = 'sub-pressure';
    world.genreHistory = [{
      atMs: 100,
      affinity: {
        techno: 0,
        'sub-pressure': 0.9,
        ambient: 0,
        jazz: 0,
        bass: 0,
        garage: 0,
        house: 0,
        trap: 0,
        breakbeat: 0,
        dub: 0,
        experimental: 0,
      },
      dominant: 'sub-pressure',
      confidence: 0.8,
    }];
    const result = validate(serialize(world, 100));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.save.trackState.genre).toBe('sub-pressure');
      expect(result.save.genreHistory[0]!.dominant).toBe('sub-pressure');
    }
  });

  it('normalizes dormant saved genres so they cannot reactivate a world', () => {
    const save = serialize(sampleWorld(), 0) as unknown as Record<string, unknown>;
    save.trackState = { ...createInitialTrackState(), genre: 'ambient' };
    save.genreHistory = [{
      atMs: 1,
      affinity: { ambient: 1 },
      dominant: 'ambient',
      confidence: 1,
    }];
    const result = validate(save);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.save.trackState.genre).toBeNull();
      expect(result.save.genreHistory[0]!.dominant).toBeNull();
    }
  });

  it('rejects non-object input without throwing', () => {
    for (const raw of [null, undefined, 7, 'nope', [], true]) {
      const result = validate(raw);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects a save with a missing or empty seed', () => {
    const save = serialize(sampleWorld(), 0) as unknown as Record<string, unknown>;
    expect(validate({ ...save, seed: '' }).ok).toBe(false);
    expect(validate({ ...save, seed: 12 }).ok).toBe(false);
    const { seed: _seed, ...withoutSeed } = save;
    expect(validate(withoutSeed).ok).toBe(false);
  });

  it('rejects a wrong schemaVersion (migrations run before validate)', () => {
    const save = serialize(sampleWorld(), 0);
    expect(validate({ ...save, schemaVersion: SCHEMA_VERSION + 1 }).ok).toBe(false);
  });

  it('clamps out-of-range numbers instead of failing', () => {
    const save = serialize(sampleWorld(), 0);
    const tampered = JSON.parse(JSON.stringify(save));
    tampered.frequencyState.amplitude = 42;
    tampered.frequencyState.hz = -5;
    tampered.frequencyState.resonance = -3;
    const result = validate(tampered);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.save.frequencyState.amplitude).toBe(1);
      expect(result.save.frequencyState.hz).toBeGreaterThan(0);
      expect(result.save.frequencyState.resonance).toBe(0);
    }
  });

  it('replaces non-finite numbers and invalid enums with defaults', () => {
    const save = serialize(sampleWorld(), 0);
    const tampered = JSON.parse(JSON.stringify(save));
    tampered.frequencyState.energy = 'NaN-ish';
    tampered.frequencyState.waveform = 'dubstep';
    tampered.musicState.formPhase = 'zebra';
    const result = validate(tampered);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.save.frequencyState.energy).toBe(0);
      expect(result.save.frequencyState.waveform).toBe('sine');
      expect(result.save.musicState.formPhase).toBe('void');
    }
  });

  it('drops malformed resonator and structure entries, keeps valid ones', () => {
    const save = serialize(sampleWorld(), 0);
    const tampered = JSON.parse(JSON.stringify(save));
    tampered.resonators.push(null, { id: 42 }, 'garbage');
    tampered.structures.push({ position: { x: 0 } });
    const result = validate(tampered);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.save.resonators).toHaveLength(save.resonators.length);
      expect(result.save.structures).toHaveLength(1);
    }
  });

  it('drops structures without the seed that deterministic geometry needs', () => {
    const save = serialize(sampleWorld(), 0);
    const tampered = JSON.parse(JSON.stringify(save));
    delete tampered.structures[0].seed;
    const result = validate(tampered);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.save.structures).toEqual([]);
  });

  it('clamps structure fields and falls back invalid structure waveforms', () => {
    const save = serialize(sampleWorld(), 0);
    const tampered = JSON.parse(JSON.stringify(save));
    tampered.structures[0].stability = 9;
    tampered.structures[0].persistence = -1;
    tampered.structures[0].waveform = 'dubstep';
    const result = validate(tampered);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const structure = result.save.structures[0]!;
      expect(structure.stability).toBe(1);
      expect(structure.persistence).toBe(0);
      expect(structure.waveform).toBe('sine');
    }
  });

  it('tolerates missing optional sections with defaults', () => {
    const save = serialize(sampleWorld(), 0) as unknown as Record<string, unknown>;
    delete save.musicState;
    delete save.genreHistory;
    delete save.progression;
    delete save.structures;
    const result = validate(save);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.save.musicState.formPhase).toBe('void');
      expect(result.save.genreHistory).toEqual([]);
      expect(result.save.structures).toEqual([]);
    }
  });

  it('never throws on deeply malformed input', () => {
    expect(() =>
      validate({
        schemaVersion: SCHEMA_VERSION,
        seed: 's',
        savedAt: 0,
        frequencyState: { position: 'not-a-vec' },
        resonators: { not: 'an array' },
      }),
    ).not.toThrow();
  });
});
