import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { TrackState } from '../music/TrackState';
import type { Vec3Data } from '../player/FrequencyState';
import {
  ecologyFor,
  FOREST_GRID,
  growthsInCell,
  type Ecology,
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

export class ForestRenderer {
  readonly mesh: InstancedMesh;
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
    const geometry = new ConeGeometry(0.5, 1, 5, 1, true);
    geometry.translate(0, 0.5, 0);
    const material = new MeshBasicMaterial({
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.75,
      vertexColors: true,
    });
    this.mesh = new InstancedMesh(geometry, material, FOREST_RENDER.maxInstances);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
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
    for (let i = 0; i < count; i++) {
      const g = this.growths[i]!;
      const grown = g.earned ? 1 : FOREST_RENDER.potentialScale;
      const sway =
        Math.sin(elapsedSeconds * (0.4 + g.phase) + g.phase * 6.28) *
        FOREST_RENDER.swayAmplitude *
        this.ecology.motion;
      const ground = this.groundAt(g.x, g.z);
      this.position.set(g.x, ground + g.lift, g.z);
      this.scale.set(
        g.radius * 2 * grown,
        g.height * grown * (1 + this.pulse * 0.12),
        g.radius * 2 * grown,
      );
      this.quaternion.setFromAxisAngle(this.axis, sway);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      const brightness = g.earned ? 1 : FOREST_RENDER.potentialBrightness;
      this.color.copy(this.tint).multiplyScalar(brightness);
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
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
