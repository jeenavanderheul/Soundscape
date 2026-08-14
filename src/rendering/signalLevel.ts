import type { Section } from '../music/ArrangementEngine';

/**
 * §136.15 THE IMAGE HAS AN INTENSITY, AND IT HAS RHYTHM.
 *
 * Six levels, from silence to overload, and the world is expected to travel
 * through them the way the music does — never parked at the top. This is the
 * only place that decides which level the world is at; the renderers read the
 * number and nothing else.
 *
 * 0 SILENCE · 1 TRACE · 2 SIGNAL · 3 RESONANCE · 4 SATURATION · 5 OVERLOAD
 */

export const SIGNAL_LEVEL_NAMES = [
  'silence', 'trace', 'signal', 'resonance', 'saturation', 'overload',
] as const;

/**
 * What a section does to the image. The arc already decides what the music
 * does; this says how loudly the picture is allowed to say it — a break is a
 * hole in the image the same way it is a hole in the arrangement.
 */
const SECTION_WEIGHT: Record<Section, number> = {
  none: 0.35,
  intro: 0.5,
  groove: 0.85,
  discovery: 0.95,
  build: 1.25,
  drop: 1.6,
  deep: 1.15,
  break: 0.3,
  return: 1.05,
  mutation: 1.35,
};

export interface SignalInput {
  /** 0..1 of the track that has been earned (`trackGrowth`). */
  growth: number;
  /** 0..1 loudness right now. */
  rms: number;
  section: Section;
  /** 0..1 of full throttle. */
  speed01: number;
  /** 0..1 dissonance and drive the player is causing (§3.6 grit). */
  grit: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The level, 0..5 and continuous — the image crossfades between states rather
 * than snapping, or every section change would read as a cut.
 */
export function signalLevel(input: SignalInput): number {
  // What has been BUILT sets the ceiling; what is happening NOW decides how
  // close to that ceiling the picture sits. A full track playing a break is
  // still a quiet image.
  const built = clamp01(input.growth) * 0.45 + clamp01(input.rms) * 0.75;
  const level = built * 5 * SECTION_WEIGHT[input.section];
  return Math.min(5, Math.max(0, level));
}

/** What the renderers actually take: everything normalised, nothing to think about. */
export interface SignalDrive {
  /** 0..1 — the level, for how much of the world is drawn at all. */
  intensity: number;
  /** 0..1 — how badly the signal is holding together (§136.11). */
  instability: number;
}

/**
 * Speed and dissonance are what break the picture up: flying hard is the
 * reconstruction struggling to keep up, not a stylistic mood.
 */
export function signalDrive(input: SignalInput): SignalDrive {
  const level = signalLevel(input);
  // Only the very top of the range breaks up on its own. Anything lower and a
  // finished track standing still would shake, which is not overload, it is a
  // fault.
  const overload = Math.max(0, level - 4.5) / 0.5;
  return {
    intensity: level / 5,
    instability: clamp01(clamp01(input.speed01) * 0.55 + clamp01(input.grit) * 0.7 + overload * 0.5),
  };
}
