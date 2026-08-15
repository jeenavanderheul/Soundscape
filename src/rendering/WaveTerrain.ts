import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  FloatType,
  LineSegments,
  NearestFilter,
  RedFormat,
  ShaderMaterial,
} from 'three';
import type { Vec3Data } from '../player/FrequencyState';
import { LAND_FIELD_GLSL, sampleLand, type LandField } from '../world/LandField';
import { DOME_SCANNER_GLSL, type ScannerState } from './domeScanner';
import {
  createNoiseTable,
  TERRAIN_FIELD,
  TERRAIN_FIELD_GLSL,
  terrainHeight,
  terrainMotion,
} from './terrainField';

/**
 * §13 waveform landscape, poster direction: an oscilloscope field of scan
 * lines that stays almost invisible in the void and SWELLS where resonance
 * happens (user decision: terrain grows from interaction). Height and color
 * come from excitation sources: the player's wind, engaged resonators and
 * born structures. Low hz → long slow hills (red zone), high hz → fine
 * ripples (green), mid/square → purple (§3.1 + poster palette).
 *
 * §138: the field is drawn in concentric rings of decreasing line density out
 * to ~1440 units, so there is a horizon to fly towards. See `TERRAIN_LOD`.
 */

export const TERRAIN_CONFIG = {
  /**
   * §138: these no longer describe the whole field — they describe the FINEST
   * level of it. `size / columns` and `size / (rows - 1)` are the base cell,
   * which is both the spacing of the near scan lines and the step everything
   * snaps to.
   */
  size: 360,
  rows: 96,
  columns: 192,
  planeY: -6,
  /** §44: draw one depth line every N columns — sparser than the scan lines. */
  depthLineEvery: 4,
  maxSources: 12,
  /** Idle ripple so the void is never a black screen (faint reference). */
  idleAmplitude: 0.18,
  exciteRise: 0.9,
  exciteDecayPerSec: 0.08,
  /** Structures excite permanently at this floor. */
  permanentFloor: 0.55,
} as const;

/**
 * §138 DEPTH TO THE HORIZON — concentric rings, not a quadtree.
 *
 * A quadtree refines around a point and would let a hill far off to one side
 * stay dense while the rest coarsens. It also needs its patches built, pooled
 * and swapped while flying, and the only thing the level of a patch could
 * depend on here is distance from the player — because nothing in this field
 * is occluded or streamed. Rings give exactly that dependency for one geometry
 * built once at startup, with no per-frame allocation and nothing to rebuild
 * when the player crosses a boundary. So: rings.
 *
 * Each level is a lattice whose step is a whole multiple of the base cell, and
 * every level shares ONE snapped origin. That is what keeps a coarse line
 * standing at a fixed world position: the coarse lattice is a strict subset of
 * the fine one, so a line that changes level is replaced by a line in the same
 * place and only the lines BETWEEN it appear or disappear. Nothing slides.
 *
 * `halfX`/`halfZ` are half-extents in base cells and must divide by `step`;
 * each ring is hollow where the previous level already covers the ground.
 */
const TERRAIN_LOD = [
  { step: 1, halfX: 96, halfZ: 47 }, // ±180 × ±178, today's field, untouched
  { step: 4, halfX: 192, halfZ: 96 }, // ±360 × ±364
  { step: 12, halfX: 384, halfZ: 192 }, // ±720 × ±728
  { step: 24, halfX: 768, halfZ: 384 }, // ±1440 × ±1455
] as const;

/**
 * §141 NO HOLES AT THE SEAMS.
 *
 * A ring's lattice is coarser than the one inside it, so three out of every
 * four fine scan lines have no counterpart to continue into and simply STOP at
 * the boundary. That dangling row is the hole in the grid — the classic LOD
 * crack, and the classic answer is the one clipmaps use: a line that is about
 * to disappear slides onto the neighbour that survives, before it reaches the
 * edge, so nothing ever ends in mid-air.
 *
 * `lattice` is the spacing of the COARSER ring in world units and `morph` runs
 * 0 → 1 across the outer band of a ring. Mirrored in the vertex shader; this
 * copy exists so the seam can be proven whole on the CPU.
 */
export function morphToCoarse(value: number, lattice: number, morph: number): number {
  const snapped = Math.round(value / lattice) * lattice;
  return value + (snapped - value) * Math.min(1, Math.max(0, morph));
}

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
uniform vec3 uZoneColor;   // §33: the colour of the region being flown through
uniform float uRelief;     // §33: how mountainous this direction is
uniform float uSignal;     // §136.15: 0..1 how present the image is allowed to be
uniform float uUnstable;   // §136.11: 0..1 how badly the signal holds together
attribute vec2 aLattice;   // §141: spacing of the ring outside this one
attribute float aMorph;    // §141: 0 inside the ring, 1 at its outer edge
varying float vGlow;
varying vec3 vZone;
varying float vRidge;
varying float vSeed;   // §136.6: which signal state this stretch of line is in
varying float vFar;    // 0 at the lens, 1 at the edge of the drawn field
varying float vBeam;   // §146: how hard the dome signal is on this stretch

${TERRAIN_FIELD_GLSL}
${LAND_FIELD_GLSL}
${DOME_SCANNER_GLSL}

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
  // §141: slide onto the coarser lattice across the outer band of this ring,
  // so every line that cannot continue outwards has already merged with the
  // one that can. No dangling rows, no crack. The innermost ring carries
  // aMorph = 0 everywhere, so the ground under the player never moves.
  if (aMorph > 0.0) {
    vec2 snapped = floor(world / aLattice + 0.5) * aLattice;
    world = mix(world, snapped, aMorph);
    pos.xz = world - uOrigin;
  }
  // Idle reference ripple: barely-there breathing of the void.
  float h = ${TERRAIN_CONFIG.idleAmplitude.toFixed(2)} *
    sin(world.x * 0.045 + uTime * 0.35) * sin(world.y * 0.06 + uTime * 0.22);
  // §29.6: the bassline IS the moving ridge landscape.
  h += uBass * ${TERRAIN_FIELD.bassAmplitude.toFixed(2)} * sin(world.x * 0.028 + uTime * 0.55) * cos(world.y * 0.021 - uTime * 0.4);
  // §33/§35: REGION RELIEF — the standing shape of the land, identical to
  // the CPU-side height function the collision uses.
  float fromSpawn = clamp((length(world) - 20.0) / 120.0, 0.0, 1.0);
  float relief = terrainRelief(world, uRelief);
  h += relief;
  // §132: the real ground of a real place, added to the standing shape. The
  // collision adds exactly this line on the CPU, in groundHeightAt; one of the
  // two without the other is the §35 bug all over again.
  h += sampleLand(world) * uLandPresent;
  vRidge = relief;
  // §146: the beam does not only light the field, it DEFORMS it — a
  // measurement pressing on what it measures. Bass opens the band, so the
  // louder the low end the broader and heavier the pass.
  float beam = domeBeam(world);
  h += domeBeamWide(world) * (0.8 + uBass * 2.2);
  vBeam = beam;
  float glow = uBass * 0.25 + beam * 0.5;
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
    float amp = mix(${TERRAIN_FIELD.exciteAmpLow.toFixed(1)}, ${TERRAIN_FIELD.exciteAmpHigh.toFixed(1)}, s.w);
    h += envelope * wave * amp * (1.0 + uPulse * 0.35);
    glow += envelope;
    zone += zoneColor(s.w) * envelope;
  }
  // §136.6: every stretch of line gets its own signal strength, smoothly, so a
  // whole segment shares a state instead of flickering per vertex.
  vSeed = terrainNoise(world * 0.09 + vec2(uTime * 0.03, 0.0));
  // §136.11 UNSTABLE: the reconstruction misses by a little. Never enough to
  // move the ground the player collides with — this is the drawing shaking,
  // and it stays under a tenth of a unit.
  float jitter = (terrainNoise(world * 0.7 + uTime * 1.7) - 0.5) * uUnstable;
  pos.x += jitter * 0.09;
  pos.z += jitter * 0.06;
  pos.y += h + jitter * 0.05;
  // Lantern: an always-on pool of light under the orb, so the field beneath
  // the player is ALWAYS a visible reference (game-style spot, no lighting rig).
  float dPlayer = distance(world, uPlayer);
  float lantern = exp(-(dPlayer * dPlayer) / (26.0 * 26.0)) * 0.85;
  vGlow = clamp(glow + lantern + abs(h) * 0.12 + vRidge * 0.03, 0.0, 1.6);
  // Excitation colour on top of the region's own colour: what the player
  // makes is always readable against where the player is (§33).
  // §33/§45: the region's colour, arriving within a short flight of spawn.
  // Tying it to the RELIEF fade (140 units) meant the land stayed colourless
  // exactly where the player starts, which is why every region looked alike.
  float colourIn = clamp((length(world) - 8.0) / 45.0, 0.0, 1.0);
  vZone = zone + uZoneColor * (0.8 + vRidge * 0.1) * colourIn;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  // §136.13/§138: the field now reaches ~1440 units, so distance is measured
  // over that whole reach. The curve is steep up close — near and mid keep the
  // falloff they had — and it deliberately stops short of black: brightness may
  // no longer be what removes the far field. That is the fragment shader's job,
  // where distance turns into LOST and GHOST instead of into haze.
  float depth = max(0.0, -mv.z - 40.0);
  vFar = clamp(pow(depth / 1400.0, 0.55), 0.0, 1.0);
  vGlow *= 1.0 - vFar * 0.8;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
${DOME_SCANNER_GLSL}
uniform float uTime;
uniform float uSignal;
uniform float uUnstable;
varying float vGlow;
varying vec3 vZone;
varying float vRidge;
varying float vSeed;
varying float vFar;
varying float vBeam;

/**
 * §136.6 A LINE HAS STATES. One perfectly clean wireframe everywhere is what
 * makes a generative world look like a mesh instead of a measurement, so every
 * stretch of line asks how much signal there is and answers with one of six
 * behaviours. Which stretch gets which is vSeed: a line needs more signal
 * than its own demand to be drawn cleanly.
 *
 *   TRACE       the faintest the line is allowed to get — never gone
 *   GHOST       barely there, grey, no colour left in it
 *   WEAK        dim, breathing with the music
 *   CLEAN       thin and precise, the resting state
 *   OVERDRIVEN  clipping white at the top of the range
 *
 * §142 (user decision): the grid is NEVER BROKEN. LOST used to discard the
 * fragment, which is the one state that takes the surface away instead of
 * dimming it, and holes in the grid is what the player saw. The line now has a
 * floor it can sink to but not through, and everything else about the states
 * stays: the picture still breathes with the music, it just breathes in
 * brightness rather than in geometry. This is a deliberate step back from
 * §136.6's LOST and §136.13's "distance removes information" — the whole
 * surface outranks them.
 *
 * UNSTABLE is not a sixth branch but a modifier: displacement in the vertex
 * shader and, here, a fringe of the EXISTING accent colours — §136.17 allows
 * channel displacement, and only in red, green and purple.
 */
void main() {
  vec3 base = vec3(0.62, 0.72, 0.74); // cold monochrome scan line
  // The region TINTS the line rather than only adding to it, so a red world
  // has red scan lines instead of white ones with a red wash behind them.
  vec3 lit = base * (0.10 + vGlow * 0.9);
  vec3 color = mix(lit, lit * (vZone + 0.15), clamp(length(vZone), 0.0, 1.0))
    + vZone * 0.85 + vec3(vRidge * 0.012);

  // How much signal is reaching this line. Distance costs information as well
  // as brightness (§136.13), so the far field thins out into states.
  // The lantern and every excitation source are signal too: where something is
  // happening the lines exist, even in silence. Without this, level 0 is a
  // black screen you cannot fly in — and it would also be a lie, because the
  // player standing there IS a source (§136.3).
  // vFar carries most of the weight (§138): at the edge of the reach it costs
  // more signal than the loudest world can supply, so the horizon sinks to the
  // floor — a complete but very faint wireframe, since §142 says the grid may
  // thin towards nothing and never actually reach it.
  // §146: the beam is signal. Where it passes, lines that were sitting at the
  // floor climb through WEAK and CLEAN into OVERDRIVEN, and behind it they
  // sink back — the world is revealed rather than lit.
  // The beam has to beat the distance fade on its own, or the ring is only
  // ever visible where the world was already bright.
  float strength = uSignal * 1.45 + min(vGlow, 1.2) * 0.5 + vBeam * 2.2 - vSeed - vFar * 1.6;

  float k;
  if (strength < -0.22) {
    // TRACE: the floor. Present, readable against black, never absent.
    k = 0.07;
    color = vec3(dot(color, vec3(0.33)));
  } else if (strength < -0.08) {
    k = 0.14;                                 // GHOST
    color = vec3(dot(color, vec3(0.33)));     //   colourless after-image
  } else if (strength < 0.12) {
    // WEAK: dim and intermittent. The blink runs on the clock, so a quiet
    // world reads as a signal that keeps dropping out rather than a dim one.
    float blink = step(0.35, fract(sin(vSeed * 91.7 + uTime * 2.3) * 43758.5453));
    k = 0.3 + blink * 0.35;
  } else if (strength > 0.85) {
    // OVERDRIVEN: past white. Additive blending does the clipping for us.
    k = 1.0 + (strength - 0.85) * 2.6;
  } else {
    k = 1.0;                                  // CLEAN
  }

  // UNSTABLE: the channels come apart a little. Red, green and purple only.
  if (uUnstable > 0.01) {
    float pick = fract(vSeed * 7.31);
    vec3 accent = pick < 0.34 ? vec3(1.0, 0.18, 0.16)
                : pick < 0.67 ? vec3(0.35, 1.0, 0.3)
                              : vec3(0.62, 0.35, 1.0);
    float fringe = uUnstable * 0.35 * step(0.6, fract(vSeed * 13.7 + uTime * 0.9));
    color += accent * fringe * k;
  }

  // §146: and it is LIGHT, not only a state. The signal states decide whether
  // a line is drawn cleanly; this is what makes the band read as illumination
  // sweeping over it, white and clipping at the centre.
  color *= 1.0 + vBeam * 2.6;
  gl_FragColor = vec4(color * k, 1.0);
}
`;

/** Stand-in so the sampler is always bound; `uLandPresent` 0 ignores it. */
const EMPTY_LAND_TEXTURE = new DataTexture(new Float32Array(1), 1, 1, RedFormat, FloatType);
EMPTY_LAND_TEXTURE.needsUpdate = true;

export class WaveTerrain {
  readonly lines: LineSegments;
  /** Shared with the collision: one table, one landscape (§35). */
  private readonly noise: Float32Array;
  private relief = 0.12;
  private elapsedSeconds = 0;
  private readonly material: ShaderMaterial;
  private readonly sources: TerrainSource[] = [];
  private readonly sourceArray: Float32Array;
  private pulse = 0;
  /** §132: the real ground, once it has loaded. Null is a valid world. */
  private land: LandField | null = null;
  private landTexture: DataTexture | null = null;
  private beamOverride: number | null = null;

  constructor(seed = 'frequency') {
    this.noise = createNoiseTable(seed);
    const geometry = buildLodGrid();
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
        uZoneColor: { value: [0.16, 0.2, 0.24] },
        uRelief: { value: 0.12 },
        uNoise: { value: Array.from(this.noise) },
        uLand: { value: EMPTY_LAND_TEXTURE },
        uLandSize: { value: 1 },
        uLandUnitsPerSample: { value: 1 },
        uLandOrigin: { value: [0, 0] },
        uLandSeaLevel: { value: 0 },
        uLandVerticalScale: { value: 0 },
        uLandPresent: { value: 0 },
        uSignal: { value: 0.35 },
        uUnstable: { value: 0 },
        uBeam: { value: 0 },
        uBeamCounter: { value: -1 },
        uBeamGhost: { value: -1 },
        uBeamWidth: { value: 0.22 },
        uBeamTail: { value: 0.9 },
        uBeamIntensity: { value: 0 },
        uBeamElevation: { value: 0.5 },
        uBeamDirection: { value: 1 },
        uBeamPlayer: { value: [0, 0] },
      },
    });
    this.lines = new LineSegments(geometry, this.material);
    this.lines.position.y = TERRAIN_CONFIG.planeY;
    this.lines.frustumCulled = false;
  }

  /** §138: what the whole LOD field costs, for the dev handle. */
  get vertexCount(): number {
    return this.lines.geometry.getAttribute('position').count;
  }

  /**
   * §136.6/§136.15: how present the image is, and how badly it is holding
   * together. Everything about line quality follows from these two numbers.
   */
  setSignal(intensity: number, instability: number): void {
    this.material.uniforms['uSignal']!.value = Math.min(1, Math.max(0, intensity));
    this.material.uniforms['uUnstable']!.value = Math.min(1, Math.max(0, instability));
  }

  /**
   * §146: where the dome signal is, this frame. Negative bearings mean "no
   * second signal" — a uniform cannot be null, and a sentinel is cheaper than
   * a branchful of extra uniforms.
   */
  setScanner(scanner: ScannerState, player: { x: number; z: number }): void {
    const u = this.material.uniforms;
    if (this.beamOverride !== null) {
      u['uBeamIntensity']!.value = this.beamOverride;
    }
    u['uBeam']!.value = scanner.bearing;
    u['uBeamCounter']!.value = scanner.counterBearing ?? -1;
    u['uBeamGhost']!.value = scanner.ghostBearing ?? -1;
    u['uBeamWidth']!.value = scanner.width;
    u['uBeamTail']!.value = scanner.tail;
    if (this.beamOverride === null) u['uBeamIntensity']!.value = scanner.intensity;
    u['uBeamElevation']!.value = scanner.elevation;
    u['uBeamDirection']!.value = scanner.mode === 'reverse' ? -1 : 1;
    const centre = u['uBeamPlayer']!.value as number[];
    centre[0] = player.x;
    centre[1] = player.z;
  }

  /**
   * DEV: pin the dome's intensity so it can be switched on and off between two
   * otherwise identical frames. Three rounds of "I still cannot see it" is
   * three rounds too many to keep guessing at.
   */
  forceBeam(intensity: number | null): void {
    this.beamOverride = intensity;
  }

  /** DEV: what the shader is being told about the dome, for verification. */
  beamUniforms(): Record<string, unknown> {
    const u = this.material.uniforms;
    return {
      bearing: u['uBeam']!.value,
      width: u['uBeamWidth']!.value,
      tail: u['uBeamTail']!.value,
      intensity: u['uBeamIntensity']!.value,
      elevation: u['uBeamElevation']!.value,
      player: [...(u['uBeamPlayer']!.value as number[])],
    };
  }

  /** BeatSync hook: world pulse ripples through the field (§12). */
  setPulse(value: number): void {
    this.pulse = value;
  }

  /** §33: the region the player is in decides the colour and the horizon. */
  setZone(color: { r: number; g: number; b: number }, relief: number): void {
    const uniform = this.material.uniforms['uZoneColor']!.value as number[];
    uniform[0] = color.r;
    uniform[1] = color.g;
    uniform[2] = color.b;
    this.material.uniforms['uRelief']!.value = relief;
    this.relief = relief;
  }

  /**
   * §35: the height of the solid landscape at a world position. This is what
   * the orb collides with — the same field the shader draws.
   */
  /**
   * §35 (user decision): the grid is solid, so the ground is the WHOLE drawn
   * surface — the standing shape plus the bass ridge and every excitation wave
   * that lifts it. Anything less and the orb can end up under a grid it is
   * looking straight at.
   */
  groundHeightAt(x: number, z: number): number {
    return (
      TERRAIN_CONFIG.planeY +
      terrainHeight(this.noise, x, z, this.elapsedSeconds, this.relief) +
      (this.land ? sampleLand(this.land, x, z) : 0) +
      terrainMotion(x, z, this.elapsedSeconds, this.bassLevel, this.pulse, this.sources)
    );
  }

  /**
   * §132: hang the baked square under the grid. NEAREST is not a preference —
   * `LAND_FIELD_GLSL` does the bilinear blend itself, and a second, hardware
   * blend on top of it would make the drawn ground and the solid ground
   * disagree by exactly the amount you fall through.
   */
  setLand(land: LandField): void {
    this.land = land;
    this.landTexture?.dispose();
    const texture = new DataTexture(land.height, land.size, land.size, RedFormat, FloatType);
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.landTexture = texture;
    const u = this.material.uniforms;
    u['uLand']!.value = texture;
    u['uLandSize']!.value = land.size;
    u['uLandUnitsPerSample']!.value = land.unitsPerSample;
    (u['uLandOrigin']!.value as number[])[0] = land.originX;
    (u['uLandOrigin']!.value as number[])[1] = land.originZ;
    u['uLandSeaLevel']!.value = land.seaLevel;
    u['uLandVerticalScale']!.value = land.verticalScale;
    u['uLandPresent']!.value = 1;
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
      // past the camera instead of riding along with it. §138: every LOD ring
      // rides on this one snap, in the FINEST cell, which is what keeps the
      // coarse lattices exact subsets of the fine one.
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
    this.elapsedSeconds = elapsedSeconds;
    this.material.uniforms.uTime!.value = elapsedSeconds;
    this.material.uniforms.uPulse!.value = Math.min(1.5, this.pulse + this.flash);
    this.material.uniforms.uBass!.value = this.bassLevel;
    this.material.uniforms.uSources!.value = packSources(this.sources, this.sourceArray);
    this.material.uniforms.uSourceCount!.value = this.sources.length;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.material.dispose();
    this.landTexture?.dispose();
  }
}

/**
 * §44: scan lines ACROSS and lines RUNNING AWAY. A field of horizontal lines
 * alone reads as a 2.5D waveform plane; the perpendicular set turns it into a
 * wireframe surface you can see the depth of. They are drawn sparser than the
 * scan lines so the poster look survives — a grid, not graph paper.
 *
 * §138: the same two sets, once per LOD ring, into one buffer. Every level
 * shares the origin and the material, so the whole field is still a single
 * draw call and the only thing a ring changes is where the field is SAMPLED.
 * The height function is untouched — §35 is about what the field is, not
 * about how finely it is read.
 */
function buildLodGrid(): BufferGeometry {
  const { size, rows, columns, depthLineEvery } = TERRAIN_CONFIG;
  const cellX = size / columns;
  const cellZ = size / (rows - 1);
  const positions: number[] = [];
  const lattices: number[] = [];
  const morphs: number[] = [];
  TERRAIN_LOD.forEach((level, index) => {
    const hole = index === 0 ? null : TERRAIN_LOD[index - 1]!;
    // A segment is dropped only when BOTH ends stand on ground the finer level
    // already draws; anything crossing the seam is kept, so the rings meet
    // without a gap and without drawing the same line twice.
    const covered = (i: number, j: number): boolean =>
      hole !== null && Math.abs(i) <= hole.halfX && Math.abs(j) <= hole.halfZ;
    const { step, halfX, halfZ } = level;
    // §141: what this ring's lines have to become before they run out of ring.
    const outer = TERRAIN_LOD[index + 1];
    const lattice = outer ? [outer.step * cellX, outer.step * cellZ] : [cellX, cellZ];
    /**
     * How far into the outer band a vertex is, 0..1. The band is the last
     * quarter of the ring, measured on whichever axis is closest to its edge —
     * a corner belongs to both, so the larger of the two wins.
     */
    const morphAt = (i: number, j: number): number => {
      if (!outer) return 0;
      const edge = Math.max(Math.abs(i) / halfX, Math.abs(j) / halfZ);
      return Math.min(1, Math.max(0, (edge - 0.75) / 0.25));
    };
    const push = (i: number, j: number): void => {
      positions.push(i * cellX, 0, j * cellZ);
      lattices.push(lattice[0]!, lattice[1]!);
      morphs.push(morphAt(i, j));
    };
    for (let j = -halfZ; j <= halfZ; j += step) {
      for (let i = -halfX; i < halfX; i += step) {
        if (covered(i, j) && covered(i + step, j)) continue;
        push(i, j);
        push(i + step, j);
      }
    }
    const depthStep = step * depthLineEvery;
    for (let i = -halfX; i <= halfX; i += depthStep) {
      for (let j = -halfZ; j < halfZ; j += step) {
        if (covered(i, j) && covered(i, j + step)) continue;
        push(i, j);
        push(i, j + step);
      }
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aLattice', new BufferAttribute(new Float32Array(lattices), 2));
  geometry.setAttribute('aMorph', new BufferAttribute(new Float32Array(morphs), 1));
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
