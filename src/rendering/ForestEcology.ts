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

/**
 * HARD USER RULE (2026-08-15): growths ALWAYS stand on the ground. Never
 * floating, in any role, for any reason. That is why there is no vertical
 * offset on a growth at all — a field that can lift something off the terrain
 * is a field that eventually will. Canopy and spore say what they are through
 * their size and their shape, not by hanging in the air.
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
export type FormName =
  | 'pillar'
  | 'shard'
  | 'spire'
  | 'arch'
  | 'membrane'
  | 'ring'
  | 'monolith'
  | 'blade'
  | 'frond';

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
    // §135: masts with flat blades hung off them — the machine forest is the
    // one world where nothing is organic, and it must read that way from far.
    forms: ['pillar', 'blade'],
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
  'heavy-signal': {
    name: 'the redline',
    forms: ['spire', 'monolith'],
    formBias: 0.7,
    density: 1.15,
    heightScale: 1.35,
    irregularity: 0.32,
    motion: 0.5,
    mix: { trunk: 0.42, thin: 0.3, canopy: 0.16, branch: 0.12 },
  },
  'broken-machine': {
    name: 'the broken machine',
    forms: ['shard', 'arch'],
    formBias: 0.55,
    density: 0.95,
    heightScale: 0.85,
    irregularity: 0.68,
    motion: 0.75,
    mix: { trunk: 0.3, thin: 0.4, canopy: 0.12, branch: 0.18 },
  },
  'percussion-riot': {
    name: 'the riot',
    // §135: the only world that grows something leaf-like — the riot is noise
    // and limbs where the others are geometry.
    forms: ['frond', 'ring'],
    formBias: 0.5,
    density: 1.35,
    heightScale: 0.7,
    irregularity: 0.55,
    motion: 0.9,
    mix: { trunk: 0.24, thin: 0.34, canopy: 0.3, branch: 0.12 },
  },
  'void-crusher': {
    name: 'the void',
    forms: ['arch', 'pillar'],
    formBias: 0.8,
    density: 0.6,
    heightScale: 1.5,
    irregularity: 0.18,
    motion: 0.25,
    mix: { trunk: 0.5, thin: 0.14, canopy: 0.26, branch: 0.1 },
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

/**
 * §179 (user: "de bomen moeten twee keer zo groot zijn als de mensen").
 *
 * The role bases below are written in tree-units: a trunk is 14, a giant is 34,
 * and those proportions are the forest. This multiplies the whole forest into
 * world units and is the ONLY place its overall size is decided — every
 * relative height, radius, spacing and threshold is expressed against it, so
 * the forest can be resized without any of them drifting apart.
 *
 * The number comes from the crowd: a dancer is CROWD_CONFIG.height = 140 world
 * units and a typical tree has to be twice that, 280.
 *
 * Calibrated against what is actually DRAWN, not against a hand-picked trunk:
 * measured over 343 growths the median raw height is 12.67 per unit of this
 * constant, and a tree in an untouched world is drawn at potentialScale 0.8 ×
 * the 0.75 floor of the depth scale. 280 / (12.67 × 0.8 × 0.75) ≈ 37. Picking
 * the median rather than a trunk matters: an earlier 13 put the typical tree at
 * 0.7 of a dancer while the arithmetic for one chosen tree said 2.0.
 *
 * This is the ratio in a world nothing has been earned in yet. Trees still grow
 * past it as a track deepens — the forest reaching beyond the crowd is the
 * reward, not the baseline.
 */
export const GROWTH_SCALE = 37;

/**
 * §179b (user: "alle bomen in elke genre moeten altijd 2:1 verhouding
 * krijgen").
 *
 * A single multiplier could only ever put the MIDDLE of the forest at 2:1.
 * Measured per world, drawn, against a dancer of 140, that is what it did:
 * techno sat at a median of 1.92 but percussion-riot at 0.28 and the broken
 * machine at 0.35, and the small roles — spore (base 2), canopy (5), branch (6)
 * — were dwarves in every world at 0.13–0.42. Multiplying harder does not fix
 * that: the distribution is 60:1 wide, so any scale that lifts the smallest
 * growth above the crowd sends the giants past ten dancers.
 *
 * So the height is no longer a multiplication. It is a FLOOR plus what the role
 * and the world add on top:
 *
 *   height = GROWTH_FLOOR + roleAndWorld × GROWTH_VARIATION
 *
 * The floor is where 2:1 is guaranteed — every growth, every role, every
 * ecology, no exceptions and no clamping (a clamp would flatten everything
 * underneath it into one identical height; an offset keeps every difference,
 * just above the crowd instead of below it).
 *
 * What this costs, said plainly: the forest's internal spread compresses from
 * about 60:1 to about 3.5:1, and the ten worlds' `heightScale` (0.5–1.6) now
 * separates their medians by roughly 40% instead of by 7×. Both cannot be had
 * at once — a guaranteed floor and an untouched spread are the same knob. The
 * variation weight below is set as high as it can go before the giants stop
 * being trees, so what is left of the difference is as wide as the floor
 * allows.
 */
/** Drawn at potentialScale 0.8 × the 0.75 floor of the depth scale. */
const DRAWN_FRACTION = 0.6;
/** CROWD_CONFIG.height. Copied, not imported: this module must stay free of the renderer. */
const DANCER_HEIGHT = 140;
/** The shortest growth that can exist: exactly two dancers once drawn. */
export const GROWTH_FLOOR = (2 * DANCER_HEIGHT) / DRAWN_FRACTION;
/** World units added per tree-unit of role × ecology, on top of the floor. */
export const GROWTH_VARIATION = GROWTH_SCALE * 0.5;

export const FOREST_GRID = {
  /**
   * World size of one placement cell. Scaled with the forest: trees ten times
   * bigger standing the same 26 units apart is a wall, not a forest, so the
   * spacing between them keeps its proportion to their size.
   */
  cellSize: 26 * GROWTH_SCALE,
  /**
   * Cells of forest kept around the player in each direction. §140: reaches
   * further than it used to (234 → 416 units) now that the terrain itself
   * reaches a horizon — the budget is protected by thinning with distance, not
   * by a short radius.
   */
  radiusInCells: 16,
  /**
   * Growths this big or taller are solid obstacles (user decision). Scaled with
   * the forest so exactly the same formations stay solid — an unscaled
   * threshold would turn every sapling into a wall the orb bounces off.
   */
  solidHeight: 26 * GROWTH_SCALE,
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
    const spread = base * (0.6 + size * 0.8) * ecology.heightScale;
    const height = GROWTH_FLOOR + spread * GROWTH_VARIATION;
    // Slenderness, not thickness: how wide this role is PER UNIT OF ITS HEIGHT.
    // The baked cloud is scaled uniformly by the height, so a fixed radius on a
    // growth that now starts at the floor would describe a needle where the
    // screen shows a tree — and it is this radius the orb bounces off.
    const slenderness =
      role === 'giant' ? 3.4 / 34 : role === 'trunk' ? 1.1 / 14 : role === 'thin' ? 0.22 / 9 : role === 'canopy' ? 2.6 / 5 : role === 'root' ? 0.7 / 7 : role === 'branch' ? 0.45 / 6 : 0.3 / 2;
    const radius = height * slenderness;
    growths.push({
      role,
      x: (cx + jx) * FOREST_GRID.cellSize,
      z: (cz + jz) * FOREST_GRID.cellSize,
      height,
      radius: radius * (1 + wobble * 0.5),
      phase,
      earned: isEarned(role, track),
      solid: height >= FOREST_GRID.solidHeight,
    });
  }
  return growths;
}
