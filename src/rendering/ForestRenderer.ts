import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
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
  potentialBrightness: 0.22,
  swayAmplitude: 0.06,
} as const;

/**
 * §55: one geometry per shape language, each in its own instanced mesh. Seven
 * primitives cover ten worlds, because a world is a MIX of two of them — and
 * seven draw calls is nothing next to a mesh per growth (§22).
 */
function formGeometry(form: FormName): BufferGeometry {
  switch (form) {
    case 'pillar': {
      // Straight, hexagonal, machined: it does not taper and it does not lean.
      const g = new CylinderGeometry(0.42, 0.5, 1, 6, 1, true);
      g.translate(0, 0.5, 0);
      return g;
    }
    case 'shard': {
      // Three sides and all edge — velocity you can cut yourself on.
      const g = new ConeGeometry(0.42, 1, 3, 1, true);
      g.translate(0, 0.5, 0);
      return g;
    }
    case 'arch': {
      // Half a ring standing up: a colonnade, a hall, a doorway.
      const g = new TorusGeometry(0.5, 0.05, 3, 10, Math.PI);
      g.translate(0, 0.5, 0);
      g.scale(1, 1, 1);
      return g;
    }
    case 'membrane': {
      // An open dome — air with a skin on it.
      const g = new SphereGeometry(0.5, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.5);
      g.translate(0, 0.5, 0);
      return g;
    }
    case 'ring': {
      // A hoop off the ground: displacement, something skipping a step.
      const g = new TorusGeometry(0.45, 0.04, 3, 12);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0.7, 0);
      return g;
    }
    case 'monolith': {
      // Mass. No curve anywhere.
      const g = new BoxGeometry(0.8, 1, 0.8);
      g.translate(0, 0.5, 0);
      return g;
    }
    case 'spire':
    default: {
      const g = new ConeGeometry(0.5, 1, 5, 1, true);
      g.translate(0, 0.5, 0);
      return g;
    }
  }
}

const FORM_NAMES: readonly FormName[] = [
  'pillar', 'shard', 'spire', 'arch', 'membrane', 'ring', 'monolith',
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
    this.material = new MeshBasicMaterial({
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.75,
      vertexColors: true,
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

  private readonly material: MeshBasicMaterial;
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
    this.tint.setRGB(0.35 + color.r * 0.65, 0.35 + color.g * 0.65, 0.35 + color.b * 0.65);
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
      this.quaternion.setFromAxisAngle(this.axis, sway);
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
