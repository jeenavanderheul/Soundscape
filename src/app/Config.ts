// Central typed configuration (spec §13 visual direction, §22 performance).
/** Deterministic seed for all procedural world content (spec §16). */
export const WORLD_SEED = 'frequency-m1';

export const RENDER_CONFIG = {
  clearColor: 0x020202, // near-black void
  maxPixelRatio: 2,
} as const;

export const CAMERA_CONFIG = {
  fov: 70,
  near: 0.1,
  far: 2000,
  initialPosition: { x: 0, y: 0, z: 5 },
} as const;
