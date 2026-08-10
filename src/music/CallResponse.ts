/**
 * §31 JAZZ: MUSIC AS CONVERSATION.
 *
 * In every other region the world reacts to the player. In Jazz it ANSWERS.
 * The phrase the player traces through pitch space is a call; a moment later
 * another voice replies with a variation of that same phrase — transposed,
 * inverted, or turned around — the way a second musician would.
 *
 *   PLAYER    c4 — eb4 — g4
 *   WORLD                  bb3 — g3 — d4
 *   PLAYER                            f4 — ab4
 *   WORLD                                     c4 — eb4
 *
 * Pure and deterministic: the same call in the same state always produces the
 * same answer, so the conversation is reproducible (§25 determinism).
 */

export interface CallResponseConfig {
  /** Silence after a call before the world takes its turn. */
  responseDelayMs: number;
  /** How long an answer stays in the track before the floor is free again. */
  responseHoldMs: number;
  /** Semitone movement that makes a trajectory count as a phrase worth answering. */
  minRange: number;
  /** Notes in an answer. */
  length: number;
}

export const CALL_RESPONSE_CONFIG: CallResponseConfig = {
  responseDelayMs: 1200,
  responseHoldMs: 4000,
  minRange: 3,
  length: 3,
};

export type ResponseShape = 'transpose' | 'invert' | 'retrograde';

/** The three answers a musician has to a phrase they just heard. */
export function respondTo(call: readonly number[], shape: ResponseShape): number[] {
  if (call.length === 0) return [];
  const pivot = call[0]!;
  switch (shape) {
    // Same shape, lower voice: agreement.
    case 'transpose':
      return call.map((note) => note - 5);
    // Mirror around the first note: disagreement, still in key.
    case 'invert':
      return call.map((note) => pivot - (note - pivot));
    // The phrase played backwards: the idea, reconsidered.
    case 'retrograde':
      return [...call].reverse();
  }
}

/**
 * Whose turn it is. The player plays; when the phrase stops moving the world
 * answers; then the floor returns to the player.
 */
export class CallResponse {
  private call: number[] = [];
  private answer: number[] = [];
  private lastMoveMs: number | null = null;
  private answeredAtMs: number | null = null;
  private exchanges = 0;

  constructor(private readonly config: CallResponseConfig = CALL_RESPONSE_CONFIG) {}

  reset(): void {
    this.call = [];
    this.answer = [];
    this.lastMoveMs = null;
    this.answeredAtMs = null;
    this.exchanges = 0;
  }

  /**
   * Feed the phrase the player is currently tracing. Returns the world's
   * answer as midi notes, or an empty array while it is the player's turn.
   */
  tick(nowMs: number, phrase: readonly number[]): readonly number[] {
    const moved = phrase.length > 0 && !same(phrase, this.call);
    if (moved) {
      this.call = [...phrase];
      this.lastMoveMs = nowMs;
      // A new call interrupts the previous answer: the player took the floor.
      this.answer = [];
      this.answeredAtMs = null;
      return this.answer;
    }

    if (this.answeredAtMs !== null) {
      if (nowMs - this.answeredAtMs > this.config.responseHoldMs) {
        this.answer = [];
        this.answeredAtMs = null;
      }
      return this.answer;
    }

    const worthAnswering = range(this.call) >= this.config.minRange;
    const heardEnough =
      this.lastMoveMs !== null && nowMs - this.lastMoveMs >= this.config.responseDelayMs;
    if (worthAnswering && heardEnough) {
      // Each exchange takes a different angle, so a long conversation
      // develops instead of echoing.
      const shapes: ResponseShape[] = ['transpose', 'invert', 'retrograde'];
      const shape = shapes[this.exchanges % shapes.length]!;
      this.answer = respondTo(this.call.slice(0, this.config.length), shape);
      this.answeredAtMs = nowMs;
      this.exchanges += 1;
    }
    return this.answer;
  }

  /** How many times the world has taken its turn — the depth of the conversation. */
  get turns(): number {
    return this.exchanges;
  }
}

function range(notes: readonly number[]): number {
  if (notes.length < 2) return 0;
  return Math.max(...notes) - Math.min(...notes);
}

function same(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((note, index) => note === b[index]);
}
