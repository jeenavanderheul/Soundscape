import {
  AdditiveBlending,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { ResonatorData } from '../world/Resonator';
import { zoneColor } from './zonePitchColor';

/**
 * Visible resonator cores (user decision): each remote frequency glows as a
 * soft breathing sphere in its zone color, so the eye can confirm what the
 * ear already found. Sound stays the primary waypoint (§P1); this is the
 * visual assist layer.
 */
export class ResonatorMarkers {
  readonly mesh: InstancedMesh;
  private readonly data: ResonatorData[];
  private readonly matrix = new Matrix4();
  private readonly quaternion = new Quaternion();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private pulse = 0;

  constructor(resonators: readonly ResonatorData[]) {
    this.data = [...resonators];
    const geometry = new IcosahedronGeometry(1.4, 2);
    const material = new MeshBasicMaterial({
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.7,
    });
    this.mesh = new InstancedMesh(geometry, material, Math.max(this.data.length, 16));
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = this.data.length;
    this.mesh.frustumCulled = false;
    this.data.forEach((r, i) => {
      const hzn = Math.min(1, Math.log(Math.max(r.baseHz, 30) / 30) / Math.log(8000 / 30));
      this.mesh.setColorAt(i, zoneColor(hzn));
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** A player-created resonator (§17 composer) also gets a core. */
  add(resonator: ResonatorData): void {
    if (this.data.length >= 16) return;
    this.data.push(resonator);
    this.mesh.count = this.data.length;
    const hzn = Math.min(1, Math.log(Math.max(resonator.baseHz, 30) / 30) / Math.log(8000 / 30));
    this.mesh.setColorAt(this.data.length - 1, zoneColor(hzn));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  setPulse(value: number): void {
    this.pulse = value;
  }

  update(elapsedSeconds: number): void {
    for (let i = 0; i < this.data.length; i++) {
      const r = this.data[i]!;
      // Each core breathes at its own pitch-derived rate; beats swell it.
      const breathe = 1 + Math.sin(elapsedSeconds * (0.6 + (r.baseHz % 7) * 0.12)) * 0.15;
      const s = breathe * (1 + this.pulse * 0.4);
      this.position.set(r.position.x, r.position.y, r.position.z);
      this.scale.set(s, s, s);
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
