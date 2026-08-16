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

/**
 * §216 (user decision, desktop): the next key is DRAWN from the related steps
 * rather than walked through them in order. Six tracks used to march -5, +3,
 * +2, -3, +5, -2 and then repeat, so a long stay in one world was a fixed
 * modulation loop. Passing a draw makes it a related key you did not see
 * coming; the steps themselves are unchanged, so it is still never the same key
 * and never an unrelated one.
 */
export function nextRootMidi(rootMidi: number, trackNumber: number, draw?: number): number {
  const index = draw === undefined ? trackNumber : Math.floor(draw * KEY_STEPS.length);
  const step = KEY_STEPS[Math.min(KEY_STEPS.length - 1, index) % KEY_STEPS.length]!;
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
