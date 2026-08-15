import {
  AdditiveBlending,
  BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
} from 'three';
import { DOME_SCANNER_GLSL, type Formation, type ScannerState } from './domeScanner';

/** §170: the shader takes a number, not a name. */
const FORMATION_INDEX: Record<Formation, number> = {
  sweep: 0,
  pulse: 1,
  alternate: 2,
  quarters: 3,
  opposite: 4,
  ripple: 5,
  orbit: 6,
};

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
  /**
   * What a fixture gives off when the signal is nowhere near it. §172: a rig
   * you can see is a rig — the unlit fixtures read as hardware hanging in the
   * dark rather than as nothing at all.
   */
  ember: 0.34,
  /** Share of the gap between two fixtures that the bar itself fills. */
  fill: 0.62,
  /** Width of a batten as a share of its height (§149: they stand upright). */
  aspect: 0.16,
  /**
   * §150: how far past the filament the quad reaches, so there is room to draw
   * the light itself. A fixture that stops at its own edge is a highlight; the
   * glow around it is what makes it a source.
   */
  /**
   * §152 (user): five times the throw. The filament keeps its size — what
   * grows is the LIGHT, which is the part that makes a fixture read as a
   * source rather than as a lit shape.
   */
  /**
   * §171 (user): the SOURCE was too big, which is a different complaint from
   * too bright — at 30 by 26 filament-widths the quad around each batten was
   * bigger than the fixture by an order of magnitude, so what you saw was a
   * cloud with a lamp somewhere inside it. Small enough to read as an object,
   * with room left for the beam that hangs under it.
   */
  haloWidth: 9,
  haloHeight: 11,
} as const;

const VERTEX = /* glsl */ `
attribute vec2 aCorner;   // -1..1 across the bar and up it
uniform float uHaze;      // §155: how thick the air is, 0..1
uniform float uFormation; // §170: which shape the circle is holding
uniform float uKick;      // §170: 0..1, how recently the kick landed
// uFlip is declared by DOME_SCANNER_GLSL, which is prepended to this shader.
// Declaring it twice in one program is a link error, and a link error here is
// a silently black rig.
uniform float uCount;     // fixtures on this instance's ring
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
varying vec2 vQuad;
varying float vHaze;
varying float vLit;

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
  // §175 ORBIT is the exception — there the rings are IN PHASE, so the dome
  // reads as one circle turning rather than as four rings chasing each other.
  band *= uFormation > 5.5 ? 1.0 : 1.0 - aRing * 0.25;

  // §170 FORMATIONS. The rig is a ring, so everything it can say it says in
  // circles; this is what happens INSIDE one. Each shape belongs to a drum,
  // and the sweep is what it falls back to when there is nothing to hold.
  float slot = floor(aAngle / 6.2831 * uCount + 0.5);
  if (uFormation > 0.5 && uFormation < 1.5) {
    // PULSE: the whole circle on the kick, dark between. The heaviest thing
    // the rig can do, so it is reserved for the heaviest sections.
    band = max(band * 0.35, uKick);
  } else if (uFormation < 2.5) {
    // ALTERNATE: every other fixture, and the snare swaps which half burns.
    float odd = mod(slot, 2.0);
    band = max(band * 0.3, (abs(odd - uFlip) < 0.5 ? 1.0 : 0.0) * uKick * 0.9);
  } else if (uFormation < 3.5) {
    // QUARTERS: four arcs, stepping round a quarter on every kick.
    float quarter = floor(aAngle / 6.2831 * 4.0);
    float step = mod(floor(uFlip * 2.0 + uKick * 3.0), 4.0);
    band = max(band * 0.3, abs(quarter - step) < 0.5 ? uKick : 0.0);
  } else if (uFormation < 4.5) {
    // OPPOSITE: two arcs facing each other, opening with the bass.
    float toAxis = abs(sin(aAngle));
    band = max(band * 0.3, smoothstep(0.75 - uBeamWidth, 1.0, 1.0 - toAxis) * (0.4 + uKick * 0.6));
  } else if (uFormation < 5.5) {
    // RIPPLE: ring by ring outward, fired by the kick.
    float wave = fract(uKick * 1.2 + aRing * 0.55);
    band = max(band * 0.3, (1.0 - wave) * uKick);
  } else {
    // §175 ORBIT: one circle over the whole dome. No trick, no chopping — a
    // wider band so the turn is unmistakable, and the kick only brightens it.
    band = min(1.0, band * 1.25 + uKick * 0.25);
  }

  // §153: where the band passes, forty fixtures overlap and additive blending
  // adds every one of them, so the per-fixture gain has to stay low enough
  // that a CLUSTER reads as bright rather than as a white hole.
  //
  // §166: but it was cut for a frame that was never black. The colour-space
  // fix in §163 dropped the whole world by roughly a stop, and this dimming
  // sat on top of that — so the fixtures stopped reading as sources at all.
  // Calibrated against the corrected blacks, not against the washed ones.
  float hot = clamp(${DOME_LIGHTS.ember.toFixed(2)} + band * uBeamIntensity * 2.1 + uPulse * 0.2, 0.0, 2.2);
  vHot = hot;
  // §173: how much real light is on this fixture, with the ember taken OUT.
  // The glow belongs to the light, not to the hardware — hung on the hot term
  // it also hung on the resting ember, so every dark fixture in the rig
  // carried a halo it had no source for.
  vLit = clamp(band * uBeamIntensity, 0.0, 1.0);
  vHaze = uHaze;
  // §167: the colour is the world's, and only the very hottest core burns
  // toward white — the way a real fixture does when it is driven hard. It used
  // to go fully white across the whole band, which threw the region's colour
  // away exactly where the eye was looking.
  vColor = mix(uTint, vec3(1.0), clamp(band - 0.55, 0.0, 1.0) * 1.3);

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
  // The glow is measured on the QUAD, not on the filament, so making the throw
  // bigger widens the light without smearing the lamp inside it.
  vQuad = aCorner;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vHot;
varying vec2 vCorner;
varying vec2 vQuad;
varying float vHaze;
varying float vLit;
void main() {
  // §150 A LAMP, NOT A HIGHLIGHT. Two things are drawn here: the filament,
  // which is small and hard and clips white, and the light it is throwing,
  // which is soft, wide and falls off — that second part is the whole
  // difference between a shape that is bright and something that is shining.
  float filament = smoothstep(1.0, 0.45, abs(vCorner.y)) * smoothstep(1.0, 0.25, abs(vCorner.x));
  // Diffusion: wider across than along, so a batten throws sideways the way a
  // real one does, and never a hard-edged cone (§146). Measured on the quad,
  // so the throw can grow without the lamp growing with it.
  float glow = exp(-(vQuad.x * vQuad.x * 3.1 + vQuad.y * vQuad.y * 4.4));
  // Five times the area is roughly five times the light, and additive blending
  // adds it all up where fixtures overlap: at full amplitude the rig burns a
  // white hole through the middle of the world. Bigger throw, softer per pixel.
  // §155 THE BEAM. Only in smoke: a shaft is the light you can see because
  // something is in the way, so with clear air there is nothing here at all.
  // It runs DOWN from the fixture, narrowing as it goes, and it never reaches
  // a hard edge — §146 asks for a scanning beam, not a concert cone.
  float down = clamp(-vQuad.y, 0.0, 1.0);
  float taper = 1.0 - down * 0.55;
  float shaft = exp(-(vQuad.x * vQuad.x) / max(0.02, taper * taper * 0.32)) * down * (1.0 - down * 0.35);
  // §168: halved on the OUTPUT side rather than in the hot term, so the ratio
  // between a lit fixture and a resting one is untouched.
  //
  // §172 (user): but the LAMP itself may burn. These are three separate
  // things and they were being turned down together — the filament is the
  // object you are looking at, the glow is what hangs around it, and the shaft
  // is what it throws. Only the first one goes back up: bright little
  // fixtures, a modest throw.
  // §173 (user): the glow is 40% quieter, and it only burns when there is a
  // source for it. vLit is the band alone, so an unlit fixture is a bright
  // little object in the dark with nothing around it, which is what a real one
  // looks like.
  float light = filament * 1.35 + (glow * 0.114 + shaft * vHaze * 0.35) * vLit;
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
        uHaze: { value: 0 },
        uFormation: { value: 0 },
        uKick: { value: 0 },
        uFlip: { value: 0 },
        uCount: { value: 120 },
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

  /**
   * §167 (user): a red world has RED lights. The rig used to sit on a floor of
   * roughly half on every channel, which is a polite way of saying it was
   * white with a hint — techno and void-crusher hung the same lamps. The floor
   * is now the same 0.12 the forest uses, so the region's colour is what you
   * see and the fixtures name the world from a distance.
   */
  setTint(color: { r: number; g: number; b: number }): void {
    const tint = this.material.uniforms['uTint']!.value as number[];
    tint[0] = 0.12 + color.r * 0.88;
    tint[1] = 0.14 + color.g * 0.86;
    tint[2] = 0.16 + color.b * 0.84;
  }

  /** §155: how thick the air is — a beam exists only when there is smoke. */
  setHaze(density: number): void {
    this.material.uniforms['uHaze']!.value = Math.min(1, Math.max(0, density));
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
    u['uFormation']!.value = FORMATION_INDEX[scanner.formation];
    u['uKick']!.value = scanner.kickPulse;
    u['uFlip']!.value = scanner.flip;
    const centre = u['uBeamPlayer']!.value as number[];
    centre[0] = player.x;
    centre[1] = player.z;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
