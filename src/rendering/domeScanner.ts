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

export interface ScannerInput {
  /** Track tempo. 0 or less means the world has no clock yet. */
  bpm: number;
  section: Section;
  /** Analyser bands, 0..1. */
  low: number;
  mid: number;
  high: number;
  /** Seconds since the last kick; drives the intensity pulse. */
  sinceKick: number;
  /** 0..1 how badly the signal is holding together (§136.11). */
  instability: number;
}

export interface ScannerState {
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
  mode: ScannerMode;
}

export const SCANNER_START: ScannerState = {
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
  const base = TAU / orbitSeconds(input.bpm, input.section);

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

  const bearing = wrap(previous.bearing + rate * dtSeconds);
  const direction: 1 | -1 = rate < 0 ? -1 : 1;

  // DOUBLE: a second signal turning against the first, meeting twice a lap.
  const counterBearing = mode === 'double' ? wrap(-bearing + Math.PI) : null;
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

  // REVERB is not measured here; persistence rides on the tail, and the tail
  // opens with instability — a signal that is coming apart smears (§136.11).
  const tail = 0.55 + clamp01(input.instability) * 1.5;

  return { bearing, counterBearing, ghostBearing, width, intensity, elevation, tail, mode };
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
