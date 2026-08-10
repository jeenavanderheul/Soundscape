// Central typed configuration (spec §13 visual direction, §22 performance).
/** Deterministic seed for all procedural world content (spec §16). */
export const WORLD_SEED = 'frequency-m1';

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
