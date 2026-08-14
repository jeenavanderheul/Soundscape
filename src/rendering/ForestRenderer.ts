import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TrackGenre } from '../music/TrackState';

/**
 * §36: draws the forest the ecology decided on, in ONE instanced mesh.
 *
 * The field follows the player by whole cells, so growths never pop in front
 * of the camera — they are already standing when they come into view, and
 * flying back finds exactly the same forest. Potential growths are thin and
 * dim; earned ones stand at full size and brightness, so the world visibly
 * records what the player took from it.
 */

export const FOREST_RENDER = {
  maxInstances: 1400,
  /** Dim, half-size: what this place COULD give you. */
  potentialScale: 0.45,
  /**
   * §135: a potential growth used to be near-black, which was readable while
   * the forest was additive glow — dim meant faint. Lit and solid, near-black
   * means invisible, so what a place COULD give you has to stay a visible
   * shape and only lose its colour.
   */
  potentialBrightness: 0.55,
  swayAmplitude: 0.06,
} as const;

/**
 * §55/§135: one geometry per shape language — and each one is a SILHOUETTE,
 * not a primitive.
 *
 * A single open-ended cone is why ten worlds read as the same forest: it has no
 * cap, no second mass, nothing to catch the light on one side. Every form here
 * is two or three parts merged into one buffer, so it still costs one draw call
 * per shape language but has a stem and a crown to tell apart. They stay
 * abstract line work (§13) — a mast, a blade, a frond — never a literal tree.
 */
function formGeometry(form: FormName): BufferGeometry {
  switch (form) {
    case 'pillar': {
      // Machined mast: hexagonal shaft, capped, with a collar near the top.
      const shaft = new CylinderGeometry(0.16, 0.22, 1, 6);
      shaft.translate(0, 0.5, 0);
      const collar = new CylinderGeometry(0.4, 0.4, 0.05, 6);
      collar.translate(0, 0.82, 0);
      const foot = new CylinderGeometry(0.34, 0.4, 0.08, 6);
      foot.translate(0, 0.04, 0);
      return merged([shaft, collar, foot]);
    }
    case 'blade': {
      // A flat panel standing on a thin edge: all silhouette, no volume.
      const panel = new BoxGeometry(0.7, 1, 0.06);
      panel.translate(0, 0.5, 0);
      const spine = new BoxGeometry(0.06, 1.06, 0.16);
      spine.translate(0, 0.53, 0);
      return merged([panel, spine]);
    }
    case 'shard': {
      // Splintered: a main spike with a smaller one broken off beside it.
      const main = new ConeGeometry(0.34, 1, 3);
      main.translate(0, 0.5, 0);
      const splinter = new ConeGeometry(0.16, 0.55, 3);
      splinter.rotateZ(0.4);
      splinter.translate(0.22, 0.3, 0.05);
      return merged([main, splinter]);
    }
    case 'spire': {
      // Tapered mass under a needle — reads tall from any distance.
      const body = new ConeGeometry(0.42, 0.8, 5);
      body.translate(0, 0.4, 0);
      const needle = new ConeGeometry(0.1, 0.45, 4);
      needle.translate(0, 0.95, 0);
      return merged([body, needle]);
    }
    case 'arch': {
      // Half a ring standing up, on two feet: a colonnade, a hall, a doorway.
      const bow = new TorusGeometry(0.5, 0.07, 6, 14, Math.PI);
      bow.translate(0, 0.5, 0);
      const left = new CylinderGeometry(0.08, 0.1, 0.5, 5);
      left.translate(-0.5, 0.25, 0);
      const right = left.clone();
      right.translate(1, 0, 0);
      return merged([bow, left, right]);
    }
    case 'membrane': {
      // A closed dome with a rim: air with a skin over it.
      const dome = new SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.5);
      dome.translate(0, 0.5, 0);
      const rim = new TorusGeometry(0.5, 0.035, 5, 14);
      rim.rotateX(Math.PI / 2);
      rim.translate(0, 0.5, 0);
      const stem = new CylinderGeometry(0.05, 0.07, 0.5, 5);
      stem.translate(0, 0.25, 0);
      return merged([dome, rim, stem]);
    }
    case 'ring': {
      // A hoop held off the ground: displacement, something skipping a step.
      const hoop = new TorusGeometry(0.42, 0.06, 6, 14);
      hoop.rotateX(Math.PI / 2);
      hoop.translate(0, 0.85, 0);
      const stem = new CylinderGeometry(0.05, 0.08, 0.85, 5);
      stem.translate(0, 0.42, 0);
      return merged([hoop, stem]);
    }
    case 'frond': {
      // The one growth with limbs: a stem and three blades splayed off it.
      const stem = new CylinderGeometry(0.05, 0.09, 0.75, 5);
      stem.translate(0, 0.38, 0);
      const parts: BufferGeometry[] = [stem];
      for (let i = 0; i < 3; i++) {
        const leaf = new ConeGeometry(0.16, 0.6, 4);
        leaf.rotateZ(0.9);
        leaf.rotateY((i / 3) * Math.PI * 2);
        leaf.translate(0, 0.8, 0);
        parts.push(leaf);
      }
      return merged(parts);
    }
    case 'monolith':
    default: {
      // Mass. No curve anywhere — a slab with a smaller slab stepped on top.
      const base = new BoxGeometry(0.8, 0.75, 0.8);
      base.translate(0, 0.375, 0);
      const step = new BoxGeometry(0.5, 0.3, 0.5);
      step.translate(0.08, 0.88, -0.05);
      return merged([base, step]);
    }
  }
}

/** One buffer per shape language: many parts, still one draw call (§22). */
function merged(parts: BufferGeometry[]): BufferGeometry {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return geometry ?? parts[0]!;
}

const FORM_NAMES: readonly FormName[] = [
  'pillar', 'shard', 'spire', 'arch', 'membrane', 'ring', 'monolith', 'blade', 'frond',
];

export class ForestRenderer {
  /** All the shape languages; the Game adds this to the scene. */
  readonly group = new Group();
  private readonly meshes = new Map<FormName, InstancedMesh>();
  private readonly seedNumber: number;
  private growths: Growth[] = [];
  private readonly matrix = new Matrix4();
  private readonly quaternion = new Quaternion();
  private readonly axis = new Vector3(1, 0, 0);
  private readonly up = new Vector3(0, 1, 0);
  private readonly spin = new Quaternion();
  private readonly scale = new Vector3();
  private readonly position = new Vector3();
  private readonly color = new Color();
  private cellX = Number.NaN;
  private cellZ = Number.NaN;
  private ecology: Ecology = ecologyFor(null);
  private tint = new Color(0.5, 0.58, 0.6);
  private pulse = 0;
  private groundAt: (x: number, z: number) => number = () => -6;

  constructor(seed: string) {
    this.seedNumber = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
    // One tapered form for everything: a spire read as trunk, needle, root,
    // branch or canopy purely through scale (§13 — abstract, never literal).
    // §135: the forest was additive and depth-less, which is exactly why it
    // did not feel three-dimensional — growths shone through each other and
    // through the terrain, and no surface had a dark side. Now it is lit and
    // solid: it occludes, it catches the key light on one face, and the fog
    // carries it into the distance.
    // NOTE: no `vertexColors`. Per-growth colour rides on the InstancedMesh's
    // instanceColor, which three applies on its own. Turning vertexColors on as
    // well makes the shader read a `color` attribute the merged geometry does
    // not have — WebGL then feeds it black and the whole forest renders as
    // silhouettes, lit and shaded but pure black.
    this.material = new MeshLambertMaterial({
      fog: true,
    });
    for (const form of FORM_NAMES) {
      const mesh = new InstancedMesh(formGeometry(form), this.material, FOREST_RENDER.maxInstances);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.meshes.set(form, mesh);
      this.group.add(mesh);
    }
  }

  private readonly material: MeshLambertMaterial;
  /** §55 user decision: the deeper into a world you are, the bigger it grows. */
  private depth = 0;

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
      this.rebuild(track);
    } else if (track) {
      // Cheap: earning a layer only flips flags, it does not move the forest.
      for (const growth of this.growths) {
        growth.earned = growth.earned || isEarnedNow(growth, track);
      }
    }
    this.draw(elapsedSeconds);
  }

  private rebuild(track: Readonly<TrackState> | undefined): void {
    const r = FOREST_GRID.radiusInCells;
    const next: Growth[] = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue; // a disc, not a square
        for (const growth of growthsInCell(
          this.seedNumber,
          this.cellX + dx,
          this.cellZ + dz,
          this.ecology,
          track,
        )) {
          if (next.length >= FOREST_RENDER.maxInstances) break;
          next.push(growth);
        }
      }
    }
    this.growths = next;
  }

  private draw(elapsedSeconds: number): void {
    const count = Math.min(this.growths.length, FOREST_RENDER.maxInstances);
    const used = new Map<FormName, number>();
    // §55: the world grows with how deep into it you are.
    const depthScale = 0.75 + this.depth * 0.7;
    for (let i = 0; i < count; i++) {
      const g = this.growths[i]!;
      // Deterministic per growth: the same forest every time you come back.
      const form = g.phase < this.ecology.formBias
        ? this.ecology.forms[0]
        : this.ecology.forms[1];
      const mesh = this.meshes.get(form)!;
      const slot = used.get(form) ?? 0;
      used.set(form, slot + 1);
      const grown = g.earned ? 1 : FOREST_RENDER.potentialScale;
      const sway =
        Math.sin(elapsedSeconds * (0.4 + g.phase) + g.phase * 6.28) *
        FOREST_RENDER.swayAmplitude *
        this.ecology.motion;
      const ground = this.groundAt(g.x, g.z);
      this.position.set(g.x, ground + g.lift, g.z);
      this.scale.set(
        g.radius * 2 * grown * depthScale,
        g.height * grown * depthScale * (1 + this.pulse * 0.12),
        g.radius * 2 * grown * depthScale,
      );
      // Every growth faces its own way. Without this a hundred instances of
      // one silhouette line up like wallpaper, which reads as flat however
      // well they are lit.
      this.spin.setFromAxisAngle(this.up, g.phase * Math.PI * 2);
      this.quaternion.setFromAxisAngle(this.axis, sway).multiply(this.spin);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      mesh.setMatrixAt(slot, this.matrix);
      const brightness = g.earned ? 1 : FOREST_RENDER.potentialBrightness;
      this.color.copy(this.tint).multiplyScalar(brightness);
      mesh.setColorAt(slot, this.color);
    }
    for (const [form, mesh] of this.meshes) {
      mesh.count = used.get(form) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
    this.material.dispose();
  }
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
