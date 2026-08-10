import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Line,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import type { Vec3Data } from '../player/FrequencyState';

/**
 * §29.6: every track layer gets a visual system, so the player can say
 * "that light line is my melody, those bridges are my harmony".
 *   melody  -> luminous trajectory trailing the player
 *   harmony -> connecting geometry between the sounding things
 * Both are pooled, fixed-size and allocation-free after construction (§13).
 */

const TRAIL_POINTS = 160;
const MAX_BRIDGES = 16;
/** Bridges connect neighbours, never opposite ends of the world (§13 restraint). */
const MAX_BRIDGE_LENGTH = 90;

/** The luminous path the player's pitch journey draws through the world. */
export class MelodyTrail {
  readonly line: Line;
  private readonly positions: Float32Array;
  private readonly attribute: BufferAttribute;
  private readonly material: LineBasicMaterial;
  private head = 0;
  private filled = 0;
  private sinceSampleMs = 0;
  private level = 0;

  constructor() {
    this.positions = new Float32Array(TRAIL_POINTS * 3);
    this.attribute = new BufferAttribute(this.positions, 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', this.attribute);
    geometry.setDrawRange(0, 0);
    this.material = new LineBasicMaterial({
      color: new Color(0.55, 0.85, 1),
      blending: AdditiveBlending,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.line = new Line(geometry, this.material);
    this.line.frustumCulled = false;
  }

  /** 0 = melody not yet earned (invisible), 1 = full luminous trajectory. */
  setLevel(level: number): void {
    this.level = Math.min(1, Math.max(0, level));
  }

  update(position: Vec3Data, dtSeconds: number): void {
    this.material.opacity = this.level * 0.75;
    if (this.level <= 0) {
      this.line.geometry.setDrawRange(0, 0);
      return;
    }
    this.sinceSampleMs += dtSeconds * 1000;
    if (this.sinceSampleMs >= 90) {
      this.sinceSampleMs = 0;
      const i = this.head * 3;
      this.positions[i] = position.x;
      this.positions[i + 1] = position.y;
      this.positions[i + 2] = position.z;
      this.head = (this.head + 1) % TRAIL_POINTS;
      this.filled = Math.min(TRAIL_POINTS, this.filled + 1);
      this.attribute.needsUpdate = true;
      // Draw only the contiguous run so the ring buffer never draws a seam.
      this.line.geometry.setDrawRange(0, this.filled === TRAIL_POINTS ? TRAIL_POINTS : this.head);
    }
  }

  reset(): void {
    this.head = 0;
    this.filled = 0;
    this.line.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    this.line.geometry.dispose();
    this.material.dispose();
  }
}

/** Harmony connects: thin bridges between the things that sound together. */
export class HarmonyBridges {
  readonly lines: LineSegments;
  private readonly positions: Float32Array;
  private readonly attribute: BufferAttribute;
  private readonly material: LineBasicMaterial;
  private level = 0;

  constructor() {
    this.positions = new Float32Array(MAX_BRIDGES * 6);
    this.attribute = new BufferAttribute(this.positions, 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', this.attribute);
    geometry.setDrawRange(0, 0);
    this.material = new LineBasicMaterial({
      color: new Color(0.7, 0.75, 1),
      blending: AdditiveBlending,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.lines = new LineSegments(geometry, this.material);
    this.lines.frustumCulled = false;
  }

  setLevel(level: number): void {
    this.level = Math.min(1, Math.max(0, level));
  }

  /** Anchors are the sounding things: resonators and born structures. */
  update(anchors: readonly Vec3Data[], player: Vec3Data): void {
    this.material.opacity = this.level * 0.45;
    if (this.level <= 0 || anchors.length === 0) {
      this.lines.geometry.setDrawRange(0, 0);
      return;
    }
    // Nearest anchors first: the harmony you can hear is the harmony you see.
    const sorted = [...anchors]
      .sort((a, b) => distance(a, player) - distance(b, player))
      .slice(0, MAX_BRIDGES);
    let segment = 0;
    for (let i = 0; i < sorted.length - 1 && segment < MAX_BRIDGES; i++) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      if (distance(a, b) > MAX_BRIDGE_LENGTH) continue;
      const o = segment * 6;
      this.positions[o] = a.x;
      this.positions[o + 1] = a.y;
      this.positions[o + 2] = a.z;
      this.positions[o + 3] = b.x;
      this.positions[o + 4] = b.y;
      this.positions[o + 5] = b.z;
      segment += 1;
    }
    this.attribute.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, segment * 2);
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.material.dispose();
  }
}

function distance(a: Vec3Data, b: Vec3Data): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
