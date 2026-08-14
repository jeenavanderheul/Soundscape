/**
 * §3: the eleven elements are physics, not sliders — so they must be audible
 * CONTINUOUSLY, from how you fly, not only as layers you unlock. This module is
 * the whole mapping in one place, as pure data:
 *
 *   §3.1 pitch     · where you are in the register  → brightness of everything
 *   §3.2 dynamics  · how hard you push the wind     → push (postgain)
 *   §3.6 harmony   · dissonance you are causing     → grit (shape)
 *   §3.7 timbre    · the waveform you chose         → brightness, grit
 *   §3.8 duration  · how long you hold a sound      → length (note length)
 *   §3.10 texture  · altitude and unhurriedness     → space (reverb)
 *   §3.1 mass      · flying low over the ground     → weight (the sub)
 *
 * §91 (user decision): height does CLANG, never pitch and never tempo. It ran
 * the track like a tape — up to a fourth down and an octave up, plus a tempo
 * trim — and a track that is being transposed and re-clocked while you fly is
 * never quite the record you built. The register you are in is now heard as
 * filter, air and weight, which cannot put anything out of tune.
 *
 * Rhythm (§3.3) is your onsets, melody (§3.5) is your pitch trajectory and
 * form (§3.11) is where the flight has been — those have their own systems.
 * Tempo belongs to the WORLD alone (§46).
 *
 * Everything is quantized: a continuously drifting number would re-evaluate the
 * Strudel pattern every frame, which §11 forbids.
 */
import type { MusicState } from './MusicState';

export interface FlightPose {
  /** Height above the terrain right under the orb. */
  altitude: number;
  amplitude: number;
  velocity: number;
}

export interface Performance {
  /** Low-pass ceiling in Hz: high flight is air, skimming the ground is dark. */
  brightHz: number;
  /** Reverb amount: altitude and unhurried movement open the space up. */
  space: number;
  /** Post-gain: the wind you are holding is the loudness of the whole track. */
  push: number;
  /** Note length multiplier: short taps stab, held wind sustains. */
  length: number;
  /** Waveshaping: the dissonance you are causing becomes edge. */
  grit: number;
  /** Sub emphasis: 1 when skimming the ground, 0 high up (§3.1 low = mass). */
  weight: number;
}

/** Height at which the world is fully "air" rather than "ground". */
export const AIR_ALTITUDE = 45;

export function performanceFrom(music: MusicState, flight: FlightPose): Performance {
  const air = clamp01(flight.altitude / AIR_ALTITUDE);
  const ground = 1 - air;
  // §3.1 + §3.7: register and timbre brightness, pulled down by flying low.
  const tone = clamp01(0.35 * music.timbreBrightness + 0.35 * pitchNorm(music.pitchCenter) + 0.3 * air);
  const weight = step(ground * ground, 8);
  return {
    // Skimming the ground closes the filter down hard: low is dark and heavy.
    brightHz: quantizeLog((300 + tone * 8700) * (1 - 0.45 * weight), 300, 9000),
    // §3.10: space is altitude plus not being in a hurry.
    space: step(clamp01(0.15 + air * 0.45 + music.spatiality * 0.3), 8),
    // §3.2: louder is not better — it is *more force*, and it is audible.
    push: 0.75 + step(clamp01(0.45 * music.dynamics + 0.55 * flight.amplitude), 8) * 0.45,
    // §3.8: duration is memory. Held wind lets notes ring into each other.
    length: 0.35 + step(clamp01(music.durationAverage), 8) * 1.15,
    // §3.6: dissonance is material, so it has a sound — edge, not error.
    grit: step(clamp01(music.dissonance * 0.8 + music.timbreNoise * 0.3), 8) * 0.4,
    // §3.1: low frequencies are mass. Skimming the ground IS the low register.
    weight,
  };
}

/** Pitch centre in Hz to 0..1 over the playable range, logarithmically (§3.1). */
function pitchNorm(hz: number): number {
  if (hz <= 0) return 0.5;
  return clamp01(Math.log(Math.max(30, hz) / 30) / Math.log(8000 / 30));
}

/** Eight steps, so a drifting value cannot churn the pattern graph (§11). */
function step(value: number, steps: number): number {
  return Math.round(clamp01(value) * steps) / steps;
}

/** Filter cutoffs are heard logarithmically, so they quantize that way too. */
function quantizeLog(hz: number, min: number, max: number): number {
  const norm = Math.log(clamp(hz, min, max) / min) / Math.log(max / min);
  return Math.round(min * Math.pow(max / min, step(norm, 8)));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
