import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
} from 'three';
import type { Vec3Data } from '../player/FrequencyState';

/**
 * §151 THE TRAIL IS RESIDUE, NOT A RIBBON.
 *
 * It used to be a strip of quads, and a strip of quads is a surface: whatever
 * it is doing, somewhere on screen there is a straight edge. §131 narrowed it,
 * §133 capped its angular width, and it was STILL a pink wedge across the view
 * — because the problem was never the width, it was that a ribbon has edges at
 * all.
 *
 * So there is no ribbon. Flying leaves PARTICLES: signal residue dropped along
 * the path, scattered off it, drifting and fading. Nothing here can form a
 * line, at any speed, from any angle — which is the only way this stops coming
 * back. It is also what §136.13 asks a trail to be: particle residue, not
 * geometry.
 */

/**
 * §164: an audit looked for this trail at cruise, mid-bank and diving at
 * hyper, and found nothing at all in any of them. Two reasons, both arithmetic:
 *
 * At the old rate — a cluster of three every half unit — a cruise laid down
 * 790 motes a second into a ring of 700, so the buffer wrapped in 0.88 s while
 * the motes were supposed to live 1.5. Most of the trail was being overwritten
 * before it could fade. And every mote spawned at the orb's own centre with
 * under two units of scatter, which is exactly where the chase camera puts the
 * orb — so what did survive was hidden behind it.
 *
 * Fewer, longer-lived, and dropped BEHIND you.
 */
const MOTES = 900;
/** Distance the orb must travel before it drops another cluster. */
const DROP_STEP = 1.4;
/** Motes dropped per cluster — a puff, not a bead on a string. */
const PER_DROP = 2;
/** Seconds a mote takes to fade out. */
const LIFETIME = 2.6;
/** How far behind the orb the residue is laid down, in world units. */
const DROP_BEHIND = 3.2;

interface Mote {
  x: number;
  y: number;
  z: number;
  /** Drift, world units per second: the residue keeps moving after you leave. */
  dx: number;
  dy: number;
  dz: number;
  age: number;
  /** 0..1 how hot it was when it was dropped. */
  heat: number;
}

const VERTEX = /* glsl */ `
attribute float aLife;   // 1 fresh, 0 gone
attribute float aHeat;
uniform float uSize;
varying float vLife;
varying float vHeat;
void main() {
  vLife = aLife;
  vHeat = aHeat;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float distance = max(1.0, -mv.z);
  // Fixed size in the WORLD, so residue shrinks with distance like everything
  // else and never becomes a smear across the lens.
  gl_PointSize = clamp(uSize * (0.35 + aLife * 0.65) / distance, 1.0, 9.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying float vLife;
varying float vHeat;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float core = exp(-r2 * 9.0);
  // Fades as it ages, and the hottest motes clip white for a moment.
  float fade = vLife * vLife;
  vec3 tint = mix(uColor, vec3(1.0), clamp(vHeat * vLife, 0.0, 1.0) * 0.55);
  gl_FragColor = vec4(tint * core * fade * uIntensity, 1.0);
}
`;

export class OrbTrail {
  readonly mesh: Points;
  private readonly material: ShaderMaterial;
  private readonly geometry: BufferGeometry;
  private readonly positions: Float32Array;
  private readonly lives: Float32Array;
  private readonly heats: Float32Array;
  private readonly motes: Mote[] = [];
  private next = 0;
  private last: Vec3Data = { x: 0, y: 0, z: 0 };
  private seeded = false;
  /** Deterministic scatter: the same flight leaves the same residue. */
  private noise = 1;

  constructor() {
    this.positions = new Float32Array(MOTES * 3);
    this.lives = new Float32Array(MOTES);
    this.heats = new Float32Array(MOTES);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aLife', new BufferAttribute(this.lives, 1));
    this.geometry.setAttribute('aHeat', new BufferAttribute(this.heats, 1));
    for (let i = 0; i < MOTES; i++) {
      this.motes.push({ x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, age: LIFETIME, heat: 0 });
    }
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uColor: { value: [0.75, 0.9, 1] },
        uIntensity: { value: 0 },
        uSize: { value: 90 },
      },
    });
    this.mesh = new Points(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  private random(): number {
    // Cheap deterministic scatter; no allocation, no Math.random in a hot loop.
    this.noise = (this.noise * 1664525 + 1013904223) >>> 0;
    return this.noise / 4294967296;
  }

  /**
   * `speed01` is 0..1 of full throttle and `growth` 0..1 of the track: a full
   * track at full speed leaves the densest, hottest residue.
   */
  update(
    position: Vec3Data,
    velocity: Vec3Data,
    speed01: number,
    growth: number,
    dtSeconds: number,
  ): void {
    if (!this.seeded) {
      this.last = { ...position };
      this.seeded = true;
    }
    const moved = Math.hypot(
      position.x - this.last.x,
      position.y - this.last.y,
      position.z - this.last.z,
    );
    if (moved >= DROP_STEP) {
      // Scatter across the path, not along it: residue is left BESIDE where
      // you flew, which is what stops it ever reading as a line. And BEHIND
      // you, or the chase camera has the orb sitting on top of all of it.
      const spread = 0.8 + speed01 * 2.4 + growth * 0.8;
      const speed = Math.hypot(velocity.x, velocity.y, velocity.z) || 1;
      const backX = (-velocity.x / speed) * DROP_BEHIND;
      const backY = (-velocity.y / speed) * DROP_BEHIND;
      const backZ = (-velocity.z / speed) * DROP_BEHIND;
      for (let i = 0; i < PER_DROP; i++) {
        const mote = this.motes[this.next]!;
        this.next = (this.next + 1) % MOTES;
        mote.x = position.x + backX + (this.random() - 0.5) * spread;
        mote.y = position.y + backY + (this.random() - 0.5) * spread;
        mote.z = position.z + backZ + (this.random() - 0.5) * spread;
        mote.dx = (this.random() - 0.5) * 1.4 - velocity.x * 0.02;
        mote.dy = (this.random() - 0.5) * 0.8 + 0.25;
        mote.dz = (this.random() - 0.5) * 1.4 - velocity.z * 0.02;
        mote.age = 0;
        mote.heat = Math.min(1, speed01 * 0.8 + growth * 0.4);
      }
      this.last = { ...position };
    }

    for (let i = 0; i < MOTES; i++) {
      const mote = this.motes[i]!;
      if (mote.age >= LIFETIME) {
        this.lives[i] = 0;
        continue;
      }
      mote.age += dtSeconds;
      mote.x += mote.dx * dtSeconds;
      mote.y += mote.dy * dtSeconds;
      mote.z += mote.dz * dtSeconds;
      const life = Math.max(0, 1 - mote.age / LIFETIME);
      this.positions[i * 3] = mote.x;
      this.positions[i * 3 + 1] = mote.y;
      this.positions[i * 3 + 2] = mote.z;
      this.lives[i] = life;
      this.heats[i] = mote.heat;
    }
    this.geometry.attributes['position']!.needsUpdate = true;
    this.geometry.attributes['aLife']!.needsUpdate = true;
    this.geometry.attributes['aHeat']!.needsUpdate = true;
    // Standing still leaves nothing behind (§42).
    this.material.uniforms['uIntensity']!.value = Math.min(1.6, speed01 * 1.9 + growth * 0.3);
  }

  /** §33: the trail takes on the colour of the region, like everything else. */
  setColor(color: { r: number; g: number; b: number }): void {
    const value = this.material.uniforms['uColor']!.value as number[];
    value[0] = 0.45 + color.r * 0.55;
    value[1] = 0.6 + color.g * 0.4;
    value[2] = 0.7 + color.b * 0.3;
  }

  reset(): void {
    for (const mote of this.motes) mote.age = LIFETIME;
    this.lives.fill(0);
    this.seeded = false;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
