import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
} from 'three';
import type { Vec3Data } from '../player/FrequencyState';
import { DOME_LIGHTS } from './DomeLights';

/**
 * §154: the smoke itself. Soft, slow motes drifting through the space the rig
 * hangs in — this is what the beams stand in, and without it a light shaft is
 * a shape rather than a volume.
 *
 * Not a fog: fog is a distance function and hides things. This is MATTER in
 * the air, sparse enough to see the world through, thick enough to catch a
 * beam. It drifts, it rises, and it is blown out of the ring the fixtures hang
 * on whenever a jet fires (§154 triggers).
 */

const MOTES = 900;
/** Seconds a mote takes to fade, once it is in the air. */
const LIFETIME = 9;

interface Mote {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  age: number;
  /** 0..1 how hard it was blown out; a jet is denser than the standing haze. */
  body: number;
}

const VERTEX = /* glsl */ `
attribute float aLife;
attribute float aBody;
uniform float uSize;
uniform float uDensity;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float distance = max(1.0, -mv.z);
  // Smoke swells as it ages: a puff opens out, it does not travel as a ball.
  float swell = 0.6 + (1.0 - aLife) * 1.9;
  gl_PointSize = clamp(uSize * swell * (0.4 + aBody) / distance, 2.0, 160.0);
  // Thin at both ends of its life, so nothing pops in or out of existence.
  vAlpha = smoothstep(0.0, 0.25, aLife) * aLife * (0.25 + aBody * 0.75) * uDensity;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  // No edge anywhere: smoke that has a rim is a sprite.
  float soft = exp(-r2 * 5.5);
  gl_FragColor = vec4(uColor * soft * vAlpha, 1.0);
}
`;

export class Haze {
  readonly points: Points;
  private readonly material: ShaderMaterial;
  private readonly geometry: BufferGeometry;
  private readonly positions: Float32Array;
  private readonly lives: Float32Array;
  private readonly bodies: Float32Array;
  private readonly motes: Mote[] = [];
  private next = 0;
  private noise = 7;
  private topUp = 0;

  constructor() {
    this.positions = new Float32Array(MOTES * 3);
    this.lives = new Float32Array(MOTES);
    this.bodies = new Float32Array(MOTES);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aLife', new BufferAttribute(this.lives, 1));
    this.geometry.setAttribute('aBody', new BufferAttribute(this.bodies, 1));
    for (let i = 0; i < MOTES; i++) {
      this.motes.push({ x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, age: LIFETIME, body: 0 });
    }
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uColor: { value: [0.42, 0.46, 0.5] },
        uSize: { value: 900 },
        uDensity: { value: 0 },
      },
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  private random(): number {
    this.noise = (this.noise * 1664525 + 1013904223) >>> 0;
    return this.noise / 4294967296;
  }

  /** §33: even the air takes the colour of the region it is hanging in. */
  setTint(color: { r: number; g: number; b: number }): void {
    const tint = this.material.uniforms['uColor']!.value as number[];
    // §167: smoke takes the colour of the light in it, so it carries the
    // region too — a red world has red smoke, not grey smoke lit red.
    tint[0] = 0.16 + color.r * 0.6;
    tint[1] = 0.18 + color.g * 0.56;
    tint[2] = 0.22 + color.b * 0.52;
  }

  /**
   * `density` is the standing haze and `blast` is a jet firing this frame.
   * Both come from `advanceSmoke`; this only decides where the matter goes.
   */
  update(density: number, blast: number, player: Vec3Data, dtSeconds: number): void {
    this.material.uniforms['uDensity']!.value = density;

    // The standing haze keeps itself topped up around the player, at a rate
    // that follows how thick the air is meant to be.
    this.topUp += density * 34 * dtSeconds;
    while (this.topUp >= 1) {
      this.topUp -= 1;
      this.emit(player, 0.2 + this.random() * 0.25, 250, 90);
    }

    // A jet fires from the ring the fixtures hang on, not from nowhere: the
    // smoke comes out of the rig, which is what ties the two together.
    if (blast > 0) {
      const jets = Math.round(6 + blast * 10);
      for (let i = 0; i < jets; i++) this.emitJet(player, blast);
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
      // Smoke slows as it spreads, and always drifts up a little.
      mote.dx *= 1 - dtSeconds * 0.55;
      mote.dz *= 1 - dtSeconds * 0.55;
      mote.dy = mote.dy * (1 - dtSeconds * 0.3) + dtSeconds * 0.9;
      const life = Math.max(0, 1 - mote.age / LIFETIME);
      this.positions[i * 3] = mote.x;
      this.positions[i * 3 + 1] = mote.y;
      this.positions[i * 3 + 2] = mote.z;
      this.lives[i] = life;
      this.bodies[i] = mote.body;
    }
    this.geometry.attributes['position']!.needsUpdate = true;
    this.geometry.attributes['aLife']!.needsUpdate = true;
    this.geometry.attributes['aBody']!.needsUpdate = true;
  }

  private emit(player: Vec3Data, body: number, radius: number, height: number): void {
    const mote = this.motes[this.next]!;
    this.next = (this.next + 1) % MOTES;
    const angle = this.random() * Math.PI * 2;
    const reach = Math.sqrt(this.random()) * radius;
    mote.x = player.x + Math.cos(angle) * reach;
    mote.z = player.z + Math.sin(angle) * reach;
    mote.y = player.y - 20 + this.random() * height;
    mote.dx = (this.random() - 0.5) * 1.6;
    mote.dz = (this.random() - 0.5) * 1.6;
    mote.dy = this.random() * 0.6;
    mote.age = 0;
    mote.body = body;
  }

  private emitJet(player: Vec3Data, blast: number): void {
    const mote = this.motes[this.next]!;
    this.next = (this.next + 1) % MOTES;
    const ring = DOME_LIGHTS.rings[0]!;
    const angle = this.random() * Math.PI * 2;
    mote.x = player.x + Math.cos(angle) * ring.radius * 0.9;
    mote.z = player.z + Math.sin(angle) * ring.radius * 0.9;
    mote.y = player.y + ring.height;
    // Fired inward and upward, hard, then it slows: a jet, not a cloud.
    mote.dx = -Math.cos(angle) * (26 + blast * 40);
    mote.dz = -Math.sin(angle) * (26 + blast * 40);
    mote.dy = 6 + blast * 14;
    mote.age = 0;
    mote.body = 0.55 + blast * 0.45;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
