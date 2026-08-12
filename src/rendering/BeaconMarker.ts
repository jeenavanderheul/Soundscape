import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  RingGeometry,
  TorusGeometry,
} from 'three';
import type { TrackLayerName } from '../music/TrackState';
import type { LayerBeacon } from '../world/LayerBeacons';

/**
 * §86: the layer, standing in the world.
 *
 * Each role gets its own colour and its own body, so the shape on the horizon
 * says WHICH part of the track is out there — a heavy low octahedron for the
 * kick, a thin bright ring for the hats. The halo is the collection radius
 * drawn honestly: what you see is what you have to fly through.
 */

const LOOK: Record<TrackLayerName, { color: number; scale: number }> = {
  kick: { color: 0xff4d3d, scale: 1.5 },
  bass: { color: 0xff8a2b, scale: 1.35 },
  snare: { color: 0xffd93d, scale: 1.15 },
  harmony: { color: 0x4dd6a0, scale: 1.05 },
  melody: { color: 0x4db4ff, scale: 0.95 },
  hats: { color: 0xc98bff, scale: 0.85 },
  texture: { color: 0xf0f4ff, scale: 1.2 },
};

export class BeaconMarker {
  readonly group = new Group();
  private readonly body: Mesh;
  private readonly halo: Mesh;
  private readonly ring: Mesh;
  private beacon: LayerBeacon | null = null;
  private spin = 0;

  constructor() {
    const material = () =>
      new MeshBasicMaterial({
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.85,
      });
    this.body = new Mesh(new OctahedronGeometry(2.4, 0), material());
    // The collection radius, drawn: fly inside it and the layer is yours.
    this.halo = new Mesh(new RingGeometry(8.4, 9, 48), material());
    (this.halo.material as MeshBasicMaterial).opacity = 0.22;
    this.ring = new Mesh(new TorusGeometry(4.2, 0.22, 8, 40), material());
    (this.ring.material as MeshBasicMaterial).opacity = 0.5;
    this.group.add(this.body, this.halo, this.ring);
    this.group.visible = false;
  }

  show(beacon: LayerBeacon | null): void {
    this.beacon = beacon;
    this.group.visible = beacon !== null;
    if (!beacon) return;
    const look = LOOK[beacon.layer];
    const color = new Color(look.color);
    for (const mesh of [this.body, this.halo, this.ring]) {
      (mesh.material as MeshBasicMaterial).color.copy(color);
    }
    this.body.scale.setScalar(look.scale);
    this.group.position.set(beacon.position.x, beacon.position.y, beacon.position.z);
  }

  /** Breathes and turns, so it reads as an invitation rather than scenery. */
  update(deltaSeconds: number, cameraY: number): void {
    if (!this.beacon) return;
    this.spin += deltaSeconds;
    this.body.rotation.y = this.spin * 0.9;
    this.body.rotation.x = this.spin * 0.4;
    this.ring.rotation.z = this.spin * 1.4;
    const breath = 1 + Math.sin(this.spin * 2.2) * 0.08;
    this.halo.scale.setScalar(breath);
    // The halo always faces the flight, or the radius reads as a line.
    this.halo.lookAt(this.group.position.x, cameraY, this.group.position.z + 1);
  }

  dispose(): void {
    for (const mesh of [this.body, this.halo, this.ring]) {
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
  }
}
