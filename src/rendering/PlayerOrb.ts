import {
  AdditiveBlending,
  IcosahedronGeometry,
  Mesh,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { FrequencyState } from '../player/FrequencyState';

/**
 * The player made visible (user decision): a pulsing luminous orb that morphs
 * with every stimulus — its own amplitude and pitch, the audio field and the
 * world pulse. The player IS a frequency (§1); the orb is that frequency's
 * standing wave, not an avatar.
 */

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uDeform;
uniform float uHzNorm;
uniform float uGrowth;
varying float vFresnel;
varying float vRipple;

void main() {
  // Standing-wave morph: displacement bands travel over the sphere; pitch
  // sets their fineness (§3.1: high = fine detail), stimulus sets depth.
  float bands = mix(2.0, 9.0, uHzNorm);
  float ripple =
    sin(position.y * bands * 3.1 + uTime * 3.0) *
    sin(position.x * bands * 2.3 - uTime * 2.2) *
    sin(position.z * bands * 2.7 + uTime * 2.6);
  // Every earned layer folds a faster harmonic into the wave: a full track is
  // visibly a more complicated waveform than a single tone (§29.6).
  ripple += uGrowth * 0.35 *
    sin(position.y * bands * 7.3 - uTime * 5.1) *
    sin(position.x * bands * 6.1 + uTime * 4.3);
  vec3 displaced = position + normal * ripple * uDeform;
  vRipple = ripple;
  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  vec3 viewNormal = normalize(normalMatrix * normal);
  vFresnel = pow(1.0 - abs(dot(normalize(-mv.xyz), viewNormal)), 2.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uGlow;
uniform float uHzNorm;
varying float vFresnel;
varying float vRipple;

void main() {
  // Cold white core with a pitch tint: low leans warm, high leans cyan.
  vec3 low = vec3(1.0, 0.82, 0.72);
  vec3 high = vec3(0.72, 0.95, 1.0);
  vec3 tint = mix(low, high, uHzNorm);
  float core = 0.35 + vFresnel * 1.1 + abs(vRipple) * 0.25;
  gl_FragColor = vec4(tint * core * uGlow, 1.0);
}
`;

/** Radius of the untouched orb; a finished track is BASE_RADIUS × 5.4 across. */
export const ORB_BASE_RADIUS = 0.26;

const FORWARD_AXIS = new Vector3(0, 0, 1);
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export class PlayerOrb {
  readonly mesh: Mesh;
  /** Public so tests can read the uniforms the world is driving. */
  readonly material: ShaderMaterial;
  private pulse = 0;
  private glow = 0.6;
  private deform = 0.05;
  /** Smoothed §29.6 track growth: 0 = one tone, 1 = a finished track. */
  private growth = 0;
  private targetGrowth = 0;
  /** Smoothed turn and climb, so the lean settles instead of snapping. */
  private yawRate = 0;
  private climbRate = 0;
  private readonly forward = new Vector3();
  private readonly spin = new Quaternion();

  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      blending: AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uDeform: { value: 0.05 },
        uHzNorm: { value: 0.5 },
        uGlow: { value: 0.6 },
        uGrowth: { value: 0 },
      },
    });
    // A single tone is barely anything; a finished track is a body (§29.6).
    this.mesh = new Mesh(new IcosahedronGeometry(ORB_BASE_RADIUS, 5), this.material);
  }

  /** What it currently measures, so the collision can hug it as it grows (§35). */
  get radius(): number {
    return ORB_BASE_RADIUS * this.mesh.scale.x;
  }

  /** How the orb is being flown, for the shape it takes (§52). */
  setFlight(yawRate: number, climbRate: number, dt: number): void {
    const blend = 1 - Math.exp(-6 * dt);
    this.yawRate += (yawRate - this.yawRate) * blend;
    this.climbRate += (climbRate - this.climbRate) * blend;
  }

  /** BeatSync hook (§12): beats kick a visible throb through the orb. */
  setPulse(value: number): void {
    this.pulse = value;
  }

  /**
   * §29.6: the orb IS the track. It starts small and minimal on a single tone
   * and every earned layer makes it bigger, brighter, more complex and more
   * restless — the finished track is a visibly different body.
   */
  setGrowth(value: number): void {
    this.targetGrowth = Math.min(1, Math.max(0, value));
  }

  update(state: Readonly<FrequencyState>, rms: number, dt: number, elapsedSeconds: number): void {
    this.mesh.position.set(state.position.x, state.position.y, state.position.z);
    const hzn = Math.min(1, Math.max(0, Math.log(Math.max(state.hz, 30) / 30) / Math.log(8000 / 30)));
    // Every stimulus deepens the morph: own wind, the audio field, the beat.
    // Capped: at full wind the orb breathes hard but stays a recognizable orb.
    // The surface breathes; it never wobbles. Shape comes from FLIGHT below —
    // a stretched oval and a lean — not from a churning skin (user decision).
    const targetDeform = Math.min(
      0.1 + this.growth * 0.05,
      0.02 + state.amplitude * 0.05 + rms * 0.07 + this.pulse * 0.04 + this.growth * 0.04,
    );
    const targetGlow = Math.min(
      1.5 + this.growth * 0.5,
      0.55 + state.amplitude * 0.45 + rms * 0.6 + this.pulse * 0.3 + this.growth * 0.45,
    );
    const blend = 1 - Math.exp(-8 * dt);
    this.deform += (targetDeform - this.deform) * blend;
    this.glow += (targetGlow - this.glow) * blend;
    // Growth crawls (a layer is a milestone, not a flicker) — 2s time constant.
    this.growth += (this.targetGrowth - this.growth) * (1 - Math.exp(-0.5 * dt));
    // Size is the growth you can see from outside.
    const scale = 1 + this.growth * 4.4;
    // §52: the orb is SHAPED by how it flies. Point it along the direction of
    // travel, stretch it into an oval with speed, squeeze it in the turn and
    // bank into it — so left, right, up and down are all legible from outside.
    this.forward.set(state.direction.x, state.direction.y, state.direction.z);
    if (this.forward.lengthSq() > 1e-6) {
      this.forward.normalize();
      this.spin.setFromUnitVectors(FORWARD_AXIS, this.forward);
      this.mesh.quaternion.copy(this.spin);
    }
    const speed01 = Math.min(1, state.velocity / 66);
    const lean = clamp(this.yawRate * 0.22, -0.6, 0.6);
    const pitchLean = clamp(this.climbRate * 0.035, -0.5, 0.5);
    this.mesh.rotateZ(lean);
    this.mesh.rotateX(pitchLean);
    const stretch = 1 + speed01 * 0.85;
    const squeeze = 1 - speed01 * 0.22 - Math.abs(lean) * 0.18;
    this.mesh.scale.set(scale * squeeze, scale * (squeeze + Math.abs(pitchLean) * 0.25), scale * stretch);
    this.material.uniforms.uGrowth!.value = this.growth;
    this.material.uniforms.uTime!.value = elapsedSeconds;
    this.material.uniforms.uDeform!.value = this.deform;
    this.material.uniforms.uGlow!.value = this.glow;
    this.material.uniforms.uHzNorm!.value = hzn;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
