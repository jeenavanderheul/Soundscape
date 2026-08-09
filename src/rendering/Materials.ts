import { AdditiveBlending, MeshBasicMaterial, ShaderMaterial } from 'three';

/**
 * Shared material definitions (spec §13: share materials, monochrome,
 * near-black void, restrained). All shader source lives here so systems
 * never define ad-hoc materials.
 */

const WIND_PARTICLE_VERTEX = /* glsl */ `
  uniform float uSize;
  attribute float aSeed;
  varying float vSeed;

  void main() {
    vSeed = aSeed;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float attenuation = clamp(24.0 / max(-mvPosition.z, 0.5), 0.2, 3.0);
    gl_PointSize = uSize * (0.6 + 0.8 * aSeed) * attenuation;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const WIND_PARTICLE_FRAGMENT = /* glsl */ `
  uniform float uBrightness;
  varying float vSeed;

  void main() {
    // Soft circular point, faint white/grey, oscilloscope-like.
    float d = length(gl_PointCoord - vec2(0.5));
    float falloff = smoothstep(0.5, 0.0, d);
    float grey = 0.55 + 0.45 * vSeed;
    gl_FragColor = vec4(vec3(grey), falloff * uBrightness);
  }
`;

export function createWindParticleMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uSize: { value: 2 },
      uBrightness: { value: 0.15 },
    },
    vertexShader: WIND_PARTICLE_VERTEX,
    fragmentShader: WIND_PARTICLE_FRAGMENT,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

/**
 * One shared material for all M3 structures (§13: share materials). Thin
 * monochrome wireframe over the near-black void; per-structure brightness
 * (persistence) lives in vertex colors, not per-mesh material clones.
 */
export function createStructureMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    wireframe: true,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}
