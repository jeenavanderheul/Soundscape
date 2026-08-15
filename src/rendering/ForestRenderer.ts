import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Points,
  ShaderMaterial,
} from 'three';
import type { TrackState } from '../music/TrackState';
import type { Vec3Data } from '../player/FrequencyState';
import {
  ecologyFor,
  FOREST_GRID,
  growthsInCell,
  type Ecology,
  type FormName,
  type Growth,
} from './ForestEcology';
import type { TrackGenre } from '../music/TrackState';

/**
 * §137: THE FOREST IS A MEASUREMENT OF A REAL TREE.
 *
 * The shapes come from Kenney's Nature Kit (CC0), sampled offline into clouds
 * of surface points by `npm run trees:bake` — real proportions, real
 * silhouettes, which is the one thing hand-built primitives could not give.
 * Nothing about the model survives into the runtime: no glTF, no texture, no
 * material, only positions.
 *
 * They are drawn as points, never as surfaces (§136.4, user decision): a tree
 * reads because its points crowd at the silhouette, the way the reference does
 * it, and depth comes from occlusion and density instead of shading. Distance
 * costs points before it costs brightness (§136.13).
 *
 * HARD USER RULE: every tree stands on the ground. The baked clouds have their
 * base at y = 0 and the renderer places them at exactly the terrain height, so
 * floating is not something that can be tuned wrong — it has nowhere to come
 * from. `tests/unit/forestGrounded.test.ts` reads the uploaded attributes back.
 */

export const FOREST_RENDER = {
  /**
   * §137: a tree is ~1200 points, not eight triangles, so this ceiling is a
   * real budget: 920 growths is about 1.1 million points on screen. The disc
   * of cells around the player is filled nearest first, so what the cap cuts
   * is always the farthest.
   *
   * §144 (user): twice the forest. Raising this alone would only have doubled
   * the two worlds that were hitting it — the sparse ones are held back by
   * their own ecology, so `thinningAt` had to open up as well.
   */
  maxInstances: 920,
  /** Dim, half-size: what this place COULD give you. */
  potentialScale: 0.45,
  potentialBrightness: 0.55,
  swayAmplitude: 0.06,
  /**
   * Point size in pixels-times-units: the size on screen is this divided by
   * the distance, so a point is a fixed size in the WORLD and shrinks like
   * everything else. Roughly 4 cm at this scale — fine speckle, never a blob.
   */
  pointSize: 42,
} as const;

/**
 * §139: a world's PRIMARY growth is its own grown species (ez-tree, one per
 * world, in three stages), and its accent form stays a modelled Kenney tree.
 * Keeping both was the user's call, and it earns its keep: the grown species
 * carries the character of the world and changes as you earn it, the modelled
 * one is a fixed, harder shape standing between them.
 */
const KENNEY_FORM_SPECIES: Record<FormName, string> = {
  pillar: 'tall',
  blade: 'thin',
  shard: 'pine-tall',
  spire: 'pine-round',
  arch: 'plateau',
  membrane: 'fat',
  ring: 'pine-small',
  monolith: 'detailed',
  frond: 'detailed',
};

const FORM_NAMES: readonly FormName[] = [
  'pillar', 'shard', 'spire', 'arch', 'membrane', 'ring', 'monolith', 'blade', 'frond',
];

export interface TreeSpecies {
  id: string;
  /** Surface points, base at y = 0 and tip at y = 1. */
  points: Float32Array;
  /** Set on grown species: which world it belongs to and how far along it is. */
  world?: string | null;
  stage?: 'sapling' | 'half' | 'full' | null;
}

/** How far along a growth is drawn: nothing earned is a sapling (§139). */
export type GrowthStage = 'sapling' | 'half' | 'full';
const STAGES: readonly GrowthStage[] = ['sapling', 'half', 'full'];

/** Reads what `npm run trees:bake` wrote. Null is a valid world: no trees. */
export async function loadTreeSpecies(base = '/trees'): Promise<Map<string, TreeSpecies> | null> {
  try {
    const manifest = (await (await fetch(`${base}/trees.json`)).json()) as {
      species: {
        id: string;
        points: number;
        world?: string | null;
        stage?: 'sapling' | 'half' | 'full' | null;
      }[];
    };
    const loaded = new Map<string, TreeSpecies>();
    await Promise.all(
      manifest.species.map(async (entry) => {
        const buffer = await (await fetch(`${base}/${entry.id}.bin`)).arrayBuffer();
        if (buffer.byteLength !== entry.points * 12) return;
        loaded.set(entry.id, {
          id: entry.id,
          points: new Float32Array(buffer),
          world: entry.world ?? null,
          stage: entry.stage ?? null,
        });
      }),
    );
    return loaded.size > 0 ? loaded : null;
  } catch {
    return null;
  }
}

const VERTEX = /* glsl */ `
attribute vec3 iPosition;   // where this tree stands, world space
attribute float iScale;     // its height in world units
attribute float iPhase;     // its own randomness: spin, sway, which points survive
attribute vec3 iTint;
uniform float uTime;
uniform float uPulse;
uniform float uSize;
varying vec3 vTint;
varying float vFade;
varying float vSurvives;

void main() {
  // Every tree faces its own way. Without it, one silhouette repeated reads as
  // wallpaper however good the silhouette is.
  float a = iPhase * 6.2831;
  float c = cos(a);
  float s = sin(a);
  vec3 local = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c);
  // Sway grows with height up the tree: the base does not move, the crown does.
  float sway = sin(uTime * (0.4 + iPhase * 0.6) + iPhase * 6.2831) * ${FOREST_RENDER.swayAmplitude.toFixed(3)} * position.y;
  vec3 world = iPosition + local * iScale * (1.0 + uPulse * 0.04) + vec3(sway * iScale, 0.0, 0.0);

  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  float distance = -mv.z;
  // §136.13: distance costs INFORMATION first. Each point has its own place in
  // the queue, and the far a tree is, the fewer of them are still being sent.
  float keep = fract(sin(dot(position.xz, vec2(12.9898, 78.233)) + iPhase * 31.7) * 43758.5453);
  vSurvives = step(keep, clamp(1.25 - distance / 190.0, 0.0, 1.0));
  // NOT scaled by the tree: a point is a measurement, always the same size in
  // the world, or a big tree turns into cotton wool.
  gl_PointSize = clamp(uSize / max(1.0, distance), 1.0, 3.5);
  vFade = clamp(1.0 - distance / 240.0, 0.0, 1.0);
  vTint = iTint;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vTint;
varying float vFade;
varying float vSurvives;
void main() {
  if (vSurvives < 0.5) discard;
  // A round point with a hot centre: a measurement, not a sprite.
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  float core = 1.0 - r * 3.2;
  // Dim: the forest is made of density, not of brightness. Additive blending
  // does the rest where points crowd — which is exactly the silhouette.
  gl_FragColor = vec4(vTint * vFade * core * 0.4, 1.0);
}
`;

interface Cloud {
  points: Points;
  geometry: InstancedBufferGeometry;
  offsets: InstancedBufferAttribute;
  scales: InstancedBufferAttribute;
  phases: InstancedBufferAttribute;
  tints: InstancedBufferAttribute;
}

export class ForestRenderer {
  /** All the shape languages; the Game adds this to the scene. */
  readonly group = new Group();
  private readonly clouds = new Map<string, Cloud>();
  private readonly material: ShaderMaterial;
  private readonly seedNumber: number;
  private growths: Growth[] = [];
  private readonly color = new Color();
  private cellX = Number.NaN;
  private cellZ = Number.NaN;
  private ecology: Ecology = ecologyFor(null);
  private tint = new Color(0.5, 0.58, 0.6);
  private pulse = 0;
  private depth = 0;
  private species: Map<string, TreeSpecies> | null = null;
  private world: string | null | undefined = undefined;
  private groundAt: (x: number, z: number) => number = () => -6;

  constructor(seed: string) {
    this.seedNumber = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uSize: { value: FOREST_RENDER.pointSize },
      },
    });
  }

  /**
   * Hands the baked species over. Until this happens the forest is empty —
   * which is a legitimate world, not an error state.
   */
  setSpecies(species: Map<string, TreeSpecies>): void {
    this.species = species;
    for (const form of FORM_NAMES) {
      const source = species.get(KENNEY_FORM_SPECIES[form]);
      if (!source) continue;
      const geometry = new InstancedBufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(source.points, 3));
      const capacity = FOREST_RENDER.maxInstances;
      const offsets = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      const scales = new InstancedBufferAttribute(new Float32Array(capacity), 1);
      const phases = new InstancedBufferAttribute(new Float32Array(capacity), 1);
      const tints = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      for (const attribute of [offsets, scales, phases, tints]) attribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute('iPosition', offsets);
      geometry.setAttribute('iScale', scales);
      geometry.setAttribute('iPhase', phases);
      geometry.setAttribute('iTint', tints);
      geometry.instanceCount = 0;
      const points = new Points(geometry, this.material);
      points.frustumCulled = false;
      this.clouds.set(`kenney:${form}`, { points, geometry, offsets, scales, phases, tints });
      this.group.add(points);
    }
    // Three more clouds: the grown species of whichever world we are in, one
    // per stage. Their point buffer is swapped when the world changes.
    for (const stage of STAGES) {
      const cloud = this.makeCloud(new Float32Array(3));
      this.clouds.set(`stage:${stage}`, cloud);
      this.group.add(cloud.points);
    }
    this.cellX = Number.NaN; // whatever was placed, place it again with real trees
  }

  /** One instanced point cloud, ready to be filled. */
  private makeCloud(points: Float32Array): Cloud {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(points, 3));
    const capacity = FOREST_RENDER.maxInstances;
    const offsets = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    const scales = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    const phases = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    const tints = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    for (const attribute of [offsets, scales, phases, tints]) attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute('iPosition', offsets);
    geometry.setAttribute('iScale', scales);
    geometry.setAttribute('iPhase', phases);
    geometry.setAttribute('iTint', tints);
    geometry.instanceCount = 0;
    const mesh = new Points(geometry, this.material);
    mesh.frustumCulled = false;
    return { points: mesh, geometry, offsets, scales, phases, tints };
  }

  /**
   * Swaps the grown species in when the world changes. Called on a region
   * crossing, never per frame.
   */
  private useWorld(world: string | null): void {
    if (world === this.world) return;
    this.world = world;
    for (const stage of STAGES) {
      const cloud = this.clouds.get(`stage:${stage}`);
      if (!cloud) continue;
      const source = world ? this.species?.get(`${world}-${stage}`) : undefined;
      cloud.geometry.deleteAttribute('position');
      cloud.geometry.setAttribute('position', new BufferAttribute(source?.points ?? new Float32Array(3), 3));
      if (!source) cloud.geometry.instanceCount = 0;
    }
  }

  /** §55 user decision: the deeper into a world you are, the bigger it grows. */
  setDepth(value: number): void {
    this.depth = Math.min(1, Math.max(0, value));
  }

  setGroundSampler(sampler: (x: number, z: number) => number): void {
    this.groundAt = sampler;
  }

  /** §33: the forest takes the colour of its region. */
  setTint(color: { r: number; g: number; b: number }): void {
    // Saturated: the forest is the second thing that names a world (§55).
    this.tint.setRGB(0.12 + color.r * 0.88, 0.12 + color.g * 0.88, 0.12 + color.b * 0.88);
  }

  setPulse(value: number): void {
    this.pulse = value;
  }

  /** The formations big enough to stop the orb (§36: only the largest). */
  solidObstacles(): readonly Growth[] {
    return this.growths.filter((g) => g.solid);
  }

  /**
   * Rebuilds only when the player crosses into a new cell, or when the region
   * or the earned track changes — never per frame.
   */
  update(
    position: Vec3Data,
    genre: TrackGenre,
    track: Readonly<TrackState> | undefined,
    elapsedSeconds: number,
  ): void {
    const cx = Math.floor(position.x / FOREST_GRID.cellSize);
    const cz = Math.floor(position.z / FOREST_GRID.cellSize);
    const ecology = ecologyFor(genre);
    if (cx !== this.cellX || cz !== this.cellZ || ecology !== this.ecology) {
      this.cellX = cx;
      this.cellZ = cz;
      this.ecology = ecology;
      this.useWorld(genre);
      this.rebuild(track);
    } else if (track) {
      // Cheap: earning a layer only flips flags, it does not move the forest.
      for (const growth of this.growths) {
        growth.earned = growth.earned || isEarnedNow(growth, track);
      }
    }
    this.material.uniforms['uTime']!.value = elapsedSeconds;
    this.material.uniforms['uPulse']!.value = this.pulse;
    this.draw();
  }

  /**
   * §140: fill NEAREST FIRST, and thin with distance.
   *
   * This used to walk the disc from dz = -r, so the moment the instance budget
   * ran out — and it ran out after about a quarter of the cells — every tree
   * the player had was standing on one far edge of the disc. The forest was
   * only ever visible on the horizon, and never where you were flying.
   *
   * Nearest-first alone would spend the whole budget in a tight ring and leave
   * the middle distance empty, so cells also keep a shrinking share of their
   * growths as they get further away: solid around the player, sparse towards
   * the edge, which is what a forest looks like anyway and what §136.13 asks
   * of distance. The share is decided by each growth's own phase, so it is
   * deterministic — the same trees survive every time you come back.
   */
  private rebuild(track: Readonly<TrackState> | undefined): void {
    const r = FOREST_GRID.radiusInCells;
    const cells: { dx: number; dz: number; distance: number }[] = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const distance = Math.hypot(dx, dz);
        if (distance > r) continue; // a disc, not a square
        cells.push({ dx, dz, distance });
      }
    }
    cells.sort((a, b) => a.distance - b.distance);

    const next: Growth[] = [];
    for (const cell of cells) {
      if (next.length >= FOREST_RENDER.maxInstances) break;
      const keep = thinningAt(cell.distance / r);
      for (const growth of growthsInCell(
        this.seedNumber,
        this.cellX + cell.dx,
        this.cellZ + cell.dz,
        this.ecology,
        track,
      )) {
        if (next.length >= FOREST_RENDER.maxInstances) break;
        if (growth.phase > keep) continue;
        next.push(growth);
      }
    }
    this.growths = next;
  }

  private draw(): void {
    if (this.clouds.size === 0) return;
    const used = new Map<string, number>();
    const depthScale = 0.75 + this.depth * 0.7;
    for (const growth of this.growths) {
      // §139: the world's own grown species is the primary growth; the accent
      // form stays a modelled tree, so a forest is one species repeated with a
      // second, harder shape standing between them.
      const key = growth.phase < this.ecology.formBias && this.world
        ? `stage:${stageFor(growth, this.depth)}`
        : `kenney:${this.ecology.forms[1]}`;
      const cloud = this.clouds.get(key);
      if (!cloud) continue;
      const slot = used.get(key) ?? 0;
      if (slot >= FOREST_RENDER.maxInstances) continue;
      used.set(key, slot + 1);

      const grown = growth.earned ? 1 : FOREST_RENDER.potentialScale;
      // HARD USER RULE: on the ground, always. The baked cloud has its base at
      // y = 0, so this is the whole guarantee.
      cloud.offsets.setXYZ(slot, growth.x, this.groundAt(growth.x, growth.z), growth.z);
      cloud.scales.setX(slot, growth.height * grown * depthScale);
      cloud.phases.setX(slot, growth.phase);
      const brightness = growth.earned ? 1 : FOREST_RENDER.potentialBrightness;
      this.color.copy(this.tint).multiplyScalar(brightness);
      cloud.tints.setXYZ(slot, this.color.r, this.color.g, this.color.b);
    }
    for (const [key, cloud] of this.clouds) {
      cloud.geometry.instanceCount = used.get(key) ?? 0;
      cloud.offsets.needsUpdate = true;
      cloud.scales.needsUpdate = true;
      cloud.phases.needsUpdate = true;
      cloud.tints.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const cloud of this.clouds.values()) cloud.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * Share of a cell's growths that survive, by how far out the cell is (0 at the
 * player, 1 at the rim). Everything close stands; the rim keeps a sixth.
 */
export function thinningAt(distance01: number): number {
  const t = distance01 < 0 ? 0 : distance01 > 1 ? 1 : distance01;
  // Two things are being bought at once and they compete: density near the
  // player, and a forest that still reaches the far field. The cube gives the
  // near band its trees; the FLOOR is what keeps the rim alive, because the
  // budget is spent nearest first and whatever is left has to stretch. Raising
  // the floor from 0.035 to 0.09 is what pulled the treeline back out past 400
  // units after the budget doubled.
  const falloff = (1 - t) ** 3;
  return 0.09 + 0.91 * falloff;
}

/**
 * A growth shows what it has become: nothing earned is a sapling, an earned
 * layer is half grown, and staying long enough in a world to deepen it (§55)
 * finishes the tree.
 */
function stageFor(growth: Growth, depth: number): GrowthStage {
  if (!growth.earned) return 'sapling';
  return depth >= 0.5 ? 'full' : 'half';
}

function isEarnedNow(growth: Growth, track: Readonly<TrackState>): boolean {
  switch (growth.role) {
    case 'trunk':
      return track.drums.kick.unlocked;
    case 'thin':
      return track.drums.hats.unlocked;
    case 'giant':
      return track.drums.snare.unlocked;
    case 'root':
      return track.bass.unlocked;
    case 'canopy':
      return track.harmony.unlocked;
    case 'branch':
      return track.melody.unlocked;
    case 'spore':
      return track.texture.unlocked;
  }
}
