import type { Rng } from '../core/rng';
import { createFirstResonator, createResonator } from './Resonator';
import type { ResonatorData } from './Resonator';

/** Player spawn used for the audibility tuning below (Game starts FrequencyState at origin). */
export const SPAWN_POSITION = { x: 0, y: 0, z: 0 } as const;

/** Seeded positional jitter so each world seed feels slightly different but reproducible. */
const JITTER_UNITS = 6;

function jitter(rng: Rng): number {
  return (rng.next() * 2 - 1) * JITTER_UNITS;
}

/**
 * The three initial resonators (spec §7): clearly different frequency, timbre and location.
 *
 * Spawn audibility tuning (spec §20 M2 gate — spatial curiosity):
 * perceived level ≈ amplitude * refDistance / distance with SpatialAudio's inverse
 * panner model (refDistance 5). At spawn:
 *   first (330 Hz sine,     ~40 u):  0.50 * 5/40  ≈ 0.063  → clearly audible
 *   deep  (110 Hz triangle, ~85 u):  0.35 * 5/85  ≈ 0.021  → faint hum
 *   high  (880 Hz square,   ~66 u):  0.28 * 5/66  ≈ 0.021  → faint glint
 * The first resonator stays ≈3x louder than the others until the player moves.
 */
export function createInitialResonators(rng: Rng): ResonatorData[] {
  const first = createFirstResonator(); // ~330 Hz sine at (28, 4, -28), spec M1

  // Low register (§3.1 mass): opposite direction from the first resonator, wide field.
  const deep = createResonator({
    id: 'resonator-deep',
    position: { x: -60 + jitter(rng), y: -4, z: 66 + jitter(rng) },
    baseHz: 110,
    waveform: 'triangle',
    amplitude: 0.35,
    interactionRadius: 12, // large slow wave — interaction begins further out
    audibleRadius: 240,
    persistenceThreshold: 5,
    materialProfile: 'faceted', // triangle → faceted-but-soft matter (§3.7)
    spatialProfile: 'omni',
    active: true,
  });

  // High register (§3.1 detail): elevated, so the player must climb toward it.
  const high = createResonator({
    id: 'resonator-high',
    position: { x: 14 + jitter(rng), y: 52, z: 42 + jitter(rng) },
    baseHz: 880,
    waveform: 'square',
    amplitude: 0.28,
    interactionRadius: 5,
    audibleRadius: 150,
    persistenceThreshold: 3,
    materialProfile: 'digital', // square → rigid/pixel matter (§3.7)
    spatialProfile: 'omni',
    active: true,
  });

  return [first, deep, high];
}
