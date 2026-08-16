import type { Section } from '../music/ArrangementEngine';

/**
 * §154 SMOKE — the air the light is in.
 *
 * A festival rig is nothing without something for the beams to stand in. This
 * decides how thick the air is and when a jet fires; the renderer decides what
 * that looks like.
 *
 * Two things, and they are not the same thing. HAZE is the standing density —
 * it follows the arc of the track, so an intro is clear air and a drop is
 * thick. BLASTS are events: one goes off on the first beat of a drop, the way
 * a real one does, and smaller ones through a build as the pressure rises.
 *
 * A break clears the air. That is the same rule as everywhere else in this
 * world: the hole in the arrangement has to be a hole in the picture.
 */

/** How thick the air stands, per phase of the arc (§29.7). */
const SECTION_HAZE: Record<Section, number> = {
  none: 0.05,
  intro: 0.1,
  groove: 0.3,
  discovery: 0.35,
  build: 0.62,
  drop: 0.95,
  deep: 0.8,
  break: 0.06,
  return: 0.5,
  mutation: 0.55,
};

/** Seconds between jets while a build is at its most impatient. */
const BUILD_FASTEST = 0.9;
const BUILD_SLOWEST = 3.2;

export interface SmokeInput {
  section: Section;
  /** 0..1 how loud the picture is (§136.15). */
  intensity: number;
  /** Seconds since the last kick — a blast lands ON a beat, never between. */
  sinceKick: number;
  /** True on the frame a layer was earned: the world exhales (§29.3). */
  layerEarned: boolean;
  /** True on the frame a new track began. */
  trackChanged: boolean;
  /** 0..1 the wind the player is holding — breath blown into the room (§190). */
  wind: number;
}

export interface SmokeState {
  /** 0..1 how thick the air is right now. */
  density: number;
  /** 0..1 the jet that is firing this frame; 0 most of the time. */
  blast: number;
  /** Seconds since the last jet fired, for the renderer's own timing. */
  sinceBlast: number;
  /** Internal: the section we last fired a drop blast for. */
  firedFor: Section | null;
}

export const SMOKE_START: SmokeState = {
  density: 0,
  blast: 0,
  sinceBlast: 99,
  firedFor: null,
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function advanceSmoke(
  previous: SmokeState,
  input: SmokeInput,
  dtSeconds: number,
): SmokeState {
  // The air thickens slowly and clears fast: smoke takes time to build and a
  // break has to feel like the room emptying, not like a fade.
  // §190 (user): the left mouse button blows smoke into the world. The breath
  // rides ON TOP of what the arrangement asks for, so a break still empties
  // the room the moment you stop blowing — the fast clear-rate below is what
  // makes the exhale legible as YOURS rather than as weather.
  const target = clamp01(
    SECTION_HAZE[input.section] * (0.55 + clamp01(input.intensity) * 0.75) +
      clamp01(input.wind) * 0.4,
  );
  const rate = target > previous.density ? 0.55 : 1.9;
  const density = clamp01(previous.density + (target - previous.density) * Math.min(1, dtSeconds * rate));

  const sinceBlast = previous.sinceBlast + dtSeconds;
  let blast = 0;
  let firedFor = previous.firedFor;

  // ON THE BEAT, never between: a jet that fires off the grid reads as a fault.
  const onBeat = input.sinceKick < 0.08;

  if (input.section !== previous.firedFor) firedFor = null;

  if (input.section === 'drop' && firedFor !== 'drop' && onBeat) {
    // The one big hit of the track, at the top of the drop.
    blast = 1;
    firedFor = 'drop';
  } else if (input.section === 'build' && onBeat) {
    // Pressure rising: the jets come closer together as the build goes on.
    const gap = BUILD_SLOWEST - (BUILD_SLOWEST - BUILD_FASTEST) * clamp01(input.intensity);
    if (sinceBlast >= gap) blast = 0.45 + clamp01(input.intensity) * 0.3;
  } else if (input.section === 'return' && firedFor !== 'return' && onBeat) {
    blast = 0.6;
    firedFor = 'return';
  }

  // Earning something is worth a breath of its own, on any beat.
  if (input.layerEarned) blast = Math.max(blast, 0.5);
  // A new track clears the room; the blast comes with its first kick instead.
  if (input.trackChanged) {
    return { density: density * 0.2, blast: 0, sinceBlast: 0, firedFor: null };
  }

  return {
    density,
    blast,
    sinceBlast: blast > 0 ? 0 : sinceBlast,
    firedFor,
  };
}
