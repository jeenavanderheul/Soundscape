import {
  AdditiveBlending,
  BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
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
 * §148/§149 (user): they are vertical BATTENS now, not points. A point at 200
 * units is a dot however bright you make it; an upright bar reads as a fixture
 * hanging in a rig, which is what the user asked to see — the pipe, not the
 * dash. They are still dark most of the time: a cluster lights as the signal
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
  /** Share of the gap between two fixtures that the bar itself fills. */
  fill: 0.62,
  /** Width of a batten as a share of its height (§149: they stand upright). */
  aspect: 0.16,
  /**
   * §150: how far past the filament the quad reaches, so there is room to draw
   * the light itself. A fixture that stops at its own edge is a highlight; the
   * glow around it is what makes it a source.
   */
  haloWidth: 6,
  haloHeight: 2.2,
} as const;

const VERTEX = /* glsl */ `
attribute vec2 aCorner;   // -1..1 across the bar and up it
attribute float aAngle;   // where on its ring this fixture hangs
attribute float aRing;    // 0..1 from the horizon ring to the crown
attribute float aRadius;
attribute float aHeight;
attribute float aLength;
uniform float uTime;
uniform float uPulse;
uniform vec3 uTint;
uniform float uPlayerY;
varying vec3 vColor;
varying float vHot;
varying vec2 vCorner;

void main() {
  // The rig hangs around the player and travels with them: wherever you fly,
  // the lights are around you.
  float angle = aAngle;
  vec2 ring = vec2(cos(angle), sin(angle)) * aRadius;
  vec3 centre = vec3(uBeamPlayer.x + ring.x, uPlayerY + aHeight, uBeamPlayer.y + ring.y);

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

  // A lit bar grows: the fixture opens up when the signal reaches it, the way
  // a real one does when its shutter is wide.
  float grow = 0.75 + hot * 0.5;
  // NOT the word h-a-l-f: that is reserved in GLSL and the whole program fails
  // to link, silently, as 171 identical WebGL warnings and an empty sky.
  float halfLength = aLength * 0.5 * grow;

  // §149 (user): VERTICAL battens — the pipe, not the dash. Built in view
  // space so a fixture stands upright wherever it hangs on the ring; laid
  // along the ring's tangent instead, it would turn edge-on at the sides and
  // collapse into a tick. The long axis runs up the screen and the thin one
  // across it, and the perspective still shrinks it with distance.
  vec4 mv = modelViewMatrix * vec4(centre, 1.0);
  // §150: the quad is bigger than the fixture, so the light has somewhere to
  // go. vCorner is measured in FILAMENT half-sizes, so the fragment shader can
  // tell the lamp from its glow: inside 1.0 is the batten, outside it is what
  // the batten is throwing.
  mv.x += aCorner.x * halfLength * ${DOME_LIGHTS.aspect.toFixed(2)} * ${DOME_LIGHTS.haloWidth.toFixed(1)};
  mv.y += aCorner.y * halfLength * ${DOME_LIGHTS.haloHeight.toFixed(1)};
  vCorner = vec2(aCorner.x * ${DOME_LIGHTS.haloWidth.toFixed(1)}, aCorner.y * ${DOME_LIGHTS.haloHeight.toFixed(1)});
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vHot;
varying vec2 vCorner;
void main() {
  // §150 A LAMP, NOT A HIGHLIGHT. Two things are drawn here: the filament,
  // which is small and hard and clips white, and the light it is throwing,
  // which is soft, wide and falls off — that second part is the whole
  // difference between a shape that is bright and something that is shining.
  float filament = smoothstep(1.0, 0.45, abs(vCorner.y)) * smoothstep(1.0, 0.25, abs(vCorner.x));
  // Diffusion: wider across than along, so a batten throws sideways the way a
  // real one does, and never a hard-edged cone (§146).
  float glow = exp(-(vCorner.x * vCorner.x * 0.5 + vCorner.y * vCorner.y * 1.35));
  float light = filament * 1.15 + glow * 0.6;
  if (light < 0.004) discard;
  gl_FragColor = vec4(vColor * light * vHot, 1.0);
}
`;

export class DomeLights {
  /** The rig; the Game adds this to the scene. */
  readonly points: Mesh;
  private readonly material: ShaderMaterial;
  private readonly geometry: InstancedBufferGeometry;

  constructor() {
    const angles: number[] = [];
    const rings: number[] = [];
    const radii: number[] = [];
    const heights: number[] = [];
    const lengths: number[] = [];
    DOME_LIGHTS.rings.forEach((ring, index) => {
      // A bar fills most of the gap to its neighbour, leaving the rig readable
      // as separate fixtures rather than a solid hoop.
      const length = ((Math.PI * 2 * ring.radius) / ring.count) * DOME_LIGHTS.fill;
      for (let i = 0; i < ring.count; i++) {
        angles.push((i / ring.count) * Math.PI * 2);
        rings.push(index / (DOME_LIGHTS.rings.length - 1));
        radii.push(ring.radius);
        heights.push(ring.height);
        lengths.push(length);
      }
    });

    // One quad, instanced once per fixture. The bar is built in the shader
    // from its angle, so nothing here has to know where the player is.
    this.geometry = new InstancedBufferGeometry();
    this.geometry.setAttribute(
      'aCorner',
      new BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2),
    );
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(4 * 3), 3),
    );
    this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.geometry.setAttribute('aAngle', new InstancedBufferAttribute(new Float32Array(angles), 1));
    this.geometry.setAttribute('aRing', new InstancedBufferAttribute(new Float32Array(rings), 1));
    this.geometry.setAttribute('aRadius', new InstancedBufferAttribute(new Float32Array(radii), 1));
    this.geometry.setAttribute('aHeight', new InstancedBufferAttribute(new Float32Array(heights), 1));
    this.geometry.setAttribute('aLength', new InstancedBufferAttribute(new Float32Array(lengths), 1));
    this.geometry.instanceCount = angles.length;

    this.material = new ShaderMaterial({
      vertexShader: `${DOME_SCANNER_GLSL}\n${VERTEX}`,
      fragmentShader: FRAGMENT,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      uniforms: {
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
    this.points = new Mesh(this.geometry, this.material);
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
