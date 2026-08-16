import type { Section } from '../music/ArrangementEngine';

/**
 * §146 THE DOME — the world is measured by music.
 *
 * A narrow band of light travels around an invisible hemisphere over the
 * playable world. The dome is never drawn; only what it touches reveals it,
 * which is the whole point: a rotating measurement, not a stage light.
 *
 * Geometrically it is a radar sweep. At any moment the signal arrives from one
 * BEARING, and everything whose bearing from the player is close enough to it
 * is briefly alive — brighter, noisier, lifted. Behind the beam an angular tail
 * decays, so the world fades back into darkness rather than switching off.
 *
 * This module is pure: it decides where the signal is and how wide and how
 * hard it is hitting, and nothing else. Which surfaces answer is the
 * renderers' business.
 */

/** The eight behaviours, each owned by a phase of the arc (§29.7). */
export type ScannerMode =
  | 'normal'
  | 'accelerate'
  | 'decelerate'
  | 'hold'
  | 'reverse'
  | 'double'
  | 'phase'
  | 'drop';

/**
 * A section does not pick a behaviour at random — it gets the one that says
 * what the section is. A break holds because the music is holding; a drop
 * takes the signal away and hands it back at full.
 */
const SECTION_MODE: Record<Section, ScannerMode> = {
  none: 'decelerate',
  intro: 'decelerate',
  groove: 'normal',
  discovery: 'phase',
  build: 'accelerate',
  drop: 'drop',
  deep: 'double',
  break: 'hold',
  return: 'reverse',
  mutation: 'phase',
};

/**
 * Bars per revolution. Musical divisions only — an orbit that takes 3.7
 * seconds is an orbit nobody can feel. Slower where the music is open, one
 * bar per turn at the peak.
 */
const SECTION_BARS: Record<Section, number> = {
  none: 2,
  // The intro of a real track is allowed to be slow — that is what an intro
  // is. The unreadable case was the one BEFORE there is a track at all, and
  // `orbitSeconds` handles that separately.
  intro: 8,
  groove: 4,
  discovery: 4,
  build: 2,
  drop: 1,
  deep: 2,
  break: 4,
  return: 2,
  mutation: 2,
};

/**
 * §148: how a WORLD moves its light. The section says what the music is doing;
 * this says who is doing it. Same rig, same orbit, different hand on it.
 *
 * - `steps` quantises the bearing: 0 is a smooth sweep, 4 lands the signal on
 *   the four to the bar and nowhere in between.
 * - `gate` chops the intensity at that many events per bar; 0 leaves it alone.
 * - `stutter` is how much the orbit stumbles — an irregular, repeatable
 *   hesitation, never noise for its own sake.
 * - `spread` adds standing extra signals around the ring, so a world can have
 *   three clusters running instead of one.
 */
export interface ScannerPattern {
  rate: number;
  steps: number;
  gate: number;
  stutter: number;
  spread: number;
}

export const GENRE_PATTERNS: Record<string, ScannerPattern> = {
  // The metronome world: the light lands on the beat and nowhere else.
  'locked-groove': { rate: 1, steps: 4, gate: 0, stutter: 0, spread: 0 },
  // Weight, not speed: slow, wide, no chopping.
  'sub-pressure': { rate: 0.6, steps: 0, gate: 0, stutter: 0, spread: 0 },
  // A signal being pushed past its limit: strobed on the eighths.
  'heavy-signal': { rate: 1.15, steps: 0, gate: 8, stutter: 0, spread: 0 },
  // Nothing here runs true — it advances in jumps and sometimes stalls.
  'broken-machine': { rate: 1.1, steps: 0, gate: 0, stutter: 0.75, spread: 0 },
  // Many hands: three clusters chasing each other around the ring.
  'percussion-riot': { rate: 1.35, steps: 16, gate: 0, stutter: 0.2, spread: 3 },
  // One slow arm in an empty room.
  'void-crusher': { rate: 0.45, steps: 0, gate: 0, stutter: 0, spread: 0 },
};

/** §175: the layer count at which the rig becomes one circle. */
export const FULL_ORBIT_LAYERS = 5;

const NEUTRAL_PATTERN: ScannerPattern = { rate: 1, steps: 0, gate: 0, stutter: 0, spread: 0 };

export function patternFor(genre: string | null): ScannerPattern {
  return (genre && GENRE_PATTERNS[genre]) || NEUTRAL_PATTERN;
}

/**
 * §170 FORMATIONS — what the circle is doing, as opposed to where it is.
 *
 * The rig is a ring, so everything it can say it says in circles. Until now it
 * could only say one thing: a band sweeping round. These are the others, and
 * each one belongs to a drum:
 *
 *   SWEEP     the band travels — the resting state
 *   PULSE     the whole circle lights on the KICK and dies between
 *   ALTERNATE every other fixture, and the SNARE flips which half is lit
 *   QUARTERS  four arcs, stepping round a quarter on every kick
 *   OPPOSITE  two arcs facing each other, opening and closing with the BASS
 *   RIPPLE    ring by ring outward from the crown, fired by the kick
 *
 * The rule the user set: light only ever makes circles, and the formation is
 * what happens INSIDE one.
 */
export type Formation =
  | 'sweep'
  | 'pulse'
  | 'alternate'
  | 'quarters'
  | 'opposite'
  | 'ripple'
  | 'orbit';

/** Which formation a world reaches for. The section still decides the motion. */
const GENRE_FORMATION: Record<string, Formation> = {
  'locked-groove': 'quarters',
  'sub-pressure': 'opposite',
  'heavy-signal': 'pulse',
  'broken-machine': 'alternate',
  'percussion-riot': 'ripple',
  'void-crusher': 'sweep',
};

export interface ScannerInput {
  /** Which world is holding the light (§148). */
  genre: string | null;
  /** Track tempo. 0 or less means the world has no clock yet. */
  bpm: number;
  section: Section;
  /** Analyser bands, 0..1. */
  low: number;
  mid: number;
  high: number;
  /** Seconds since the last kick; drives the intensity pulse. */
  sinceKick: number;
  /** Seconds since the last snare — the formation's switch (§170). */
  sinceSnare: number;
  /** 0..1 how badly the signal is holding together (§136.11). */
  instability: number;
  /** How many of the seven layers stand (§175). */
  layers: number;
}

export interface ScannerState {
  /** Extra standing clusters around the ring, radians (§148 spread). */
  extraBearings: number[];
  /** Where the signal is coming from, radians. */
  bearing: number;
  /** A second signal turning the other way; null unless the mode splits. */
  counterBearing: number | null;
  /** A fainter signal trailing the first; null unless the mode offsets it. */
  ghostBearing: number | null;
  /** Half-width of the band, radians. */
  width: number;
  /** 0..1 how hard it is hitting right now. */
  intensity: number;
  /** 0..1 where the band sits on the dome: 0 the horizon, 1 overhead. */
  elevation: number;
  /** How long the tail behind the beam takes to fade, radians. */
  tail: number;
  /** The un-quantised angle the orbit is really at (§148). */
  rawBearing: number;
  /** §170: what the circle is doing right now. */
  formation: Formation;
  /** §170: 0..1 how long ago the kick was — the formations fire on it. */
  kickPulse: number;
  /** §170: flips on every snare; ALTERNATE swaps halves with it. */
  flip: number;
  /** False while a hit is still sounding, so one hit flips the side once. */
  switchArmed: boolean;
  mode: ScannerMode;
}

export const SCANNER_START: ScannerState = {
  formation: 'sweep',
  kickPulse: 0,
  flip: 0,
  switchArmed: true,
  extraBearings: [],
  rawBearing: 0,
  bearing: 0,
  counterBearing: null,
  ghostBearing: null,
  width: 0.22,
  intensity: 0,
  elevation: 0.5,
  tail: 0.9,
  mode: 'normal',
};

const TAU = Math.PI * 2;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const wrap = (angle: number): number => ((angle % TAU) + TAU) % TAU;

/** Seconds for one revolution, always a whole number of bars (§146). */
export function orbitSeconds(bpm: number, section: Section): number {
  const hasClock = bpm > 20;
  const barSeconds = (60 / (hasClock ? bpm : 90)) * 4;
  // Before there is a track there is nothing to be slow FOR. At eight bars and
  // a deceleration the first thing a player ever sees was a lap every forty
  // seconds, which does not read as a light travelling at all — it reads as
  // the terrain being slightly brighter over there.
  return barSeconds * (hasClock ? SECTION_BARS[section] : 2);
}

/**
 * How hard the beam is hitting something that lies at `bearing` from the
 * player. 1 in the middle of the band, falling to 0 at its edge, with a tail
 * behind it that decays — the afterimage the world keeps until the light comes
 * round again.
 *
 * `direction` is +1 or -1 so the tail is always on the side the beam came
 * from, whichever way it is turning.
 */
export function beamStrengthAt(
  bearing: number,
  beam: number,
  width: number,
  tail: number,
  direction: 1 | -1,
): number {
  let delta = wrap(bearing - beam);
  if (delta > Math.PI) delta -= TAU;
  const behind = direction > 0 ? -delta : delta;
  if (Math.abs(delta) <= width) {
    // Inside the band: soft at the edges, never a hard edge (§146 light).
    const t = Math.abs(delta) / width;
    return 1 - t * t;
  }
  if (behind > 0 && behind <= tail + width) {
    // The tail. Exponential, so it reads as decay and not as a second band.
    const age = (behind - width) / tail;
    return Math.exp(-age * 3.4) * 0.55;
  }
  return 0;
}

/**
 * §156 THE LIFT THE BEAM PUTS ON THE GROUND, on the CPU.
 *
 * `domeBeamWide` in the GLSL below displaces the terrain where the band
 * passes. That makes it part of the SURFACE, and §35 is absolute about the
 * surface: what the player sees and what the player hits are one field, or the
 * orb ends up under a grid it is looking straight at. This is the mirror the
 * collision reads, and it must stay identical to the shader function.
 */
export function beamLiftAt(
  scanner: ScannerState,
  playerX: number,
  playerZ: number,
  x: number,
  z: number,
): number {
  const dx = x - playerX;
  const dz = z - playerZ;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.001) return scanner.intensity;
  const bearing = Math.atan2(dz, dx);
  const direction: 1 | -1 = scanner.mode === 'reverse' ? -1 : 1;
  let band = beamStrengthAt(bearing, scanner.bearing, scanner.width, scanner.tail, direction);
  if (scanner.counterBearing !== null) {
    band = Math.max(
      band,
      beamStrengthAt(bearing, scanner.counterBearing, scanner.width, scanner.tail, direction),
    );
  }
  const peak = 260 + (55 - 260) * scanner.elevation;
  const radial = Math.exp(-Math.pow((distance - peak) / (peak * 0.85), 2));
  return band * radial * scanner.intensity;
}

/**
 * Advances the signal. Everything the music does to it happens here: the
 * tempo sets the orbit, the section picks the behaviour, bass opens the band,
 * mids lift it up the dome, the kick punches the intensity, and distortion
 * makes the whole thing unsteady.
 */
export function advanceScanner(
  previous: ScannerState,
  input: ScannerInput,
  dtSeconds: number,
): ScannerState {
  const mode = SECTION_MODE[input.section];
  const pattern = patternFor(input.genre);
  const base = (TAU / orbitSeconds(input.bpm, input.section)) * pattern.rate;

  // Each behaviour is a factor on the same orbit, never a different clock.
  let rate = base;
  // No clock, no slowing down: the signal has to be legible before the music
  // has anything to say about it.
  const hasClock = input.bpm > 20;
  if (mode === 'accelerate') rate = base * 1.9;
  else if (mode === 'decelerate') rate = hasClock ? base * 0.55 : base;
  else if (mode === 'hold') rate = 0;
  else if (mode === 'reverse') rate = -base;
  else if (mode === 'drop') rate = base * 1.35;

  // §148 STUTTER: a repeatable hesitation, not noise. The hash is on the lap
  // the signal is in, so the same world stumbles the same way every time.
  const raw = previous.rawBearing + rate * dtSeconds;
  const stumble = pattern.stutter > 0
    ? 1 - pattern.stutter * (0.5 + 0.5 * Math.sin(raw * 5.7) * Math.sin(raw * 2.3))
    : 1;
  const rawBearing = previous.rawBearing + rate * dtSeconds * stumble;
  // §148 STEPS: quantised worlds land the signal on musical positions only.
  const bearing = pattern.steps > 0
    ? wrap(Math.round((rawBearing / TAU) * pattern.steps) * (TAU / pattern.steps))
    : wrap(rawBearing);
  const direction: 1 | -1 = rate < 0 ? -1 : 1;
  const extraBearings: number[] = [];
  for (let i = 1; i <= pattern.spread; i++) {
    extraBearings.push(wrap(bearing + (TAU * i) / (pattern.spread + 1)));
  }

  // DOUBLE: a second signal turning against the first, meeting twice a lap.
  //
  // User (15 aug): "met de lichteffecten wordt nu alleen maar de linker helft
  // gebruikt". True on the ground, and this line was why — outside a DOUBLE
  // section there was exactly one lamp pool, sitting on one side of the player,
  // so half the field never had a source at all. There is now always a second
  // pool straight across the ring: both halves are lit, both travel, and the
  // circle reads as a circle instead of as a lamp on the left.
  const counterBearing =
    mode === 'double' ? wrap(-bearing + Math.PI) : wrap(bearing + Math.PI);
  // PHASE: a ghost a fifth of a turn behind, faint enough to read as an echo.
  const ghostBearing = mode === 'phase' || mode === 'double'
    ? wrap(bearing - direction * 1.25)
    : null;

  // BASS opens the band and MID walks it up and down the dome. Both are
  // smoothed by the same time constant so nothing snaps on a single frame.
  const smooth = Math.min(1, dtSeconds * 2.2);
  const targetWidth = 0.16 + clamp01(input.low) * 0.42;
  const width = previous.width + (targetWidth - previous.width) * smooth;
  const targetElevation = 0.3 + clamp01(input.mid) * 0.6;
  const elevation = previous.elevation + (targetElevation - previous.elevation) * smooth;

  // KICK: a short punch, decayed by how long ago it was.
  const punch = Math.exp(-Math.max(0, input.sinceKick) * 7) * 0.55;
  // DROP: the signal disappears for the first beat of the section and comes
  // back at full — the one moment it is allowed to be absent.
  const dropGate = mode === 'drop' && input.sinceKick < 0.18 ? 0 : 1;
  const intensity = clamp01((0.45 + punch + clamp01(input.high) * 0.3) * dropGate);
  // §148 GATE: strobed worlds chop the intensity on a musical division of the
  // bar, using the same clock the orbit runs on.
  const gated = pattern.gate > 0
    ? intensity * (Math.floor((rawBearing / TAU) * pattern.gate * SECTION_BARS[input.section]) % 2 === 0 ? 1 : 0.18)
    : intensity;

  // REVERB is not measured here; persistence rides on the tail, and the tail
  // opens with instability — a signal that is coming apart smears (§136.11).
  const tail = 0.55 + clamp01(input.instability) * 1.5;

  // §170: the formation is the world's, except where the music takes it over.
  // A break has nothing to hold a shape with, and a drop is a single event —
  // both of those are the whole circle at once.
  // §175 (user rule): at five layers the rig stops holding shapes and becomes
  // ONE CIRCLE, running across every ring at once. A track with five of seven
  // standing is a track that has arrived, and the light says so by dropping
  // every trick and doing the simplest thing in the world — turning. It keeps
  // the speed the rules already give it: whole bars, the section's behaviour,
  // the world's own rate.
  const arrived = input.layers >= FULL_ORBIT_LAYERS;
  const formation: Formation = arrived
    ? 'orbit'
    : input.section === 'drop'
      ? 'pulse'
      : input.section === 'break'
        ? 'sweep'
        : GENRE_FORMATION[input.genre ?? ''] ?? 'sweep';
  const kickPulse = Math.exp(-Math.max(0, input.sinceKick) * 6.5);
  // The snare is a switch, not a level: it flips a state that stays flipped.
  //
  // Two corrections (user, 15 aug: the accent has to keep moving side to side).
  // First: the snare is the LAST drum a world earns, so until then this never
  // fired and the accent sat on one side for the whole opening. When no snare
  // has been heard for a while the kick takes over as the switch.
  // Second: "< 0.05" is true for several frames in a row, so the state used to
  // toggle once per FRAME inside that window and where it landed depended on
  // the frame rate. It now has to be re-armed by the quiet between hits.
  const onSnare = input.sinceSnare < 0.05;
  const onKick = input.sinceSnare > 4 && input.sinceKick < 0.05;
  const switching = onSnare || onKick;
  const flip = switching && previous.switchArmed ? 1 - previous.flip : previous.flip;
  const switchArmed = !switching;

  return {
    formation,
    kickPulse,
    flip,
    switchArmed,
    bearing,
    rawBearing,
    extraBearings,
    counterBearing,
    ghostBearing,
    width,
    intensity: gated,
    elevation,
    tail,
    mode,
  };
}

/**
 * The same reading, for the shaders. Mirrors `beamStrengthAt` and adds what
 * only the renderers need: the radial band. A dome light low on the horizon
 * lights the ground far away; overhead it lights the ground beneath you, so
 * elevation walks the lit ring in and out.
 *
 * `uBeamPlayer` is the centre of the dome — it travels with the player, which
 * is what makes the world feel scanned rather than lit from a fixed rig.
 */
export const DOME_SCANNER_GLSL = /* glsl */ `
uniform float uBeam;
uniform float uBeamCounter;   // < 0 when there is no second signal
uniform float uBeamGhost;     // < 0 when there is no ghost
uniform float uBeamWidth;
uniform float uBeamTail;
uniform float uBeamIntensity;
uniform float uBeamElevation;
uniform float uBeamDirection;
uniform vec2 uBeamPlayer;
// Which side carries the accent right now, 0 or 1. Declared here because every
// shader that includes this block gets it: an undeclared name does not warn in
// GLSL, it silently fails to link and the whole surface goes black.
uniform float uFlip;

float beamBand(float bearing, float beam) {
  float delta = mod(bearing - beam + 3.14159265, 6.28318531) - 3.14159265;
  float behind = uBeamDirection > 0.0 ? -delta : delta;
  float inside = abs(delta);
  if (inside <= uBeamWidth) {
    float t = inside / uBeamWidth;
    return 1.0 - t * t;
  }
  if (behind > 0.0 && behind <= uBeamTail + uBeamWidth) {
    float age = (behind - uBeamWidth) / uBeamTail;
    return exp(-age * 3.4) * 0.55;
  }
  return 0.0;
}

/**
 * The same band, but broad — for DEFORMATION only. The sharp light lifted
 * single vertices of the coarse outer rings into spikes, because a 45-unit
 * lattice cannot draw a 30-unit hill. What presses on the field has to be
 * wider than what lights it.
 */
float domeBeamWide(vec2 world) {
  vec2 fromPlayer = world - uBeamPlayer;
  float distance = length(fromPlayer);
  if (distance < 0.001) return uBeamIntensity;
  float bearing = atan(fromPlayer.y, fromPlayer.x);
  float band = beamBand(bearing, uBeam);
  if (uBeamCounter >= 0.0) band = max(band, beamBand(bearing, uBeamCounter));
  float peak = mix(260.0, 55.0, uBeamElevation);
  float radial = exp(-pow((distance - peak) / (peak * 0.85), 2.0));
  return band * radial * uBeamIntensity;
}

/**
 * §169 LIGHT THAT COMES OUT OF THE FIXTURES.
 *
 * Everything before this was a glow drawn AROUND the lamps — a sprite hanging
 * in front of the world, which is why the world underneath never got any
 * brighter for it. This is the other direction: where are the lit fixtures
 * standing, and how much of their light reaches this piece of ground.
 *
 * The lit cluster sits on the ring at the beam's bearing, so its position is
 * known exactly. Falloff is inverse-square-ish with a soft knee, which is what
 * a real fixture does and, more usefully, what makes the pool of light read as
 * having a SOURCE rather than as a wash.
 */
float lampPool(vec2 world, float bearing, float radius, float height, float gain) {
  vec2 lamp = uBeamPlayer + vec2(cos(bearing), sin(bearing)) * radius;
  // NOT the word f-l-a-t: it is an interpolation qualifier in GLSL, and naming
  // a variable with it silently fails the whole program to link. Third time
  // this class of bug has cost a round here — after backticks in comments and
  // the word h-a-l-f.
  vec2 onGround = world - lamp;
  // Height matters: a fixture 46 units up throws a wider, softer pool than one
  // at ground level, and the ground right under it is the brightest place.
  float d2 = dot(onGround, onGround) + height * height;
  // §171: tight enough that the pool has an edge you can see travelling. A
  // wide falloff is indistinguishable from turning the ambient up.
  return gain / (1.0 + d2 / 2400.0);
}

/** Everything the rig is throwing at this point of ground, right now. */
float domeLampLight(vec2 world) {
  if (uBeamIntensity <= 0.0) return 0.0;
  float lit = uBeamIntensity;
  // The accent walks from one side to the other on every hit while both pools
  // keep travelling: the circle turns, and the weight inside it swaps. Neither
  // side ever goes fully dark, or the swap reads as a light failing.
  float lead = 1.0 - uFlip * 0.45;
  float trail = 0.55 + uFlip * 0.45;
  // The two rings that actually point at the ground; the crown lights the air.
  float pool = lampPool(world, uBeam, 235.0, 4.0, lit * lead)
    + lampPool(world, uBeam, 205.0, 46.0, lit * 0.8 * lead);
  if (uBeamCounter >= 0.0) {
    pool += lampPool(world, uBeamCounter, 235.0, 4.0, lit * 0.7 * trail);
    pool += lampPool(world, uBeamCounter, 205.0, 46.0, lit * 0.55 * trail);
  }
  if (uBeamGhost >= 0.0) {
    pool += lampPool(world, uBeamGhost, 235.0, 4.0, lit * 0.35);
  }
  return pool;
}

float domeBeam(vec2 world) {
  vec2 fromPlayer = world - uBeamPlayer;
  float distance = length(fromPlayer);
  if (distance < 0.001) return uBeamIntensity;
  float bearing = atan(fromPlayer.y, fromPlayer.x);
  float band = beamBand(bearing, uBeam);
  if (uBeamCounter >= 0.0) band = max(band, beamBand(bearing, uBeamCounter));
  if (uBeamGhost >= 0.0) band = max(band, beamBand(bearing, uBeamGhost) * 0.4);
  // Where on the ground the dome is pointing, in and out with elevation.
  // 430 units put the ring out where the distance fade eats it, so in silence
  // — no mids, elevation low — there was no light anywhere the player could
  // see. The whole travel now happens inside the field you are looking at.
  float peak = mix(260.0, 55.0, uBeamElevation);
  // Narrow on purpose: at 0.6 the lit annulus was hundreds of units deep and
  // the sweep read as "the near world is bright", not as a band travelling.
  // §146 composition: only a limited section may be active at once.
  float radial = exp(-pow((distance - peak) / (peak * 0.3), 2.0));
  return band * radial * uBeamIntensity;
}
`;
