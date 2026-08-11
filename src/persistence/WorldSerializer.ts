import type { GenreAffinity, MusicState } from '../music/MusicState';
import { createInitialMusicState, GENRE_NAMES } from '../music/MusicState';
import type { FrequencyState, Vec3Data, Waveform } from '../player/FrequencyState';
import type { ResonatorData } from '../world/Resonator';
import { HZ_SCALE_RANGE, type StructureData } from '../world/StructureData';

/** Bump when the save contract changes and register a migration (spec §18). */
export const SCHEMA_VERSION = 4;

const WAVEFORMS: readonly Waveform[] = ['sine', 'triangle', 'square', 'saw', 'noise'];
const FORM_PHASES = ['void', 'intro', 'build', 'peak', 'break', 'return', 'mutation'] as const;

const MIN_HZ = 20;
const MAX_HZ = 20_000;

/**
 * Persistent geometry born from stable resonance (M3, spec §3.1/§3.7/§3.8/§18).
 * Identical to the world contract so saves reconstruct exactly what
 * FormEmergence produced — including the seed deterministic geometry needs.
 */
export type SavedStructure = StructureData;

/** Spec §9; history stays empty until genre attractors land (M5). */
export interface GenreSnapshot {
  atMs: number;
  affinity: GenreAffinity;
  dominant: keyof GenreAffinity | null;
  confidence: number;
}

export type { ProgressionState } from '../progression/ProgressionState';
import { createInitialProgression } from '../progression/ProgressionState';
import type { ProgressionState } from '../progression/ProgressionState';
import { createInitialTrackState } from '../music/TrackState';
import type { PatternState, TrackState } from '../music/TrackState';

/** Spec §18 save contract. Serializable primitives and plain objects only. */
export interface WorldSave {
  schemaVersion: number;
  seed: string;
  savedAt: number;
  frequencyState: FrequencyState;
  musicState: MusicState;
  resonators: ResonatorData[];
  structures: SavedStructure[];
  genreHistory: GenreSnapshot[];
  progression: ProgressionState;
  /** §29.4: what is actually in the track. */
  trackState: TrackState;
}

/** What callers hand to serialize; schemaVersion and savedAt are injected. */
export type SerializableWorld = Omit<WorldSave, 'schemaVersion' | 'savedAt'>;

export type ValidationResult =
  | { ok: true; save: WorldSave }
  | { ok: false; error: string };

export function serialize(world: SerializableWorld, savedAt: number): WorldSave {
  // structuredClone-free deep copy: the input is serializable by contract.
  const copy = JSON.parse(JSON.stringify(world)) as SerializableWorld;
  // Spread first so a WorldSave-shaped input cannot smuggle in stale metadata.
  return { ...copy, schemaVersion: SCHEMA_VERSION, savedAt };
}

// --- validation helpers (never throw; clamp or fall back) ---

type RawObject = Record<string, unknown>;

function isObject(value: unknown): value is RawObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function vec3(value: unknown): Vec3Data | null {
  if (!isObject(value)) return null;
  const { x, y, z } = value;
  if ([x, y, z].some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null;
  return { x: x as number, y: y as number, z: z as number };
}

function frequencyState(raw: unknown): FrequencyState | null {
  if (!isObject(raw)) return null;
  const position = vec3(raw.position) ?? { x: 0, y: 0, z: 0 };
  const direction = vec3(raw.direction) ?? { x: 0, y: 0, z: -1 };
  return {
    hz: num(raw.hz, 220, MIN_HZ, MAX_HZ),
    amplitude: num(raw.amplitude, 0, 0, 1),
    waveform: oneOf(raw.waveform, WAVEFORMS, 'sine'),
    phase: num(raw.phase, 0, -Math.PI * 2, Math.PI * 2),
    velocity: num(raw.velocity, 0, 0, Number.MAX_SAFE_INTEGER),
    position,
    direction,
    resonance: num(raw.resonance, 0, 0, 1),
    stability: num(raw.stability, 0, 0, 1),
    energy: num(raw.energy, 0, 0, 1),
  };
}

function musicState(raw: unknown): MusicState {
  const defaults = createInitialMusicState();
  if (!isObject(raw)) return defaults;
  const state: MusicState = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof MusicState)[]) {
    if (key === 'formPhase' || key === 'meter') continue;
    const fallback = defaults[key] as number;
    const max = key === 'bpm' ? 999 : key === 'pitchCenter' ? MAX_HZ : key === 'durationAverage' ? Number.MAX_SAFE_INTEGER : 1;
    (state[key] as number) = num(raw[key], fallback, 0, max);
  }
  state.formPhase = oneOf(raw.formPhase, FORM_PHASES, 'void');
  if (typeof raw.meter === 'string') state.meter = raw.meter;
  return state;
}

function resonator(raw: unknown): ResonatorData | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || raw.id === '') return null;
  const position = vec3(raw.position);
  if (!position) return null;
  return {
    id: raw.id,
    position,
    baseHz: num(raw.baseHz, 220, MIN_HZ, MAX_HZ),
    waveform: oneOf(raw.waveform, WAVEFORMS, 'sine'),
    amplitude: num(raw.amplitude, 0.3, 0, 1),
    interactionRadius: num(raw.interactionRadius, 6, 0.1, 10_000),
    audibleRadius: num(raw.audibleRadius, 150, 0.1, 100_000),
    persistenceThreshold: num(raw.persistenceThreshold, 4, 0, 3600),
    materialProfile: str(raw.materialProfile, 'glass'),
    spatialProfile: str(raw.spatialProfile, 'omni'),
    active: raw.active !== false,
  };
}

function structure(raw: unknown): SavedStructure | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || raw.id === '') return null;
  // No seed means no deterministic geometry (§25.16): the entry is unrecoverable.
  if (typeof raw.seed !== 'string' || raw.seed === '') return null;
  const position = vec3(raw.position);
  if (!position) return null;
  return {
    id: raw.id,
    createdAtMs: num(raw.createdAtMs, 0, 0, Number.MAX_SAFE_INTEGER),
    position,
    sourceResonatorId: str(raw.sourceResonatorId, ''),
    hz: num(raw.hz, 220, MIN_HZ, MAX_HZ),
    waveform: oneOf(raw.waveform, WAVEFORMS, 'sine'),
    // Lower bound 0, not minScale: newborn structures start below the band floor.
    scale: num(raw.scale, HZ_SCALE_RANGE.minScale, 0, HZ_SCALE_RANGE.maxScale),
    detailLevel: num(raw.detailLevel, 0, 0, 1),
    stability: num(raw.stability, 1, 0, 1),
    persistence: num(raw.persistence, 0, 0, 1),
    seed: raw.seed,
    materialProfile: str(raw.materialProfile, 'glass'),
  };
}

function genreSnapshot(raw: unknown): GenreSnapshot | null {
  if (!isObject(raw) || !isObject(raw.affinity)) return null;
  const a = raw.affinity;
  const affinity: GenreAffinity = {
    techno: num(a.techno, 0, 0, 1),
    garage: num(a.garage, 0, 0, 1),
    house: num(a.house, 0, 0, 1),
    trap: num(a.trap, 0, 0, 1),
    breakbeat: num(a.breakbeat, 0, 0, 1),
    dub: num(a.dub, 0, 0, 1),
    ambient: num(a.ambient, 0, 0, 1),
    jazz: num(a.jazz, 0, 0, 1),
    dnb: num(a.dnb, 0, 0, 1),
    experimental: num(a.experimental, 0, 0, 1),
  };
  const dominant = (GENRE_NAMES as readonly string[]).includes(
    raw.dominant as string,
  )
    ? (raw.dominant as keyof GenreAffinity)
    : null;
  return {
    atMs: num(raw.atMs, 0, 0, Number.MAX_SAFE_INTEGER),
    affinity,
    dominant,
    confidence: num(raw.confidence, 0, 0, 1),
  };
}

function collect<T>(raw: unknown, parse: (entry: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parse).filter((entry): entry is T => entry !== null);
}

/**
 * Defensive validation of unknown input (spec §25.17): structural failures
 * return a typed error; recoverable field damage is clamped or defaulted.
 * Never throws on malformed input.
 */
/** Defensive TrackState validation: unknown input → valid state, never throws. */
function validateTrackState(raw: unknown): TrackState {
  const base = createInitialTrackState();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;
  const pattern = (value: unknown): PatternState => {
    if (typeof value !== 'object' || value === null) return { unlocked: false, level: 0 };
    const p = value as Record<string, unknown>;
    const unlocked = p.unlocked === true;
    const level =
      typeof p.level === 'number' && Number.isFinite(p.level)
        ? Math.min(1, Math.max(0, p.level))
        : 0;
    return { unlocked, level: unlocked ? Math.max(level, 0.01) : level };
  };
  const drums =
    typeof r.drums === 'object' && r.drums !== null ? (r.drums as Record<string, unknown>) : {};
  const numbers = (value: unknown, min: number, max: number): number[] =>
    Array.isArray(value)
      ? value
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
          .map((v) => Math.min(max, Math.max(min, Math.round(v))))
          .slice(0, 8)
      : [];
  const GENRES: readonly string[] = GENRE_NAMES;
  const FORMS = ['none', 'intro', 'groove', 'build', 'drop', 'break', 'return', 'mutation'];
  return {
    ...base,
    bpm: typeof r.bpm === 'number' && Number.isFinite(r.bpm) ? Math.min(300, Math.max(0, r.bpm)) : 0,
    rootMidi:
      typeof r.rootMidi === 'number' && Number.isFinite(r.rootMidi)
        ? Math.min(107, Math.max(12, Math.round(r.rootMidi)))
        : base.rootMidi,
    harmonyIntervals: numbers(r.harmonyIntervals, 0, 24).length
      ? numbers(r.harmonyIntervals, 0, 24)
      : base.harmonyIntervals,
    melodyNotes: numbers(r.melodyNotes, 12, 107),
    genre: typeof r.genre === 'string' && GENRES.includes(r.genre) ? (r.genre as TrackState['genre']) : null,
    form: typeof r.form === 'string' && FORMS.includes(r.form) ? (r.form as TrackState['form']) : 'none',
    drums: {
      kick: pattern(drums.kick),
      snare: pattern(drums.snare),
      hats: pattern(drums.hats),
    },
    bass: pattern(r.bass),
    harmony: pattern(r.harmony),
    melody: pattern(r.melody),
    texture: pattern(r.texture),
  };
}

export function validate(raw: unknown): ValidationResult {
  if (!isObject(raw)) return { ok: false, error: 'save is not an object' };
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, error: `unsupported schemaVersion: ${String(raw.schemaVersion)}` };
  }
  if (typeof raw.seed !== 'string' || raw.seed === '') {
    return { ok: false, error: 'save has no seed' };
  }
  const frequency = frequencyState(raw.frequencyState);
  if (!frequency) return { ok: false, error: 'frequencyState is missing or malformed' };

  const base = createInitialProgression();
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 16) : [];
  const progression = isObject(raw.progression)
    ? {
        controlsRevealed: num(raw.progression.controlsRevealed, 0, 0, 100),
        resonanceClassesSeen: strings(raw.progression.resonanceClassesSeen),
        structuresCreated: num(raw.progression.structuresCreated, 0, 0, 1e6),
        permanentStructures: num(raw.progression.permanentStructures, 0, 0, 1e6),
        genresSeen: strings(raw.progression.genresSeen),
        playerResonatorsCreated: num(raw.progression.playerResonatorsCreated, 0, 0, 1e6),
      }
    : base;

  return {
    ok: true,
    save: {
      schemaVersion: SCHEMA_VERSION,
      seed: raw.seed,
      savedAt: num(raw.savedAt, 0, 0, Number.MAX_SAFE_INTEGER),
      frequencyState: frequency,
      musicState: musicState(raw.musicState),
      resonators: collect(raw.resonators, resonator),
      structures: collect(raw.structures, structure),
      genreHistory: collect(raw.genreHistory, genreSnapshot),
      progression,
      trackState: validateTrackState(raw.trackState),
    },
  };
}
