import { ALLOWED_FUNCTIONS } from './PatternGuard';
import { RECIPE_LIMITS, RECIPE_SCHEMA, validateRecipe } from './WorldRecipe';
import type { RecipeValidation } from './WorldRecipe';

/**
 * §30: turns a sentence into a world. Calls Claude directly from the browser
 * (user decision) with the player's own API key, asks for a structured world
 * recipe plus Strudel patterns, and hands the result to validation before
 * anything reaches the engine.
 *
 * The key lives in this browser's localStorage and is sent only to
 * api.anthropic.com. The SDK is loaded lazily so it never enters the main
 * bundle for players who don't use the feature.
 */

export const MODEL = 'claude-opus-5';
const KEY_STORAGE = 'frequency:anthropic-key';

const SYSTEM_PROMPT = `You design worlds for FREQUENCY — a game where flying through a 3D world builds a music track layer by layer. The player describes a world; you return its recipe.

The world:
- Resonators are sound sources the player finds by ear. Give each one a bearing (0 = north, 90 = east), a distance from spawn (${RECIPE_LIMITS.minDistance}-${RECIPE_LIMITS.maxDistance} units), a frequency (${RECIPE_LIMITS.minHz}-${RECIPE_LIMITS.maxHz} Hz) and a waveform. Low frequencies read as mass, high as fine detail. Spread them across directions and registers so the world rewards travelling.
- Each compass direction carries one genre; flying that way rewrites the track in that grammar.
- fog and forest are 0..1 density.
- bpm is a starting tempo; the player's flight speed still drives it.

The patterns:
Write real Strudel pattern code, one expression per layer, for whichever of drums / bass / harmony / melody / texture / atmosphere fit the description. Rules:
- Use ONLY these functions: ${[...ALLOWED_FUNCTIONS].join(', ')}.
- Sounds available (strudel.cc/learn/samples + /learn/synths):
  drum samples — bd, sd, rim, cp, hh, oh, cr, rd, ht, mt, lt, sh, cb, tb, perc, misc, fx.
  Pick a drum machine with .bank("RolandTR909"), .bank("RolandTR808"), .bank("AkaiLinn") etc.
  synth voices — sine, triangle, square, sawtooth, supersaw, pulse, and the
  noise colours white, pink, brown. Use note("c2 e2") with .s("sawtooth") for pitched parts.
  sampled instruments — piano, organ_full, glockenspiel, vibraphone, marimba, harp,
  harmonica, sax, timpani, tubularbells, and hand percussion (conga, bongo, cabasa, clave).
- One chained expression per layer, no variables, no semicolons, no arrow functions, no backticks. Example shape: s("sbd*4").gain(0.8)
- Keep gains modest (0.15-0.8) so layers stack without clipping.
- Make each layer sound like the world the player described.

GENRE GRAMMAR RULE (§31) — this governs everything you write:
Never write a complete genre track. Genre is a compositional grammar, not a playlist.
Each layer you write is ONE part that the player will earn separately by flying, in this order:
CLOCK → RHYTHM → DRUMS → BASS → HARMONY → MELODY → TEXTURE.
The player must be able to say "I caused the kick", "that flight path became the melody".
So: write each layer as a part that stands alone and stacks, never as a finished arrangement.

The grammars, and what they do to a layer:
- techno — repetition. Hypnotic and mechanical, 4/4, minimal harmonic movement, short motif.
- ambient — space. Sparse or drumless, long sustained tones, wide reverb; what you leave out is the composition.
- jazz — conversation. Swing and syncopation, rich chords, phrases that vary rather than repeat.
- dnb — velocity. Broken breakbeats, heavy sub, sharp transients, short hooks.
- garage — displacement. Two-step kick leaving beat two empty, shuffled skippy hats, short syncopated sub.
- house — warmth. Four to the floor, offbeat open hat, clap on 2 and 4, piano or organ chords.
- trap — weight. Half-time 808 kick that rings, hi-hat rolls that subdivide, sliding sub, bright bells.
- breakbeat — orchestration. NO drum machine: piano, harp, glockenspiel, marimba, timpani, tubular bells; dynamics carry the form.
- experimental — mutation. Polymetric cycle lengths (5, 7) against 4, dissonance allowed, fragmentary.
- dub — echo. Mostly silence, one deep kick, offbeat skank chords, everything drenched in delay feedback.

The eight compass directions carry the ground grammars. Experimental lies high above
the world and dub deep below it, so neither is assignable to a direction.

Answer only with the structured recipe.`;

export interface WorldPromptResult {
  validation: RecipeValidation;
  /** What the model was asked for, kept for the UI. */
  description: string;
}

export class WorldPromptError extends Error {}

/** The key the player pasted, if any. Stored per browser, never transmitted elsewhere. */
export function loadApiKey(): string | null {
  try {
    return window.localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function saveApiKey(key: string): void {
  try {
    window.localStorage.setItem(KEY_STORAGE, key.trim());
  } catch {
    // Storage disabled: the key simply won't persist between sessions.
  }
}

export function clearApiKey(): void {
  try {
    window.localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Nothing to do — the key was never stored.
  }
}

/**
 * Ask Claude for a world. Errors are returned as thrown WorldPromptError with
 * a message safe to show the player (§25.17: boundary error handling).
 */
export async function requestWorld(
  description: string,
  apiKey: string,
): Promise<WorldPromptResult> {
  const trimmed = description.trim();
  if (trimmed === '') throw new WorldPromptError('Describe the world first.');
  if (apiKey.trim() === '') throw new WorldPromptError('An Anthropic API key is required.');

  // Lazy: the SDK stays out of the bundle until a player actually uses this.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: apiKey.trim(),
    // The player's own key in their own browser — the documented way to call
    // the API client-side. Never ship a shared key this way.
    dangerouslyAllowBrowser: true,
  });

  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Recommended default for this model family: a policy decline is
      // re-run server-side instead of coming back as an unusable refusal.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: RECIPE_SCHEMA },
      },
      messages: [{ role: 'user', content: `Design this world: ${trimmed}` }],
    });
  } catch (error) {
    throw new WorldPromptError(
      error instanceof Error ? `Claude could not be reached: ${error.message}` : 'Request failed.',
    );
  }

  if (response.stop_reason === 'refusal') {
    throw new WorldPromptError('Claude declined that description. Try another world.');
  }

  const text = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
  if (text === '') throw new WorldPromptError('Claude returned an empty world.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new WorldPromptError('Claude returned a malformed world.');
  }

  return { validation: validateRecipe(parsed), description: trimmed };
}
