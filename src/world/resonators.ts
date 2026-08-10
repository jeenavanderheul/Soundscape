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
 * §32: every world is in its own key. The seed picks a root, and the three
 * resonators are that root across three registers — so two flights never
 * start from the same harmonic material, while one seed stays reproducible.
 */
export function seededRoot(rng: Rng): number {
  const semitones = Math.floor(rng.next() * 12);
  return 110 * Math.pow(2, semitones / 12);
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
  // The key of this world. Registers keep their roles (mass low, detail high);
  // only the pitch class travels, so the audibility tuning below still holds.
  const key = seededRoot(rng);
  const first = createFirstResonator(key * 3); // the first voice, a fifth above the low root

  // Low register (§3.1 mass): opposite direction from the first resonator, wide field.
  const deep = createResonator({
    id: 'resonator-deep',
    position: { x: -60 + jitter(rng), y: -4, z: 66 + jitter(rng) },
    baseHz: key,
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
    baseHz: key * 8,
    waveform: 'square',
    amplitude: 0.28,
    interactionRadius: 5,
    audibleRadius: 150,
    persistenceThreshold: 3,
    materialProfile: 'digital', // square → rigid/pixel matter (§3.7)
    spatialProfile: 'omni',
    active: true,
  });

  // Track-feel expansion (user decision): four more registers within reach,
  // so the world offers enough voices to compose with (§17, §20 M2 spirit).
  const pulse = createResonator({
    id: 'resonator-pulse',
    position: { x: -34 + jitter(rng), y: 0, z: -46 + jitter(rng) },
    baseHz: key * 1.5,
    waveform: 'saw',
    amplitude: 0.3,
    interactionRadius: 8,
    audibleRadius: 200,
    persistenceThreshold: 4,
    materialProfile: 'metallic',
    spatialProfile: 'omni',
    active: true,
  });
  const root = createResonator({
    id: 'resonator-root',
    position: { x: 84 + jitter(rng), y: -2, z: 52 + jitter(rng) },
    baseHz: key / 2,
    waveform: 'sine',
    amplitude: 0.4,
    interactionRadius: 14,
    audibleRadius: 260,
    persistenceThreshold: 5,
    materialProfile: 'glass',
    spatialProfile: 'omni',
    active: true,
  });
  const mid = createResonator({
    id: 'resonator-mid',
    position: { x: -78 + jitter(rng), y: 8, z: 18 + jitter(rng) },
    baseHz: key * 4 * 1.5,
    waveform: 'triangle',
    amplitude: 0.26,
    interactionRadius: 6,
    audibleRadius: 160,
    persistenceThreshold: 3.5,
    materialProfile: 'faceted',
    spatialProfile: 'omni',
    active: true,
  });
  const air = createResonator({
    id: 'resonator-air',
    position: { x: 48 + jitter(rng), y: 34, z: -84 + jitter(rng) },
    baseHz: key * 16,
    waveform: 'sine',
    amplitude: 0.22,
    interactionRadius: 5,
    audibleRadius: 140,
    persistenceThreshold: 3,
    materialProfile: 'glass',
    spatialProfile: 'omni',
    active: true,
  });

  return [first, deep, high, pulse, root, mid, air];
}
