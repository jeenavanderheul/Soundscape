import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  ShaderMaterial,
} from 'three';
import type { Vec3Data } from '../player/FrequencyState';

/**
 * The trail the orb leaves (user decision): a jet of light behind it, longer
 * and brighter the faster you fly, and it whips as you turn because it is made
 * of where you HAVE been, not of where you are pointing.
 *
 * A ribbon of `SAMPLES` past positions, two vertices each, tapering to nothing
 * at the tail. One mesh, one material, no allocation per frame (§22).
 */
const SAMPLES = 64;
/** Distance the orb must travel before the ribbon takes another sample. */
const SAMPLE_STEP = 0.6;
/** Half-width at the head, in world units, before speed and growth scale it. */
const HALF_WIDTH = 0.5;
/**
 * §131: the ribbon runs BEHIND the orb and the chase camera sits behind the
 * orb too, so the tail runs straight through the lens — 38 units of trail
 * against a camera 7 units back. A ribbon two units wide passing half a unit
 * from the camera is not a trail, it is a wedge across the whole viewport, and
 * the quad that straddles the near plane smears over everything. So the width
 * closes with the distance to the camera: constant angular thickness, nothing
 * at all at the lens, and the samples behind it collapse to zero area.
 */
const CAMERA_FADE = 8;

/** Half-width of one rib, `age01` 0 at the head and 1 at the tail (§131). */
export function trailHalfWidth(headHalfWidth: number, age01: number, cameraDistance: number): number {
  const near = Math.min(1, Math.max(0, cameraDistance / CAMERA_FADE));
  return headHalfWidth * (1 - age01) * near;
}

const VERTEX = /* glsl */ `
attribute float aAge;   // 0 at the head, 1 at the tail
varying float vAge;
void main() {
  vAge = aAge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying float vAge;
void main() {
  // Hot at the orb, gone at the tail — the falloff is what reads as speed.
  float fade = pow(1.0 - vAge, 2.2);
  gl_FragColor = vec4(uColor * fade * uIntensity, fade);
}
`;

export class OrbTrail {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly positions: Float32Array;
  private readonly geometry: BufferGeometry;
  /** Ring of past positions, newest first. */
  private readonly history: Vec3Data[] = [];
  private last: Vec3Data = { x: 0, y: 0, z: 0 };

  constructor() {
    this.geometry = new BufferGeometry();
    this.positions = new Float32Array(SAMPLES * 2 * 3);
    const ages = new Float32Array(SAMPLES * 2);
    const indices: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const age = i / (SAMPLES - 1);
      ages[i * 2] = age;
      ages[i * 2 + 1] = age;
      if (i < SAMPLES - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aAge', new BufferAttribute(ages, 1));
    this.geometry.setIndex(indices);
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uColor: { value: [0.75, 0.9, 1] },
        uIntensity: { value: 0 },
      },
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  /**
   * `speed01` is 0..1 of full throttle and `growth` 0..1 of the track: a full
   * track at full speed leaves the longest, widest trail.
   */
  update(
    position: Vec3Data,
    velocity: Vec3Data,
    speed01: number,
    growth: number,
    cameraPosition: Vec3Data,
  ): void {
    const moved = Math.hypot(position.x - this.last.x, position.y - this.last.y, position.z - this.last.z);
    if (this.history.length === 0 || moved >= SAMPLE_STEP) {
      this.history.unshift({ ...position });
      if (this.history.length > SAMPLES) this.history.length = SAMPLES;
      this.last = { ...position };
    }
    // The ribbon faces away from the direction of travel, so it stays visible
    // from the chase camera whichever way the player turns.
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z) || 1;
    const side = normalize({
      x: velocity.z / speed,
      y: 0,
      z: -velocity.x / speed,
    });
    const halfWidth = HALF_WIDTH * (0.5 + speed01 * 1.2) * (1 + growth);
    for (let i = 0; i < SAMPLES; i++) {
      const point = this.history[Math.min(i, this.history.length - 1)] ?? position;
      const cameraDistance = Math.hypot(
        point.x - cameraPosition.x,
        point.y - cameraPosition.y,
        point.z - cameraPosition.z,
      );
      const taper = trailHalfWidth(halfWidth, i / SAMPLES, cameraDistance);
      const o = i * 6;
      this.positions[o] = point.x + side.x * taper;
      this.positions[o + 1] = point.y + side.y * taper;
      this.positions[o + 2] = point.z + side.z * taper;
      this.positions[o + 3] = point.x - side.x * taper;
      this.positions[o + 4] = point.y - side.y * taper;
      this.positions[o + 5] = point.z - side.z * taper;
    }
    this.geometry.attributes['position']!.needsUpdate = true;
    // Standing still leaves nothing behind (§42).
    this.material.uniforms.uIntensity!.value = Math.min(1.6, speed01 * 1.9 + growth * 0.3);
  }

  /** §33: the trail takes on the colour of the region, like everything else. */
  setColor(color: { r: number; g: number; b: number }): void {
    const value = this.material.uniforms.uColor!.value as number[];
    value[0] = 0.45 + color.r * 0.55;
    value[1] = 0.6 + color.g * 0.4;
    value[2] = 0.7 + color.b * 0.3;
  }

  reset(): void {
    this.history.length = 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

function normalize(v: Vec3Data): Vec3Data {
  const length = Math.hypot(v.x, v.y, v.z);
  return length < 1e-6 ? { x: 1, y: 0, z: 0 } : { x: v.x / length, y: v.y / length, z: v.z / length };
}
