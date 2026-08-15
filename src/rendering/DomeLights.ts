import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
} from 'three';
import { DOME_SCANNER_GLSL, type ScannerState } from './domeScanner';

/**
 * §147 THE LEDS — light you can see, circling the player.
 *
 * §146 built the dome as an invisible thing that only revealed itself through
 * what it touched. That is what the brief asked for and it is why the player
 * could not find it: there was nothing to look AT. This is the other half —
 * actual fixtures, hung in rings around the world, turning with the same
 * signal.
 *
 * They are points, like everything else here, not lamps: small, precise, hot
 * in the middle, and mostly dark. A cluster of them lights as the signal
 * passes, the rest sit at an ember, and the ring keeps turning around you.
 */

export const DOME_LIGHTS = {
  /** Rings from the horizon up towards the crown — a dome, not a circle. */
  rings: [
    { radius: 235, height: 4, count: 120 },
    { radius: 205, height: 46, count: 96 },
    { radius: 140, height: 86, count: 72 },
    { radius: 62, height: 112, count: 40 },
  ],
  /**
   * Screen size of one fixture at one world unit away. The rig hangs 60 to 235
   * units out, so at 240 every fixture came out a single pixel at six percent
   * brightness — present in the buffer, invisible to a human.
   */
  size: 3400,
  /** What a fixture gives off when the signal is nowhere near it. */
  ember: 0.22,
} as const;

const VERTEX = /* glsl */ `
attribute float aAngle;   // where on its ring this fixture hangs
attribute float aRing;    // 0..1 from the horizon ring to the crown
attribute float aRadius;
attribute float aHeight;
uniform float uSize;
uniform float uTime;
uniform float uPulse;
uniform vec3 uTint;
uniform float uPlayerY;
varying vec3 vColor;
varying float vHot;

void main() {
  // The rig hangs around the player and travels with them: wherever you fly,
  // the lights are around you.
  float angle = aAngle;
  vec2 ring = vec2(cos(angle), sin(angle)) * aRadius;
  vec3 world = vec3(uBeamPlayer.x + ring.x, uPlayerY + aHeight, uBeamPlayer.y + ring.y);

  // The same signal that scans the world lights the fixtures. A cluster is
  // bright, everything behind it is fading, everything ahead is dark.
  float band = beamBand(angle, uBeam);
  if (uBeamCounter >= 0.0) band = max(band, beamBand(angle, uBeamCounter));
  if (uBeamGhost >= 0.0) band = max(band, beamBand(angle, uBeamGhost) * 0.45);
  // Higher rings answer a little later: the light climbs the dome as it turns.
  band *= 1.0 - aRing * 0.25;

  float hot = clamp(${DOME_LIGHTS.ember.toFixed(2)} + band * uBeamIntensity * 2.4 + uPulse * 0.2, 0.0, 2.6);
  vHot = hot;
  // White at the centre of the band, the region's own colour at the edges —
  // the accent is what is LEFT when the white falls away (§136.2).
  vColor = mix(uTint, vec3(1.0), clamp(band * 1.4, 0.0, 1.0));

  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  float distance = max(1.0, -mv.z);
  gl_PointSize = clamp(uSize * (0.35 + hot * 0.9) / distance, 2.0, 34.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vHot;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  // A hard little core with a soft falloff: a fixture, never a glowing cone
  // (§146 light character).
  float core = exp(-r2 * 11.0);
  gl_FragColor = vec4(vColor * core * vHot, 1.0);
}
`;

export class DomeLights {
  readonly points: Points;
  private readonly material: ShaderMaterial;
  private readonly geometry: BufferGeometry;

  constructor() {
    const angles: number[] = [];
    const rings: number[] = [];
    const radii: number[] = [];
    const heights: number[] = [];
    const positions: number[] = [];
    DOME_LIGHTS.rings.forEach((ring, index) => {
      for (let i = 0; i < ring.count; i++) {
        angles.push((i / ring.count) * Math.PI * 2);
        rings.push(index / (DOME_LIGHTS.rings.length - 1));
        radii.push(ring.radius);
        heights.push(ring.height);
        // The real position is computed in the shader; this only has to exist.
        positions.push(0, 0, 0);
      }
    });
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    this.geometry.setAttribute('aAngle', new BufferAttribute(new Float32Array(angles), 1));
    this.geometry.setAttribute('aRing', new BufferAttribute(new Float32Array(rings), 1));
    this.geometry.setAttribute('aRadius', new BufferAttribute(new Float32Array(radii), 1));
    this.geometry.setAttribute('aHeight', new BufferAttribute(new Float32Array(heights), 1));
    this.material = new ShaderMaterial({
      vertexShader: `${DOME_SCANNER_GLSL}\n${VERTEX}`,
      fragmentShader: FRAGMENT,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      uniforms: {
        uSize: { value: DOME_LIGHTS.size },
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uPlayerY: { value: 0 },
        uTint: { value: [0.7, 0.78, 0.8] },
        uBeam: { value: 0 },
        uBeamCounter: { value: -1 },
        uBeamGhost: { value: -1 },
        uBeamWidth: { value: 0.22 },
        uBeamTail: { value: 0.9 },
        uBeamIntensity: { value: 0.5 },
        uBeamElevation: { value: 0.5 },
        uBeamDirection: { value: 1 },
        uBeamPlayer: { value: [0, 0] },
      },
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** §33: the rig takes the colour of the region it is hanging in. */
  setTint(color: { r: number; g: number; b: number }): void {
    const tint = this.material.uniforms['uTint']!.value as number[];
    tint[0] = 0.45 + color.r * 0.55;
    tint[1] = 0.5 + color.g * 0.5;
    tint[2] = 0.55 + color.b * 0.45;
  }

  /** BeatSync hook: the whole rig lifts on the beat (§12). */
  setPulse(value: number): void {
    this.material.uniforms['uPulse']!.value = value;
  }

  update(scanner: ScannerState, player: { x: number; y: number; z: number }, elapsedSeconds: number): void {
    const u = this.material.uniforms;
    u['uTime']!.value = elapsedSeconds;
    u['uPlayerY']!.value = player.y;
    u['uBeam']!.value = scanner.bearing;
    u['uBeamCounter']!.value = scanner.counterBearing ?? -1;
    u['uBeamGhost']!.value = scanner.ghostBearing ?? -1;
    u['uBeamWidth']!.value = scanner.width;
    u['uBeamTail']!.value = scanner.tail;
    u['uBeamIntensity']!.value = scanner.intensity;
    u['uBeamElevation']!.value = scanner.elevation;
    u['uBeamDirection']!.value = scanner.mode === 'reverse' ? -1 : 1;
    const centre = u['uBeamPlayer']!.value as number[];
    centre[0] = player.x;
    centre[1] = player.z;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
