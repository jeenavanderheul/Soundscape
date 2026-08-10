import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  LineSegments,
  ShaderMaterial,
} from 'three';
import { createRng, type Rng } from '../core/rng';
import type { Vec3Data } from '../player/FrequencyState';

/**
 * §33: SPEED YOU CAN SEE. Streaks of light stream past the orb — comet tails
 * drawn out along the direction of travel. Standing still they fade to
 * nothing; pushing forward stretches them into long lines that rush by, so
 * the player feels velocity even over featureless ground.
 *
 * One LineSegments, one shader, no per-frame allocation: particles live in a
 * fixed pool and are recycled once they fall behind the player.
 */

export const STREAK_CONFIG = {
  count: 220,
  /** Particles live in a box this big around the player. */
  radius: 70,
  /** Speed at which streaks reach full length and brightness. */
  fullSpeed: 18,
  /** Longest a streak can be drawn, in world units. */
  maxLength: 9,
} as const;

const VERTEX = /* glsl */ `
attribute float aSide;      // 0 = head, 1 = tail
attribute float aScale;     // per-particle length variation
uniform vec3 uVelocity;     // world-space direction and magnitude of travel
uniform float uIntensity;   // 0..1 how fast the player is going
uniform vec3 uColor;
varying float vFade;
void main() {
  vec3 pos = position;
  // The tail trails BEHIND the direction of travel: a streak, not a dot.
  pos -= uVelocity * aSide * aScale * uIntensity * ${STREAK_CONFIG.maxLength.toFixed(1)};
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  // Head bright, tail transparent; everything fades with distance and speed.
  vFade = (1.0 - aSide) * uIntensity * clamp(1.0 - (-mv.z) / 90.0, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vFade;
void main() {
  if (vFade <= 0.001) discard;
  gl_FragColor = vec4(uColor * vFade, vFade);
}
`;

function scatter(rng: Rng, target: Float32Array, positions: Float32Array): void {
  const { count, radius } = STREAK_CONFIG;
  for (let i = 0; i < count; i++) {
    const x = (rng.next() * 2 - 1) * radius;
    const y = (rng.next() * 2 - 1) * radius * 0.5;
    const z = (rng.next() * 2 - 1) * radius;
    // Head and tail share a position; the shader pulls the tail backwards.
    positions[i * 6 + 0] = x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = y;
    positions[i * 6 + 5] = z;
    target[i * 2] = 0;
    target[i * 2 + 1] = 1;
  }
}

export class SpeedStreaks {
  readonly lines: LineSegments;
  private readonly material: ShaderMaterial;
  private readonly positions: Float32Array;
  private readonly rng: Rng;
  private intensity = 0;

  constructor(seed: string) {
    this.rng = createRng(`${seed}:streaks`);
    const { count } = STREAK_CONFIG;
    this.positions = new Float32Array(count * 6);
    const sides = new Float32Array(count * 2);
    const scales = new Float32Array(count * 2);
    scatter(this.rng, sides, this.positions);
    for (let i = 0; i < count; i++) {
      const scale = 0.4 + this.rng.next() * 0.9;
      scales[i * 2] = scale;
      scales[i * 2 + 1] = scale;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('aSide', new BufferAttribute(sides, 1));
    geometry.setAttribute('aScale', new BufferAttribute(scales, 1));
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      uniforms: {
        uVelocity: { value: [0, 0, 0] },
        uIntensity: { value: 0 },
        uColor: { value: [0.7, 0.85, 1] },
      },
    });
    this.lines = new LineSegments(geometry, this.material);
    this.lines.frustumCulled = false;
  }

  /** §33: streaks take the colour of the region being flown through. */
  setColor(color: { r: number; g: number; b: number }): void {
    const uniform = this.material.uniforms['uColor']!.value as number[];
    // Lifted toward white so streaks stay readable against a coloured world.
    uniform[0] = 0.45 + color.r * 0.55;
    uniform[1] = 0.45 + color.g * 0.55;
    uniform[2] = 0.45 + color.b * 0.55;
  }

  /**
   * Follow the player and recycle whatever fell behind. `velocity` is world
   * units per second; its direction is the direction the streaks stretch in.
   */
  update(position: Vec3Data, velocity: Vec3Data, dt: number): void {
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const target = Math.min(1, speed / STREAK_CONFIG.fullSpeed);
    // Ease so a dash surges and settles instead of snapping.
    this.intensity += (target - this.intensity) * Math.min(1, dt * 3.5);
    this.material.uniforms['uIntensity']!.value = this.intensity;
    const unit = this.material.uniforms['uVelocity']!.value as number[];
    if (speed > 0.001) {
      unit[0] = velocity.x / speed;
      unit[1] = velocity.y / speed;
      unit[2] = velocity.z / speed;
    }

    // The field rides with the player; particles that leave the box are
    // wrapped to the opposite side, which reads as an endless stream.
    this.lines.position.set(position.x, position.y, position.z);
    const { count, radius } = STREAK_CONFIG;
    const span = radius * 2;
    const moved = { x: velocity.x * dt, y: velocity.y * dt, z: velocity.z * dt };
    if (moved.x === 0 && moved.y === 0 && moved.z === 0) return;
    for (let i = 0; i < count; i++) {
      const base = i * 6;
      for (let axis = 0; axis < 3; axis++) {
        const delta = axis === 0 ? moved.x : axis === 1 ? moved.y : moved.z;
        const limit = axis === 1 ? radius * 0.5 : radius;
        let value = this.positions[base + axis]! - delta;
        if (value > limit) value -= axis === 1 ? limit * 2 : span;
        else if (value < -limit) value += axis === 1 ? limit * 2 : span;
        this.positions[base + axis] = value;
        this.positions[base + 3 + axis] = value;
      }
    }
    (this.lines.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.material.dispose();
  }
}
