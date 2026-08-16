/**
 * Hand-written types for @strudel/web@1.3.0, which ships no TypeScript types.
 * Declares ONLY the API surface StrudelEngine.ts uses, verified against the
 * installed package sources:
 * - node_modules/@strudel/web/web.mjs           (initStrudel)
 * - node_modules/@strudel/core/repl.mjs         (repl return object)
 * - node_modules/@strudel/webaudio/webaudio.mjs (webaudioRepl audioContext option)
 * - node_modules/superdough/superdough.mjs      (getSuperdoughAudioController)
 * Re-verify this file when bumping the pinned version.
 */
declare module '@strudel/web' {
  /** One scheduled sound, as @strudel/core's `queryArc` returns it (a Hap). */
  export interface StrudelHap {
    /** Cycle span; `whole` is absent for fragments, which never trigger sound. */
    whole?: { begin: number; end: number } | undefined;
    part: { begin: number; end: number };
    /** Thecontrols: `s`, `note`, `gain`, `orbit`, … */
    value: Record<string, unknown>;
  }

  export interface StrudelPattern {
    queryArc(begin: number, end: number): StrudelHap[];
  }

  export interface StrudelRepl {
    /** `pattern` is the live stack; querying it is how the visuals learn the notes. */
    scheduler: { now(): number; pattern?: StrudelPattern | undefined; cps?: number };
    evaluate(code: string, autostart?: boolean, shouldHush?: boolean): Promise<unknown>;
    start(): void;
    stop(): void;
    pause(): void;
    setCps(cps: number): unknown;
  }

  export interface InitStrudelOptions {
    /** Forwarded to webaudioRepl; superdough adopts this context via setAudioContext. */
    audioContext?: AudioContext;
    prebake?: () => Promise<unknown>;
    miniAllStrings?: boolean;
  }

  export function initStrudel(options?: InitStrudelOptions): Promise<StrudelRepl>;
  export function hush(): void;

  export interface SuperdoughAudioController {
    output: {
      /** Final superdough gain; connected to context.destination by default. */
      destinationGain: GainNode;
    };
  }

  export function getSuperdoughAudioController(): SuperdoughAudioController;

  /** Load a sample map (strudel.cc/learn/samples). Network-backed. */
  export function samples(source: string): Promise<void>;
}

/**
 * §75 `@strudel/soundfonts@1.3.0` — General MIDI instruments. Only the one
 * function we call is declared; the package ships no types.
 */
declare module '@strudel/soundfonts' {
  /** Registers every `gm_*` instrument with superdough. Network-backed. */
  export function registerSoundfonts(): void;
  /** The GM registry itself: name → sample list. */
  export const gm: Record<string, unknown>;
}

/**
 * §211: superdough@1.3.0 ships no types either. Only `initAudio` is declared,
 * because that is the one call StrudelEngine needs — `initStrudel` resolves
 * before the AudioWorklets are loaded, and every synth voice triggered in that
 * window fails to construct. Verified against
 * node_modules/superdough/superdough.mjs (`export async function initAudio`).
 */
declare module 'superdough' {
  /**
   * §211: claim the context before superdough lazily creates its own. Without
   * this there were two, and the AudioWorklets landed on the wrong one.
   */
  export function setAudioContext(context: AudioContext): AudioContext;
  export function initAudio(options?: {
    disableWorklets?: boolean;
    maxPolyphony?: number;
    audioDeviceName?: string;
    multiChannelOrbits?: boolean;
  }): Promise<void>;
}
