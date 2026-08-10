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
import { createRng } from '../core/rng';
import type { ResonatorData } from '../world/Resonator';

/**
 * Abstract forest (user direction): thin luminous spires that give the void
 * real 3D depth. Seeded and world-anchored; taller and colored near
 * resonators (zone palette: low=red, mid=purple, high=green), grey and
 * sparse in the open. Sways with the beat pulse — the forest listens.
 * One InstancedMesh, one draw call (§13 performance).
 */

export const FOREST_CONFIG = {
  count: 420,
  fieldRadius: 520,
  clusterBias: 0.6,
  minHeight: 3,
  maxHeight: 16,
  baseY: -6,
  swayAmplitude: 0.05,
  pulseGrowth: 0.18,
} as const;

function hzNorm(hz: number): number {
  if (hz <= 30) return 0;
  return Math.min(1, Math.log(hz / 30) / Math.log(8000 / 30));
}

const ZONE_LOW = new Color(1.0, 0.28, 0.22);
const ZONE_MID = new Color(0.62, 0.38, 1.0);
const ZONE_HIGH = new Color(0.5, 1.0, 0.4);
const ZONE_GREY = new Color(0.5, 0.58, 0.6);

export function zoneColor(hzn: number): Color {
  return hzn < 0.4
    ? ZONE_LOW.clone().lerp(ZONE_MID, hzn / 0.4)
    : ZONE_MID.clone().lerp(ZONE_HIGH, (hzn - 0.4) / 0.6);
}

interface Spire {
  x: number;
  z: number;
  height: number;
  phase: number;
  swaySpeed: number;
  lean: number;
  leanDir: number;
}

export class ForestSystem {
  readonly mesh: InstancedMesh;
  private readonly spires: Spire[] = [];
  private readonly matrix = new Matrix4();
  private readonly quaternion = new Quaternion();
  private readonly axis = new Vector3();
  private readonly scale = new Vector3();
  private readonly position = new Vector3();
  private pulse = 0;

  constructor(seed: string, resonators: readonly ResonatorData[]) {
    const rng = createRng(`${seed}:forest`);
    const cfg = FOREST_CONFIG;
    const geometry = new ConeGeometry(0.16, 1, 4, 3, true);
    geometry.translate(0, 0.5, 0); // pivot at the base: trees grow upward
    const material = new MeshBasicMaterial({
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.5,
    });
    this.mesh = new InstancedMesh(geometry, material, cfg.count);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    for (let i = 0; i < cfg.count; i++) {
      // Cluster part of the forest around resonators; scatter the rest.
      const nearResonator = resonators.length > 0 && rng.next() < cfg.clusterBias;
      let x: number;
      let z: number;
      let anchor: ResonatorData | null = null;
      if (nearResonator) {
        anchor = resonators[Math.floor(rng.next() * resonators.length)]!;
        const angle = rng.next() * Math.PI * 2;
        const dist = 8 + rng.next() * 55;
        x = anchor.position.x + Math.cos(angle) * dist;
        z = anchor.position.z + Math.sin(angle) * dist;
      } else {
        const angle = rng.next() * Math.PI * 2;
        const dist = Math.sqrt(rng.next()) * cfg.fieldRadius;
        x = Math.cos(angle) * dist;
        z = Math.sin(angle) * dist;
      }
      const heightBoost = anchor ? 1 + (1 - hzNorm(anchor.baseHz)) * 0.8 : 1;
      const height =
        (cfg.minHeight + rng.next() * (cfg.maxHeight - cfg.minHeight)) * heightBoost;
      this.spires.push({
        x,
        z,
        height,
        phase: rng.next() * Math.PI * 2,
        swaySpeed: 0.4 + rng.next() * 0.8,
        lean: rng.next() * 0.12,
        leanDir: rng.next() * Math.PI * 2,
      });
      const color = anchor
        ? zoneColor(hzNorm(anchor.baseHz)).lerp(ZONE_GREY, 0.35)
        : ZONE_GREY.clone().multiplyScalar(0.6 + rng.next() * 0.5);
      this.mesh.setColorAt(i, color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.updateMatrices(0);
  }

  /** §33: the forest takes the colour of the region it stands in. */
  setTint(color: { r: number; g: number; b: number }): void {
    // Lifted toward white so trunks stay visible against a coloured horizon.
    (this.mesh.material as MeshBasicMaterial).color.setRGB(
      0.35 + color.r * 0.65,
      0.35 + color.g * 0.65,
      0.35 + color.b * 0.65,
    );
  }

  /** BeatSync hook (§12): the whole forest breathes on the beat. */
  setPulse(value: number): void {
    this.pulse = value;
  }

  update(elapsedSeconds: number): void {
    this.updateMatrices(elapsedSeconds);
  }

  private updateMatrices(t: number): void {
    const cfg = FOREST_CONFIG;
    for (let i = 0; i < this.spires.length; i++) {
      const s = this.spires[i]!;
      const sway = Math.sin(t * s.swaySpeed + s.phase) * cfg.swayAmplitude;
      this.axis.set(Math.cos(s.leanDir), 0, Math.sin(s.leanDir));
      this.quaternion.setFromAxisAngle(this.axis, s.lean + sway);
      const grow = 1 + this.pulse * cfg.pulseGrowth;
      this.scale.set(1, s.height * grow, 1);
      this.position.set(s.x, cfg.baseY, s.z);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.mesh.dispose();
  }
}
