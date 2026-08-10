// Central typed configuration (spec §13 visual direction, §22 performance).
import { PRIMARY_KEY } from '../persistence/SaveManager';

/**
 * Seed for all procedural world content (spec §16). Everything downstream is
 * deterministic in this seed; the seed itself is drawn once per world.
 *
 * §32: a world keeps its seed as long as it is saved, so returning to it is
 * the same place — but a NEW world gets a new one. That is what makes two
 * flights start from a different key, a different layout, a different forest.
 */
export const WORLD_SEED = resolveWorldSeed();

function resolveWorldSeed(): string {
  try {
    const saved = window.localStorage.getItem(PRIMARY_KEY);
    if (saved !== null) {
      const seed = (JSON.parse(saved) as { seed?: unknown }).seed;
      if (typeof seed === 'string' && seed !== '') return seed;
    }
  } catch {
    // No storage, or a save we cannot read: this simply becomes a new world.
  }
  return `frequency-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Lower-frequency logical loop interval (spec §15): resonance evaluation runs
 * at ~10 Hz inside the RAF loop, never per render frame.
 */
export const LOGIC_STEP_MS = 100;

/** Debounce for autosaved world snapshots (spec §18). */
export const AUTOSAVE_DEBOUNCE_MS = 1500;

/** Periodic save cadence while persistent structures exist (spec §18). */
export const AUTOSAVE_INTERVAL_MS = 15_000;

export const RENDER_CONFIG = {
  clearColor: 0x020202, // near-black void
  /** Always-on depth fog (sight reference); ambient thickens toward max. */
  baseFogDensity: 0.005,
  /** §9.2 fog density at full ambient affinity — soft, never a whiteout. */
  maxFogDensity: 0.02,
  maxPixelRatio: 2,
} as const;

export const CAMERA_CONFIG = {
  fov: 70,
  near: 0.1,
  far: 2000,
  initialPosition: { x: 0, y: 0, z: 5 },
} as const;
