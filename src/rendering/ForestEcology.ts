import type { TrackGenre, TrackState } from '../music/TrackState';

/**
 * §36: THE FOREST IS THE SCORE.
 *
 * Vegetation is not decoration. Every growth has a musical role, so a player
 * can see where the music is before hearing it: a stand of thick trunks is a
 * kick waiting to be earned, a canopy overhead is harmony, roots below are
 * sub. Each growth exists in two states — POTENTIAL (thin, dim: what this
 * place could give you) and EARNED (full: what you took from it).
 *
 * Placement is a pure function of world position and seed, so the forest is
 * infinite, deterministic, and identical between sessions of the same world.
 * No Three.js here: this module decides WHAT stands WHERE, the renderer only
 * draws it.
 */

/** What a growth is, musically. */
export type GrowthRole =
  | 'trunk' // kick — thick, low, the mass of the place
  | 'thin' // hats — needles, fast and high
  | 'root' // bass — reaching down below the surface
  | 'branch' // melody — reaching sideways
  | 'canopy' // harmony — the ceiling overhead
  | 'spore' // texture — drifting motes
  | 'giant'; // a whole new element — rare, enormous, solid

export const ROLE_LAYER: Record<GrowthRole, keyof TrackState['drums'] | 'bass' | 'harmony' | 'melody' | 'texture'> = {
  trunk: 'kick',
  thin: 'hats',
  root: 'bass',
  branch: 'melody',
  canopy: 'harmony',
  spore: 'texture',
  giant: 'snare',
};

export interface Growth {
  role: GrowthRole;
  x: number;
  z: number;
  /** Base height above the terrain surface. */
  height: number;
  radius: number;
  /** Vertical band: <0 below the surface (roots), 0 ground level, >0 canopy. */
  lift: number;
  /** Stable per-growth randomness for sway phase and variation. */
  phase: number;
  /** True once the layer this growth carries has been earned (§36). */
  earned: boolean;
  /** Only the largest formations are solid (user decision). */
  solid: boolean;
}

/** How each grammar shapes its ecosystem (§36 abstract forests). */
/**
 * §55: the SHAPE language of a world. Ten worlds shared one tapered spire,
 * which is why they read as the same forest in different colours. Each world
 * now has its own pair of forms, and the mix between them is what you
 * recognise from the air — before the colour, before the first kick.
 *
 * All of them stay abstract line work (§13): a pillar, a shard, an arch — never
 * a literal tree.
 */
export type FormName = 'pillar' | 'shard' | 'spire' | 'arch' | 'membrane' | 'ring' | 'monolith';

export interface Ecology {
  name: string;
  /** Primary and accent form; `formBias` is how often the primary wins. */
  forms: readonly [FormName, FormName];
  formBias: number;
  /** Growths per cell — density of the forest. */
  density: number;
  /** Multiplies every height: verticality is the strongest genre signal. */
  heightScale: number;
  /** 0 = perfectly straight (machine), 1 = wild (organic). */
  irregularity: number;
  /** How much this forest sways with the beat. */
  motion: number;
  /** Relative frequency of each role. */
  mix: Partial<Record<GrowthRole, number>>;
}

const BASE_MIX: Record<GrowthRole, number> = {
  trunk: 1,
  thin: 3,
  root: 0.6,
  branch: 1.2,
  canopy: 0.8,
  spore: 2,
  giant: 0.05,
};

export const ECOLOGIES: Record<Exclude<TrackGenre, null>, Ecology> = {
  // Machine forest: tall thin waveform pillars, perfectly upright.
  techno: {
    name: 'MACHINE FOREST',
    forms: ['pillar', 'arch'],
    formBias: 0.85,
    density: 1,
    heightScale: 1.5,
    irregularity: 0.05,
    motion: 1,
    mix: { trunk: 2, thin: 4, canopy: 0.3, branch: 0.4 },
  },
  'sub-pressure': {
    name: 'SUB PRESSURE FOREST',
    forms: ['pillar', 'shard'],
    formBias: 0.68,
    density: 1.1,
    heightScale: 1.6,
    irregularity: 0.22,
    motion: 0.85,
    mix: { trunk: 2.2, thin: 2.4, root: 2.6, branch: 0.5, giant: 0.12 },
  },
  // Cloud forest: almost no trunks, membranes and spores drifting.
  ambient: {
    name: 'CLOUD FOREST',
    forms: ['membrane', 'spire'],
    formBias: 0.8,
    density: 0.7,
    heightScale: 0.7,
    irregularity: 0.5,
    motion: 0.25,
    mix: { trunk: 0.2, thin: 0.6, spore: 6, canopy: 2.5, root: 0.3 },
  },
  // Improvised forest: branching, asymmetric, reaching sideways.
  jazz: {
    name: 'IMPROVISED FOREST',
    forms: ['spire', 'arch'],
    formBias: 0.6,
    density: 0.9,
    heightScale: 1.1,
    irregularity: 1,
    motion: 0.6,
    mix: { branch: 4, trunk: 1, canopy: 1.6, thin: 1.2 },
  },
  // Velocity forest: sharp vertical shards, canyons, things that flash past.
  bass: {
    name: 'PRESSURE FOREST',
    forms: ['shard', 'pillar'],
    formBias: 0.85,
    density: 1.3,
    heightScale: 1.7,
    irregularity: 0.3,
    motion: 1.4,
    mix: { thin: 5, trunk: 1.6, root: 1.4, spore: 0.6 },
  },
  // Mutation forest: nothing keeps its form; inverted and floating growths.
  experimental: {
    name: 'MUTATION FOREST',
    forms: ['monolith', 'ring'],
    formBias: 0.5,
    density: 1.1,
    heightScale: 1.3,
    irregularity: 1.6,
    motion: 1.1,
    mix: { branch: 2, canopy: 1.4, giant: 0.3, spore: 2, root: 1.4 },
  },
  // Skip forest: everything slightly off its own grid.
  garage: {
    name: 'SKIP FOREST',
    forms: ['ring', 'shard'],
    formBias: 0.7,
    density: 1.1,
    heightScale: 1.1,
    irregularity: 0.55,
    motion: 1.2,
    mix: { thin: 5, trunk: 1.2, branch: 1.4, spore: 1.2 },
  },
  // Warm forest: low, round, generous.
  house: {
    name: 'WARM FOREST',
    forms: ['arch', 'membrane'],
    formBias: 0.7,
    density: 1,
    heightScale: 0.9,
    irregularity: 0.35,
    motion: 0.8,
    mix: { trunk: 1.6, canopy: 2, thin: 2, branch: 1 },
  },
  // Weight forest: enormous heavy masses, sparse and slow.
  trap: {
    name: 'WEIGHT FOREST',
    forms: ['monolith', 'pillar'],
    formBias: 0.8,
    density: 0.6,
    heightScale: 2.1,
    irregularity: 0.25,
    motion: 0.5,
    mix: { trunk: 3, root: 2.5, giant: 0.25, thin: 1.2, spore: 0.4 },
  },
  // Echo forest: deep roots, wide canopy, long empty spaces between.
  dub: {
    name: 'ECHO FOREST',
    forms: ['membrane', 'monolith'],
    formBias: 0.65,
    density: 0.5,
    heightScale: 1.2,
    irregularity: 0.7,
    motion: 0.4,
    mix: { root: 4, canopy: 2.5, trunk: 0.8, spore: 1.5, thin: 0.3 },
  },
  // Hall forest: colonnades — the most ordered ecosystem of all.
  breakbeat: {
    name: 'BROKEN FOREST',
    forms: ['monolith', 'shard'],
    formBias: 0.55,
    density: 0.8,
    heightScale: 1.4,
    irregularity: 0.15,
    motion: 0.3,
    mix: { trunk: 2, canopy: 3, branch: 1.6, thin: 0.5, spore: 0.8 },
  },
};

export const NEUTRAL_ECOLOGY: Ecology = {
  name: 'THE VOID',
  forms: ['spire', 'membrane'],
  formBias: 0.7,
  density: 0.25,
  heightScale: 0.5,
  irregularity: 0.3,
  motion: 0.5,
  mix: {},
};

export function ecologyFor(genre: TrackGenre): Ecology {
  return genre === null ? NEUTRAL_ECOLOGY : ECOLOGIES[genre];
}

/** Deterministic 0..1 from a cell and a channel — the forest's only randomness. */
export function cellRandom(seed: number, cx: number, cz: number, channel: number): number {
  let h = (cx * 374761393 + cz * 668265263 + channel * 2246822519 + seed) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}

/** Pick a role from the ecology's mix, using one random draw. */
export function roleFor(ecology: Ecology, draw: number): GrowthRole {
  const weights = { ...BASE_MIX, ...ecology.mix };
  const roles = Object.keys(weights) as GrowthRole[];
  const total = roles.reduce((sum, role) => sum + weights[role], 0);
  let cursor = draw * total;
  for (const role of roles) {
    cursor -= weights[role];
    if (cursor <= 0) return role;
  }
  return 'thin';
}

/** Has the player earned the layer this growth carries? */
export function isEarned(role: GrowthRole, track: Readonly<TrackState> | undefined): boolean {
  if (!track) return false;
  const layer = ROLE_LAYER[role];
  if (layer === 'kick' || layer === 'hats' || layer === 'snare') return track.drums[layer].unlocked;
  return track[layer].unlocked;
}

export const FOREST_GRID = {
  /** World size of one placement cell. */
  cellSize: 26,
  /** Cells of forest kept around the player in each direction. */
  radiusInCells: 9,
  /** Growths this big or taller are solid obstacles (user decision). */
  solidHeight: 26,
} as const;

/**
 * Everything standing in one cell. Pure: the same cell always grows the same
 * forest, so flying away and back finds the world unchanged.
 */
export function growthsInCell(
  seed: number,
  cx: number,
  cz: number,
  ecology: Ecology,
  track: Readonly<TrackState> | undefined,
): Growth[] {
  const count = Math.round(ecology.density * 7);
  const growths: Growth[] = [];
  for (let i = 0; i < count; i++) {
    const role = roleFor(ecology, cellRandom(seed, cx, cz, i * 7 + 1));
    const jx = cellRandom(seed, cx, cz, i * 7 + 2);
    const jz = cellRandom(seed, cx, cz, i * 7 + 3);
    const size = cellRandom(seed, cx, cz, i * 7 + 4);
    const phase = cellRandom(seed, cx, cz, i * 7 + 5);
    const wobble = (cellRandom(seed, cx, cz, i * 7 + 6) - 0.5) * ecology.irregularity;

    // Role decides the band and the proportions; ecology scales them.
    const base =
      role === 'giant' ? 34 : role === 'trunk' ? 14 : role === 'thin' ? 9 : role === 'canopy' ? 5 : role === 'root' ? 7 : role === 'branch' ? 6 : 2;
    const height = base * (0.6 + size * 0.8) * ecology.heightScale;
    const radius =
      role === 'giant' ? 3.4 : role === 'trunk' ? 1.1 : role === 'thin' ? 0.22 : role === 'canopy' ? 2.6 : role === 'root' ? 0.7 : role === 'branch' ? 0.45 : 0.3;
    const lift =
      role === 'canopy' ? 16 + size * 12 : role === 'root' ? -6 - size * 5 : role === 'spore' ? 4 + size * 18 : 0;

    growths.push({
      role,
      x: (cx + jx) * FOREST_GRID.cellSize,
      z: (cz + jz) * FOREST_GRID.cellSize,
      height,
      radius: radius * (1 + wobble * 0.5),
      lift,
      phase,
      earned: isEarned(role, track),
      solid: height >= FOREST_GRID.solidHeight,
    });
  }
  return growths;
}
