import type { GenreAffinity } from '../music/MusicState';
import type { LayerName } from '../audio/MusicalPrimitives';
import { guardPatternMap } from './PatternGuard';

/**
 * §30: the world the player described, as validated data. Everything the AI
 * returns passes through `validateRecipe` — clamped, range-checked, and
 * stripped of anything unrecognized — before a single value reaches the
 * world. Generated patterns additionally pass the PatternGuard grammar.
 */

export type RecipeWaveform = 'sine' | 'triangle' | 'square' | 'saw' | 'noise';
/** §57: all ten worlds sit on the compass, so any of them can be placed. */
export type RecipeGenre = keyof GenreAffinity;

export interface RecipeResonator {
  /** Compass bearing in degrees; 0 = north, 90 = east. */
  angleDeg: number;
  /** Distance from spawn in world units. */
  distance: number;
  hz: number;
  waveform: RecipeWaveform;
}

export interface WorldRecipe {
  name: string;
  /** Which genre lies in each compass direction (§29.5 spatial grammar). */
  zones: Record<
    | 'north' | 'northNorthEast' | 'eastNorthEast' | 'eastSouthEast' | 'southSouthEast'
    | 'south' | 'southSouthWest' | 'westSouthWest' | 'westNorthWest' | 'northNorthWest',
    RecipeGenre
  >;
  resonators: RecipeResonator[];
  /** 0..1 atmosphere density and forest density. */
  fog: number;
  forest: number;
  /** Suggested starting tempo; the player's flight still rules (§29). */
  bpm: number;
  /** Guarded Strudel source per track layer — the AI's musical material. */
  patterns: Partial<Record<LayerName, string>>;
}

export const RECIPE_LIMITS = {
  maxResonators: 8,
  minDistance: 40,
  maxDistance: 260,
  minHz: 40,
  maxHz: 3000,
  minBpm: 70,
  maxBpm: 180,
  maxNameLength: 40,
} as const;

const WAVEFORMS: readonly RecipeWaveform[] = ['sine', 'triangle', 'square', 'saw', 'noise'];
const GENRES: readonly RecipeGenre[] = [
  'techno',
  'ambient',
  'jazz',
  'dnb',
  'garage',
  'house',
  'trap',
  'classical',
];
const LAYERS: readonly LayerName[] = ['drums', 'bass', 'harmony', 'melody', 'texture', 'atmosphere'];

/** The JSON Schema handed to the model, so the response is structurally valid. */
export const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'zones', 'resonators', 'fog', 'forest', 'bpm', 'patterns'],
  properties: {
    name: { type: 'string' },
    zones: {
      type: 'object',
      additionalProperties: false,
      required: [
        'north',
        'northNorthEast',
        'southSouthEast',
        'westNorthWest',
        'eastNorthEast',
        'eastSouthEast',
        'south',
        'southSouthWest',
        'westSouthWest',
        'northNorthWest',
      ],
      properties: {
        north: { type: 'string', enum: GENRES },
        southSouthEast: { type: 'string', enum: GENRES },
        westNorthWest: { type: 'string', enum: GENRES },
        northNorthEast: { type: 'string', enum: GENRES },
        eastNorthEast: { type: 'string', enum: GENRES },
        eastSouthEast: { type: 'string', enum: GENRES },
        south: { type: 'string', enum: GENRES },
        southSouthWest: { type: 'string', enum: GENRES },
        westSouthWest: { type: 'string', enum: GENRES },
        northNorthWest: { type: 'string', enum: GENRES },
      },
    },
    resonators: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['angleDeg', 'distance', 'hz', 'waveform'],
        properties: {
          angleDeg: { type: 'number' },
          distance: { type: 'number' },
          hz: { type: 'number' },
          waveform: { type: 'string', enum: WAVEFORMS },
        },
      },
    },
    fog: { type: 'number' },
    forest: { type: 'number' },
    bpm: { type: 'number' },
    patterns: {
      type: 'object',
      additionalProperties: false,
      properties: {
        drums: { type: 'string' },
        bass: { type: 'string' },
        harmony: { type: 'string' },
        melody: { type: 'string' },
        texture: { type: 'string' },
        atmosphere: { type: 'string' },
      },
    },
  },
} as const;

const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export interface RecipeValidation {
  recipe: WorldRecipe;
  /** Patterns the guard refused, so the player can be told honestly. */
  rejected: Array<{ layer: string; reason: string }>;
}

/**
 * Turn unknown model output into a world the engine can trust. Never throws;
 * anything malformed falls back to a safe default (§25.17 boundary rule).
 */
export function validateRecipe(raw: unknown): RecipeValidation {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const zonesRaw = (typeof r.zones === 'object' && r.zones !== null ? r.zones : {}) as Record<
    string,
    unknown
  >;
  const resonatorsRaw = Array.isArray(r.resonators) ? r.resonators : [];
  const patternsRaw =
    typeof r.patterns === 'object' && r.patterns !== null
      ? (r.patterns as Record<string, unknown>)
      : {};

  const { accepted, rejected } = guardPatternMap(patternsRaw);
  const patterns: Partial<Record<LayerName, string>> = {};
  for (const layer of LAYERS) {
    const code = accepted[layer];
    if (code) patterns[layer] = code;
  }

  const resonators: RecipeResonator[] = resonatorsRaw
    .slice(0, RECIPE_LIMITS.maxResonators)
    .map((entry) => {
      const e = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
        string,
        unknown
      >;
      return {
        angleDeg: ((clamp(e.angleDeg, -3600, 3600, 0) % 360) + 360) % 360,
        distance: clamp(e.distance, RECIPE_LIMITS.minDistance, RECIPE_LIMITS.maxDistance, 80),
        hz: clamp(e.hz, RECIPE_LIMITS.minHz, RECIPE_LIMITS.maxHz, 220),
        waveform: oneOf(e.waveform, WAVEFORMS, 'sine'),
      };
    });

  const name = typeof r.name === 'string' ? r.name.trim().slice(0, RECIPE_LIMITS.maxNameLength) : '';

  return {
    recipe: {
      name: name === '' ? 'unnamed world' : name,
      zones: {
        north: oneOf(zonesRaw.north, GENRES, 'techno'),
        southSouthEast: oneOf(zonesRaw.southSouthEast, GENRES, 'experimental'),
        westNorthWest: oneOf(zonesRaw.westNorthWest, GENRES, 'dub'),
        northNorthEast: oneOf(zonesRaw.northNorthEast, GENRES, 'garage'),
        eastNorthEast: oneOf(zonesRaw.eastNorthEast, GENRES, 'jazz'),
        eastSouthEast: oneOf(zonesRaw.eastSouthEast, GENRES, 'house'),
        south: oneOf(zonesRaw.south, GENRES, 'ambient'),
        southSouthWest: oneOf(zonesRaw.southSouthWest, GENRES, 'classical'),
        westSouthWest: oneOf(zonesRaw.westSouthWest, GENRES, 'dnb'),
        northNorthWest: oneOf(zonesRaw.northNorthWest, GENRES, 'trap'),
      },
      // A world with no resonators would be silent; fall back to the seeded set.
      resonators,
      fog: clamp(r.fog, 0, 1, 0.3),
      forest: clamp(r.forest, 0, 1, 0.5),
      bpm: clamp(r.bpm, RECIPE_LIMITS.minBpm, RECIPE_LIMITS.maxBpm, 120),
      patterns,
    },
    rejected,
  };
}
