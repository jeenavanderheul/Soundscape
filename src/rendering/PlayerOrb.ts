import {
  AdditiveBlending,
  IcosahedronGeometry,
  Mesh,
  ShaderMaterial,
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

export class PlayerOrb {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private pulse = 0;
  private glow = 0.6;
  private deform = 0.05;

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
      },
    });
    this.mesh = new Mesh(new IcosahedronGeometry(0.55, 5), this.material);
  }

  /** BeatSync hook (§12): beats kick a visible throb through the orb. */
  setPulse(value: number): void {
    this.pulse = value;
  }

  update(state: Readonly<FrequencyState>, rms: number, dt: number, elapsedSeconds: number): void {
    this.mesh.position.set(state.position.x, state.position.y, state.position.z);
    const hzn = Math.min(1, Math.max(0, Math.log(Math.max(state.hz, 30) / 30) / Math.log(8000 / 30)));
    // Every stimulus deepens the morph: own wind, the audio field, the beat.
    // Capped: at full wind the orb breathes hard but stays a recognizable orb.
    const targetDeform = Math.min(0.26, 0.05 + state.amplitude * 0.12 + rms * 0.18 + this.pulse * 0.08);
    const targetGlow = Math.min(1.5, 0.55 + state.amplitude * 0.45 + rms * 0.6 + this.pulse * 0.3);
    const blend = 1 - Math.exp(-8 * dt);
    this.deform += (targetDeform - this.deform) * blend;
    this.glow += (targetGlow - this.glow) * blend;
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
