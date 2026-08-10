/**
 * The endless journey's variation engine (user decision).
 *
 * A track that is fully earned would otherwise loop its own material forever.
 * So every time the arrangement turns a corner, ONE layer is rewritten with a
 * different transform of the SAME part — you still hear that it is your kick,
 * it just moves differently.
 *
 * Which layer and which variation are a pure function of the journey seed, the
 * track number and how many turns have passed: infinite variation, and the same
 * flight always produces the same track (§25.16).
 */
import type { LayerName } from '../audio/MusicalPrimitives';

/** Layers that carry a part worth varying, in rotation order. */
export const VARIED_LAYERS: readonly LayerName[] = [
  'drums', 'bass', 'harmony', 'melody', 'texture',
];

/** How many variations exist per layer; StrudelEngine owns what they sound like. */
export const VARIATION_COUNT = 5;

export type LayerVariations = Partial<Record<LayerName, number>>;

/**
 * Rewrite one layer for this turn of the arrangement. `turn` counts section
 * changes since the journey started.
 */
export function rotateVariations(
  current: LayerVariations,
  turn: number,
  trackNumber: number,
  seed: string,
): LayerVariations {
  const layer = VARIED_LAYERS[turn % VARIED_LAYERS.length]!;
  const next = hash(`${seed}:${trackNumber}:${turn}:${layer}`) % VARIATION_COUNT;
  // A rewrite that changes nothing is a wasted turn: step one further along.
  const chosen = next === (current[layer] ?? 0) ? (next + 1) % VARIATION_COUNT : next;
  return { ...current, [layer]: chosen };
}

/** The key the next track lands in: related, never the same, always in steps. */
const KEY_STEPS: readonly number[] = [-5, 3, 2, -3, 5, -2];

export function nextRootMidi(rootMidi: number, trackNumber: number): number {
  const step = KEY_STEPS[trackNumber % KEY_STEPS.length]!;
  let root = rootMidi + step;
  // Keep the root inside the octave the bass is written for.
  while (root > 48) root -= 12;
  while (root < 36) root += 12;
  return root;
}

/** FNV-1a: small, stable, and no RNG state to carry between ticks. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}
