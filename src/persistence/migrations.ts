import { hzToDetail, hzToScale } from '../world/StructureData';
import { SCHEMA_VERSION } from './WorldSerializer';

type RawSave = Record<string, unknown>;

/** Keyed by the version a migration upgrades FROM (v → v+1). */
export type MigrationRegistry = Record<number, (raw: RawSave) => RawSave>;

export type MigrationResult =
  | { ok: true; raw: RawSave }
  | { ok: false; error: string };

/** v1 stored no waveform; recover it from the §3.7 matter name it produced. */
const V1_WAVEFORM_BY_MATERIAL: Record<string, string> = {
  glass: 'sine',
  faceted: 'triangle',
  digital: 'square',
  metallic: 'saw',
  fog: 'noise',
};

/** v1 persistence counted sustained seconds; v2 is 0..1 (20 s = permanence). */
const V1_PERMANENCE_SECONDS = 20;

const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1);

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** v1 SavedStructure (mass/detail/instability) → StructureData shape. Never throws. */
function migrateV1Structure(entry: unknown, worldSeed: string): unknown {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return entry;
  const raw = entry as RawSave;
  const rawHz = finiteNumber(raw.hz, 220);
  const hz = rawHz > 0 ? rawHz : 220;
  const { mass: _mass, detail: _detail, instability: _instability, ...rest } = raw;
  return {
    ...rest,
    hz,
    sourceResonatorId: '', // v1 never recorded the source; loaded forms just won't regrow
    waveform: V1_WAVEFORM_BY_MATERIAL[String(raw.materialProfile)] ?? 'sine',
    scale: hzToScale(hz),
    detailLevel: hzToDetail(hz),
    stability: clamp01(1 - finiteNumber(raw.instability, 0)),
    persistence: clamp01(finiteNumber(raw.persistence, 0) / V1_PERMANENCE_SECONDS),
    seed: `${worldSeed}:${String(raw.id)}`,
  };
}

const MIGRATIONS: MigrationRegistry = {
  // v3 → v4: TrackState added (§29.4); older saves start with a locked track.
  3: (raw) => ({ ...raw, trackState: null }),
  // v2 → v3: progression grew discovery tracking (§17); defaults are empty.
  2: (raw) => {
    const prev =
      typeof raw.progression === 'object' && raw.progression !== null && !Array.isArray(raw.progression)
        ? (raw.progression as RawSave)
        : {};
    return {
      ...raw,
      progression: {
        controlsRevealed: finiteNumber(prev.controlsRevealed, 0),
        resonanceClassesSeen: [],
        structuresCreated: 0,
        permanentStructures: 0,
        genresSeen: [],
        playerResonatorsCreated: 0,
      },
    };
  },
  // v1 → v2: SavedStructure aligned with the world StructureData contract (§18).
  1: (raw) => {
    if (!Array.isArray(raw.structures)) return raw;
    const worldSeed = typeof raw.seed === 'string' ? raw.seed : 'unknown-seed';
    return {
      ...raw,
      structures: raw.structures.map((entry) => migrateV1Structure(entry, worldSeed)),
    };
  },
};

/** Walks a raw save upward one schema version at a time. Never throws. */
export function migrate(
  raw: unknown,
  registry: MigrationRegistry = MIGRATIONS,
  target: number = SCHEMA_VERSION,
): MigrationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'save is not an object' };
  }
  const start = (raw as RawSave).schemaVersion;
  if (typeof start !== 'number' || !Number.isInteger(start) || start < 1) {
    return { ok: false, error: `save has no valid schemaVersion: ${String(start)}` };
  }
  if (start > target) {
    return { ok: false, error: `save schemaVersion ${start} is newer than supported ${target}` };
  }

  let current = raw as RawSave;
  for (let version = start; version < target; version++) {
    const step = registry[version];
    if (!step) {
      return { ok: false, error: `no migration registered from schemaVersion ${version}` };
    }
    current = { ...step(current), schemaVersion: version + 1 };
  }
  return { ok: true, raw: current };
}
