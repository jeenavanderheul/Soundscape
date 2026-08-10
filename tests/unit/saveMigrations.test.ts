import { describe, expect, it } from 'vitest';
import { migrate, type MigrationRegistry } from '../../src/persistence/migrations';
import { SCHEMA_VERSION } from '../../src/persistence/WorldSerializer';
import { hzToDetail, hzToScale } from '../../src/world/StructureData';

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
    expect(result.raw.schemaVersion).toBe(3);
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
});
