import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  LineSegments,
  ShaderMaterial,
} from 'three';
import type { Vec3Data } from '../player/FrequencyState';

/**
 * §13 waveform landscape, poster direction: an oscilloscope field of scan
 * lines that stays almost invisible in the void and SWELLS where resonance
 * happens (user decision: terrain grows from interaction). Height and color
 * come from excitation sources: the player's wind, engaged resonators and
 * born structures. Low hz → long slow hills (red zone), high hz → fine
 * ripples (green), mid/square → purple (§3.1 + poster palette).
 */

export const TERRAIN_CONFIG = {
  size: 360,
  rows: 96,
  columns: 192,
  planeY: -6,
  maxSources: 12,
  /** Idle ripple so the void is never a black screen (faint reference). */
  idleAmplitude: 0.18,
  exciteRise: 0.9,
  exciteDecayPerSec: 0.08,
  /** Structures excite permanently at this floor. */
  permanentFloor: 0.55,
} as const;

/** Normalized log position of hz in 30 Hz–8 kHz, 0..1 (§3.1). */
export function hzNorm(hz: number): number {
  const min = 30;
  const max = 8000;
  if (hz <= min) return 0;
  return Math.min(1, Math.log(hz / min) / Math.log(max / min));
}

interface TerrainSource {
  id: string;
  x: number;
  z: number;
  hzn: number;
  strength: number;
  permanent: boolean;
}

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform float uBass;
uniform vec2 uOrigin; // the field follows the player; sources stay in world space
uniform vec2 uPlayer; // world position of the orb: the lantern lives here
uniform vec4 uSources[${TERRAIN_CONFIG.maxSources}]; // x, z, strength, hzNorm
uniform int uSourceCount;
varying float vGlow;
varying vec3 vZone;

vec3 zoneColor(float hzn) {
  // poster palette: low = red mass, high = green detail, mid = purple harmonics
  vec3 red = vec3(1.0, 0.22, 0.18);
  vec3 purple = vec3(0.62, 0.35, 1.0);
  vec3 green = vec3(0.45, 1.0, 0.35);
  return hzn < 0.4 ? mix(red, purple, hzn / 0.4) : mix(purple, green, (hzn - 0.4) / 0.6);
}

void main() {
  vec3 pos = position;
  vec2 world = pos.xz + uOrigin;
  // Idle reference ripple: barely-there breathing of the void.
  float h = ${TERRAIN_CONFIG.idleAmplitude.toFixed(2)} *
    sin(world.x * 0.045 + uTime * 0.35) * sin(world.y * 0.06 + uTime * 0.22);
  // §29.6: the bassline IS the moving ridge landscape.
  h += uBass * 2.2 * sin(world.x * 0.028 + uTime * 0.55) * cos(world.y * 0.021 - uTime * 0.4);
  float glow = uBass * 0.25;
  vec3 zone = vec3(0.0);
  for (int i = 0; i < ${TERRAIN_CONFIG.maxSources}; i++) {
    if (i >= uSourceCount) break;
    vec4 s = uSources[i];
    float d = distance(world, s.xy);
    // Low hz: broad slow hills; high hz: tight fast ripples (§3.1).
    float radius = mix(46.0, 14.0, s.w);
    float k = mix(0.12, 0.85, s.w);
    float speed = mix(0.6, 2.4, s.w);
    float envelope = exp(-(d * d) / (radius * radius)) * s.z;
    float wave = sin(d * k - uTime * speed) * 0.5 + 0.72;
    float amp = mix(7.0, 1.6, s.w);
    h += envelope * wave * amp * (1.0 + uPulse * 0.35);
    glow += envelope;
    zone += zoneColor(s.w) * envelope;
  }
  pos.y += h;
  // Lantern: an always-on pool of light under the orb, so the field beneath
  // the player is ALWAYS a visible reference (game-style spot, no lighting rig).
  float dPlayer = distance(world, uPlayer);
  float lantern = exp(-(dPlayer * dPlayer) / (26.0 * 26.0)) * 0.85;
  vGlow = clamp(glow + lantern + abs(h) * 0.12, 0.0, 1.6);
  vZone = zone;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  // Manual depth fade: the field dissolves into the void (§13).
  vGlow *= clamp(1.0 - (-mv.z - 40.0) / 180.0, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
varying float vGlow;
varying vec3 vZone;
void main() {
  vec3 base = vec3(0.62, 0.72, 0.74); // cold monochrome scan line
  vec3 color = base * (0.10 + vGlow * 0.9) + vZone * 0.55;
  gl_FragColor = vec4(color, 1.0);
}
`;

export class WaveTerrain {
  readonly lines: LineSegments;
  private readonly material: ShaderMaterial;
  private readonly sources: TerrainSource[] = [];
  private readonly sourceArray: Float32Array;
  private pulse = 0;

  constructor() {
    const geometry = buildScanLineGrid();
    this.sourceArray = new Float32Array(TERRAIN_CONFIG.maxSources * 4);
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: false,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uBass: { value: 0 },
        uOrigin: { value: [0, 0] },
        uPlayer: { value: [0, 0] },
        uSources: { value: packSources([], this.sourceArray) },
        uSourceCount: { value: 0 },
      },
    });
    this.lines = new LineSegments(geometry, this.material);
    this.lines.position.y = TERRAIN_CONFIG.planeY;
    this.lines.frustumCulled = false;
  }

  /** BeatSync hook: world pulse ripples through the field (§12). */
  setPulse(value: number): void {
    this.pulse = value;
  }

  /** §29.6: bassline level — the terrain grows moving ridges. */
  setBass(level: number): void {
    this.bassLevel = Math.min(1, Math.max(0, level));
  }

  private bassLevel = 0;

  /** §29.6 clap flash: a sharp extra field-pulse that decays fast. */
  private flash = 0;

  clapFlash(): void {
    this.flash = 1;
  }

  /** Raise (or refresh) an excitation source; terrain grows where sound happens. */
  excite(id: string, position: Vec3Data, hz: number, amount: number, permanent = false): void {
    const existing = this.sources.find((s) => s.id === id);
    if (existing) {
      existing.strength = Math.min(1, existing.strength + amount * TERRAIN_CONFIG.exciteRise);
      existing.permanent = existing.permanent || permanent;
      existing.x = position.x;
      existing.z = position.z;
      return;
    }
    if (this.sources.length >= TERRAIN_CONFIG.maxSources) {
      const evictable = this.sources.findIndex((s) => !s.permanent);
      if (evictable === -1) return;
      this.sources.splice(evictable, 1);
    }
    this.sources.push({
      id,
      x: position.x,
      z: position.z,
      hzn: hzNorm(hz),
      strength: Math.min(1, amount),
      permanent,
    });
  }

  update(dt: number, elapsedSeconds: number, playerPosition?: Vec3Data): void {
    if (playerPosition) {
      // Infinite field that reads as MOTION: recenter in whole grid cells so
      // every scan line stays glued to fixed world positions — lines stream
      // past the camera instead of riding along with it.
      const cellX = TERRAIN_CONFIG.size / TERRAIN_CONFIG.columns;
      const cellZ = TERRAIN_CONFIG.size / (TERRAIN_CONFIG.rows - 1);
      const snapX = Math.round(playerPosition.x / cellX) * cellX;
      const snapZ = Math.round(playerPosition.z / cellZ) * cellZ;
      this.lines.position.set(snapX, TERRAIN_CONFIG.planeY, snapZ);
      const origin = this.material.uniforms.uOrigin!.value as number[];
      origin[0] = snapX;
      origin[1] = snapZ;
      const player = this.material.uniforms.uPlayer!.value as number[];
      player[0] = playerPosition.x;
      player[1] = playerPosition.z;
    }
    for (let i = this.sources.length - 1; i >= 0; i--) {
      const s = this.sources[i]!;
      const floor = s.permanent ? TERRAIN_CONFIG.permanentFloor : 0;
      s.strength = Math.max(floor, s.strength - TERRAIN_CONFIG.exciteDecayPerSec * dt);
      if (!s.permanent && s.strength <= 0.01) this.sources.splice(i, 1);
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    this.material.uniforms.uTime!.value = elapsedSeconds;
    this.material.uniforms.uPulse!.value = Math.min(1.5, this.pulse + this.flash);
    this.material.uniforms.uBass!.value = this.bassLevel;
    this.material.uniforms.uSources!.value = packSources(this.sources, this.sourceArray);
    this.material.uniforms.uSourceCount!.value = this.sources.length;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.material.dispose();
  }
}

function buildScanLineGrid(): BufferGeometry {
  const { size, rows, columns } = TERRAIN_CONFIG;
  const positions: number[] = [];
  for (let r = 0; r < rows; r++) {
    const z = (r / (rows - 1) - 0.5) * size;
    for (let c = 0; c < columns; c++) {
      const x0 = (c / columns - 0.5) * size;
      const x1 = ((c + 1) / columns - 0.5) * size;
      positions.push(x0, 0, z, x1, 0, z);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

function packSources(sources: TerrainSource[], target: Float32Array): Float32Array {
  target.fill(0);
  sources.forEach((s, i) => {
    target[i * 4] = s.x;
    target[i * 4 + 1] = s.z;
    target[i * 4 + 2] = s.strength;
    target[i * 4 + 3] = s.hzn;
  });
  return target;
}
