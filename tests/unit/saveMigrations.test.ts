import { describe, expect, it } from 'vitest';
import { migrate, type MigrationRegistry } from '../../src/persistence/migrations';
import { SCHEMA_VERSION, validate } from '../../src/persistence/WorldSerializer';
import { hzToDetail, hzToScale } from '../../src/world/StructureData';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import { createInitialMusicState } from '../../src/music/MusicState';
import { createInitialProgression } from '../../src/progression/ProgressionState';
import { createInitialResonators } from '../../src/world/resonators';
import { createInitialTrackState } from '../../src/music/TrackState';
import { createRng } from '../../src/core/rng';

/** A save as it was written before the machine world was renamed (§186). */
function v4Save() {
  return {
    schemaVersion: 4,
    seed: 'test-seed',
    savedAt: 1000,
    frequencyState: createInitialFrequencyState(),
    musicState: createInitialMusicState(),
    resonators: createInitialResonators(createRng('test-seed')),
    structures: [],
    genreHistory: [],
    progression: createInitialProgression(),
    trackState: createInitialTrackState(),
  };
}

describe('migrate', () => {
  it('passes a current-version save through unchanged', () => {
    const raw = { schemaVersion: SCHEMA_VERSION, seed: 's' };
    const result = migrate(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.raw).toEqual(raw);
  });

  it('rejects non-object input', () => {
    expect(migrate(null).ok).toBe(false);
    expect(migrate('x').ok).toBe(false);
  });

  it('rejects a save with a missing or non-integer schemaVersion', () => {
    expect(migrate({ seed: 's' }).ok).toBe(false);
    expect(migrate({ schemaVersion: 1.5 }).ok).toBe(false);
  });

  it('rejects a save from a newer schema than this build understands', () => {
    const result = migrate({ schemaVersion: SCHEMA_VERSION + 1 });
    expect(result.ok).toBe(false);
  });

  it('rejects an old version with no registered migration path', () => {
    const result = migrate({ schemaVersion: 1 }, {}, 3);
    expect(result.ok).toBe(false);
  });

  it('migrates a v1 structure to the StructureData shape (v1 → v2)', () => {
    const raw = {
      schemaVersion: 1,
      seed: 'world-seed',
      structures: [
        {
          id: 'structure-1',
          position: { x: 1, y: 2, z: 3 },
          hz: 110,
          mass: 0.8,
          detail: 0.2,
          instability: 0.1,
          persistence: 10,
          materialProfile: 'metallic',
          createdAtMs: 1234,
        },
      ],
    };
    const result = migrate(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.raw.schemaVersion).toBe(SCHEMA_VERSION);
    const migrated = (result.raw.structures as Record<string, unknown>[])[0]!;
    expect(migrated.id).toBe('structure-1');
    expect(migrated.waveform).toBe('saw'); // §3.7 inverse: metallic ← saw
    expect(migrated.scale).toBeCloseTo(hzToScale(110));
    expect(migrated.detailLevel).toBeCloseTo(hzToDetail(110));
    expect(migrated.stability).toBeCloseTo(0.9); // 1 - instability
    expect(migrated.persistence).toBeCloseTo(0.5); // 10 s of 20 s permanence
    expect(migrated.seed).toBe('world-seed:structure-1');
    expect(migrated.sourceResonatorId).toBe('');
    expect(migrated.mass).toBeUndefined();
    expect(migrated.detail).toBeUndefined();
    expect(migrated.instability).toBeUndefined();
  });

  it('v1 → v2 never throws on malformed structure entries', () => {
    const raw = {
      schemaVersion: 1,
      seed: 'world-seed',
      structures: [null, 'garbage', { id: 'x', hz: -4, persistence: 'nope' }],
    };
    const result = migrate(raw);
    expect(result.ok).toBe(true);
  });

  it('walks migrations upward step by step to the target version', () => {
    const registry: MigrationRegistry = {
      1: (raw) => ({ ...raw, a: true }),
      2: (raw) => ({ ...raw, b: true }),
    };
    const result = migrate({ schemaVersion: 1, seed: 's' }, registry, 3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.raw).toEqual({ schemaVersion: 3, seed: 's', a: true, b: true });
    }
  });
  /**
   * §186: the machine world was renamed from `techno` to `locked-groove`. Four
   * fields in a save carry that name, and NONE of them would have complained:
   * `validate()` reads an unknown genre as null and an unknown affinity key as
   * 0, so without this step a returning player lands in the void and the save
   * looks fine. These tests are the alarm that step exists.
   */
  it('renames the machine world in every field a v4 save carries it (v4 → v5)', () => {
    const result = migrate({
      schemaVersion: 4,
      seed: 'world-seed',
      trackState: { genre: 'techno', bpm: 134 },
      genreHistory: [
        { atMs: 1000, dominant: 'techno', affinity: { techno: 0.9, 'sub-pressure': 0.1 } },
        { atMs: 2000, dominant: 'void-crusher', affinity: { techno: 0.2, 'void-crusher': 0.8 } },
      ],
      progression: { genresSeen: ['techno', 'sub-pressure'], structuresCreated: 3 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const raw = result.raw as Record<string, any>;
    expect(raw.schemaVersion).toBe(5);
    expect(raw.trackState.genre).toBe('locked-groove');
    // The weight survives the key change — a rename is not a reset.
    expect(raw.genreHistory[0].affinity).toEqual({ 'locked-groove': 0.9, 'sub-pressure': 0.1 });
    expect(raw.genreHistory[0].dominant).toBe('locked-groove');
    expect(raw.genreHistory[1].affinity).toEqual({ 'locked-groove': 0.2, 'void-crusher': 0.8 });
    expect(raw.genreHistory[1].dominant).toBe('void-crusher');
    expect(raw.progression.genresSeen).toEqual(['locked-groove', 'sub-pressure']);
    // Everything else is left exactly where it was.
    expect(raw.trackState.bpm).toBe(134);
    expect(raw.progression.structuresCreated).toBe(3);
  });

  it('v4 → v5 never throws on a save that is missing or malformed', () => {
    for (const raw of [
      { schemaVersion: 4, seed: 's' },
      { schemaVersion: 4, seed: 's', trackState: null, genreHistory: null, progression: null },
      { schemaVersion: 4, seed: 's', genreHistory: [null, 'junk', { affinity: 7 }] },
      { schemaVersion: 4, seed: 's', progression: { genresSeen: 'not-an-array' } },
    ]) {
      expect(migrate(raw).ok).toBe(true);
    }
  });

  it('an old save with the old world name survives the whole load path', () => {
    // The regression this rename could have caused: migrate + validate together
    // must hand back the machine world, not a silent null.
    const migrated = migrate({
      ...v4Save(),
      trackState: { ...createInitialTrackState(), genre: 'techno' },
      genreHistory: [{ atMs: 1, dominant: 'techno', affinity: { techno: 1 } }],
      progression: { ...createInitialProgression(), genresSeen: ['techno'] },
    });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const result = validate(migrated.raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.trackState?.genre).toBe('locked-groove');
    expect(result.save.genreHistory[0]?.dominant).toBe('locked-groove');
    expect(result.save.genreHistory[0]?.affinity['locked-groove']).toBe(1);
    expect(result.save.progression.genresSeen).toEqual(['locked-groove']);
  });
});
