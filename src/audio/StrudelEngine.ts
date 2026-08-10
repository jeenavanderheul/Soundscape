/**
 * StrudelEngine — the ONLY file allowed to import @strudel/web (spec §11, §16).
 *
 * API verified against the installed @strudel/web@1.3.0 sources:
 * - `initStrudel(options)` resolves to the repl object
 *   `{ scheduler, evaluate, start, stop, pause, setCps, ... }` and forwards
 *   `options.audioContext` to `webaudioRepl`, which makes superdough adopt
 *   OUR AudioEngine context via `setAudioContext`. No second AudioContext is
 *   created — no §11/§12 deviation needed.
 *
 * Gain staging / routing decision:
 *   superdough hard-wires its final `destinationGain` to
 *   `audioContext.destination`, bypassing AudioEngine's master chain. 1.3.0
 *   exposes no output-node option, so after init we disconnect that gain and
 *   reroute it into a GainNode owned by this engine (headroom
 *   STRUDEL_HEADROOM, see below). `getOutputNode()` returns that node; the
 *   game wires it into AudioEngine.getOutputNode() so Strudel layers stay
 *   under the master gain + compressor safety chain (spec §12, §21).
 *   Chain: superdough orbits -> destinationGain -> [our strudelGain]
 *          -> masterGain -> compressor -> destination.
 *
 * Scheduling rules (spec §3.4, §11, §21, §25.8):
 * - Patterns are built ONLY from the whitelisted templates below; all numeric
 *   params are asserted finite and clamped before string interpolation, note
 *   names must match NOTE_RE. No user data ever reaches code paths.
 * - `setLayerGraph` calls are coalesced: only the latest pending graph is
 *   applied, at the next beat/bar boundary, via one `repl.evaluate`. An
 *   unchanged graph (empty diff) triggers no evaluate. Never per frame.
 * - Boundary waits are anchored to the AUDIBLE grid: `repl.scheduler.now()`
 *   reports the Cyclist clock's cycle position (1 cycle = 1 bar), which stays
 *   correct across setCps tempo changes — no wall-clock epoch is extrapolated.
 *   While nothing is playing there is no audible grid, so changes apply
 *   immediately. Timing is independent of render FPS.
 */
import { getSuperdoughAudioController, initStrudel, type StrudelRepl } from '@strudel/web';
import {
  diffLayerGraph,
  createEmptyLayerGraph,
  LAYER_NAMES,
  type MusicalAction,
  type MusicalLayer,
  type MusicalLayerGraph,
  type MusicalPrimitive,
  type MusicParameter,
} from './MusicalPrimitives';

/** Beat-boundary notification (§20 M4 synchronized world behavior). */
export interface StrudelBeatEvent {
  /** AudioContext time of the boundary, in milliseconds. */
  atMs: number;
}

export interface StrudelEnginePort {
  initialize(audioContext: AudioContext): Promise<void>;
  start(): Promise<void>;
  stop(): void;
  setLayerGraph(graph: MusicalLayerGraph, boundary?: 'beat' | 'bar'): void;
  setParameter(name: MusicParameter, value: number): void;
  schedule(event: MusicalAction, boundary: 'beat' | 'bar'): void;
  /** Subscribe to beat boundaries while a pattern is playing; returns detach. */
  onBeat(handler: (event: StrudelBeatEvent) => void): () => void;
  getOutputNode(): AudioNode;
  dispose(): void;
}

export const BEATS_PER_BAR = 4;
/** Strudel layer headroom under the master chain so max layering cannot clip (§21). */
export const STRUDEL_HEADROOM = 0.7;
export const MIN_BPM = 30;
export const MAX_BPM = 300;
/** Time constant for click-free gain ramps (§21). */
const GAIN_RAMP_SECONDS = 0.03;

const NOTE_RE = /^[a-g]#?[0-8]$/;

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`StrudelEngine: parameter "${name}" must be a finite number`);
  }
  return value;
}

/** One cycle = one bar of four beats. */
export function bpmToCps(bpm: number): number {
  return clamp(finite(bpm, 'bpm'), MIN_BPM, MAX_BPM) / 60 / BEATS_PER_BAR;
}

/**
 * Milliseconds until the next beat/bar boundary, from the scheduler's cycle
 * position (`repl.scheduler.now()`; one cycle = one bar of four beats).
 */
export function msUntilNextCycleBoundary(
  nowCycles: number,
  bpm: number,
  boundary: 'beat' | 'bar',
): number {
  if (!Number.isFinite(nowCycles)) return 0;
  const clampedBpm = clamp(Number.isFinite(bpm) ? bpm : MIN_BPM, MIN_BPM, MAX_BPM);
  const barSec = (60 / clampedBpm) * BEATS_PER_BAR;
  const periodCycles = boundary === 'bar' ? 1 : 1 / BEATS_PER_BAR;
  const phase = ((nowCycles % periodCycles) + periodCycles) % periodCycles;
  return phase === 0 ? 0 : (periodCycles - phase) * barSec * 1000;
}

/** Whitelisted template library: primitive kind -> pattern expression. */
function renderPrimitive(primitive: MusicalPrimitive, layer: MusicalLayer): string {
  const layerGain = clamp(finite(layer.gain, `${primitive.id}.layer.gain`), 0, 1);
  const gain = (
    clamp(finite(primitive.parameters['gain'] ?? 1, `${primitive.id}.gain`), 0, 1) * layerGain
  ).toFixed(3);
  switch (primitive.kind) {
    case 'pulse':
    case 'kick': {
      const steps = Math.round(
        clamp(finite(primitive.parameters['steps'] ?? 4, `${primitive.id}.steps`), 1, 8),
      );
      return `s("bd*${steps}").gain(${gain})`;
    }
    case 'hat': {
      // Techno hats (§9.1): off-beat or 16th closed hats depending on density.
      const steps = Math.round(
        clamp(finite(primitive.parameters['steps'] ?? 2, `${primitive.id}.steps`), 1, 4),
      );
      return steps <= 2 ? `s("[~ hh]*${steps * 2}").gain(${gain})` : `s("hh*${steps * 2}").gain(${gain})`;
    }
    case 'sub': {
      const note = primitive.parameters['note'];
      if (typeof note !== 'string' || !NOTE_RE.test(note)) {
        throw new TypeError(`StrudelEngine: invalid note for primitive "${primitive.id}"`);
      }
      return `note("${note}").s("sine").gain(${gain})`;
    }
    case 'drone': {
      // Ambient drone (§9.2): one sustained root note stretched over 4 bars.
      const note = primitive.parameters['note'];
      if (typeof note !== 'string' || !NOTE_RE.test(note)) {
        throw new TypeError(`StrudelEngine: invalid note for primitive "${primitive.id}"`);
      }
      return `note("${note}").s("sine").slow(4).gain(${gain})`;
    }
    default:
      throw new Error(`StrudelEngine: primitive kind "${primitive.kind}" is not in the template library`);
  }
}

function renderAction(action: MusicalAction): string {
  const gain = clamp(finite(action.gain, 'action.gain'), 0, 1).toFixed(3);
  // Both M4 action kinds share one off-beat clap accent template.
  return `s("[~ cp]").gain(${gain})`;
}

/** Deterministically map a layer graph (plus one-shot actions) to pattern code. */
export function buildPatternCode(graph: MusicalLayerGraph, actions: MusicalAction[] = []): string {
  const parts: string[] = [];
  for (const name of LAYER_NAMES) {
    const layer = graph.layers[name];
    for (const primitive of layer.primitives) {
      parts.push(renderPrimitive(primitive, layer));
    }
  }
  for (const action of actions) {
    parts.push(renderAction(action));
  }
  if (parts.length === 0) return '';
  return `stack(\n  ${parts.join(',\n  ')}\n)`;
}

export class StrudelEngine implements StrudelEnginePort {
  private context: AudioContext | null = null;
  private outputGain: GainNode | null = null;
  private repl: StrudelRepl | null = null;
  private started = false;
  private disposed = false;

  private appliedGraph: MusicalLayerGraph = createEmptyLayerGraph();
  private baseCode = '';
  private playing = false;

  private pendingGraph: MusicalLayerGraph | null = null;
  private pendingActions: MusicalAction[] = [];
  private revertPending = false;
  private boundaryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly beatHandlers = new Set<(event: StrudelBeatEvent) => void>();
  private beatTimer: ReturnType<typeof setTimeout> | null = null;

  async initialize(audioContext: AudioContext): Promise<void> {
    if (this.repl !== null) return;
    this.context = audioContext;
    const gain = audioContext.createGain();
    gain.gain.value = STRUDEL_HEADROOM;
    this.outputGain = gain;
    try {
      this.repl = await initStrudel({ audioContext });
    } catch (cause) {
      throw new Error('StrudelEngine: failed to initialize @strudel/web', { cause });
    }
    // Reroute superdough's hard-wired destination connection through our
    // gain so the game keeps master-volume and headroom control (§12, §21).
    const destinationGain = getSuperdoughAudioController().output.destinationGain;
    destinationGain.disconnect();
    destinationGain.connect(gain);
  }

  async start(): Promise<void> {
    const repl = this.requireRepl();
    this.started = true;
    if (this.baseCode !== '' && !this.playing) {
      this.evaluate(repl, this.baseCode);
    }
  }

  stop(): void {
    this.started = false;
    this.playing = false;
    this.clearBoundaryTimer();
    this.clearBeatTimer();
    this.pendingGraph = null;
    this.pendingActions = [];
    this.revertPending = false;
    this.repl?.stop();
  }

  setLayerGraph(graph: MusicalLayerGraph, boundary: 'beat' | 'bar' = 'bar'): void {
    this.requireRepl();
    // Coalesce: only the latest pending graph is applied at the next boundary.
    this.pendingGraph = graph;
    this.scheduleApply(boundary);
  }

  setParameter(name: MusicParameter, value: number): void {
    finite(value, name);
    const repl = this.requireRepl();
    switch (name) {
      case 'bpm': {
        this.appliedGraph = { ...this.appliedGraph, bpm: clamp(value, MIN_BPM, MAX_BPM) };
        repl.setCps(bpmToCps(value));
        return;
      }
      case 'gain': {
        const gain = this.requireOutput();
        const now = this.context?.currentTime ?? 0;
        gain.gain.setTargetAtTime(clamp(value, 0, 1) * STRUDEL_HEADROOM, now, GAIN_RAMP_SECONDS);
        return;
      }
    }
  }

  schedule(event: MusicalAction, boundary: 'beat' | 'bar'): void {
    this.requireRepl();
    this.pendingActions.push(event);
    this.scheduleApply(boundary);
  }

  /**
   * Beat-boundary callbacks (§20 M4): fired while a pattern is playing, from
   * a self-correcting timer re-anchored to the Strudel scheduler clock each
   * beat — independent of render FPS, no per-frame work.
   */
  onBeat(handler: (event: StrudelBeatEvent) => void): () => void {
    this.beatHandlers.add(handler);
    this.startBeatTicker();
    return () => {
      this.beatHandlers.delete(handler);
      if (this.beatHandlers.size === 0) this.clearBeatTimer();
    };
  }

  getOutputNode(): AudioNode {
    return this.requireOutput();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.outputGain?.disconnect();
    this.outputGain = null;
    this.repl = null;
    this.context = null;
  }

  private requireRepl(): StrudelRepl {
    if (this.repl === null) {
      throw new Error('StrudelEngine is not initialized. Call initialize() first.');
    }
    return this.repl;
  }

  private requireOutput(): GainNode {
    if (this.outputGain === null) {
      throw new Error('StrudelEngine is not initialized. Call initialize() first.');
    }
    return this.outputGain;
  }

  private clearBoundaryTimer(): void {
    if (this.boundaryTimer !== null) {
      clearTimeout(this.boundaryTimer);
      this.boundaryTimer = null;
    }
  }

  private clearBeatTimer(): void {
    if (this.beatTimer !== null) {
      clearTimeout(this.beatTimer);
      this.beatTimer = null;
    }
  }

  private startBeatTicker(): void {
    if (this.beatTimer !== null || !this.playing || this.beatHandlers.size === 0) return;
    const bpm = this.appliedGraph.bpm;
    if (!(bpm > 0)) return;
    const nowCycles = this.repl?.scheduler.now() ?? 0;
    const ms = msUntilNextCycleBoundary(nowCycles, bpm, 'beat');
    const beatMs = 60_000 / clamp(bpm, MIN_BPM, MAX_BPM);
    // Exactly on a boundary: wait one full beat rather than firing immediately.
    this.beatTimer = setTimeout(() => {
      this.beatTimer = null;
      if (this.disposed || !this.playing) return;
      const atMs = (this.context?.currentTime ?? 0) * 1000;
      for (const handler of [...this.beatHandlers]) handler({ atMs });
      this.startBeatTicker();
    }, ms === 0 ? beatMs : ms);
  }

  private scheduleApply(boundary: 'beat' | 'bar'): void {
    if (this.boundaryTimer !== null) return; // pending apply picks up the latest state
    // The wait runs on the CURRENTLY AUDIBLE grid (applied tempo); a pending
    // tempo only takes effect once applied. Not playing -> scheduler.now() is
    // 0 -> phase 0 -> apply immediately (there is no audible grid to respect).
    const nowCycles = this.repl?.scheduler.now() ?? 0;
    const ms = msUntilNextCycleBoundary(nowCycles, this.appliedGraph.bpm, boundary);
    this.boundaryTimer = setTimeout(() => {
      this.boundaryTimer = null;
      this.applyPending();
    }, ms);
  }

  private applyPending(): void {
    if (this.disposed || this.repl === null) return;
    const repl = this.repl;
    const next = this.pendingGraph;
    this.pendingGraph = null;
    const actions = this.pendingActions.splice(0);
    const revert = this.revertPending;
    this.revertPending = false;

    let dirty = revert;
    if (next !== null && diffLayerGraph(this.appliedGraph, next).length > 0) {
      if (next.bpm > 0 && next.bpm !== this.appliedGraph.bpm) {
        repl.setCps(bpmToCps(next.bpm));
      }
      this.appliedGraph = next;
      this.baseCode = buildPatternCode(next);
      dirty = true;
    }
    if (actions.length > 0) {
      dirty = true;
    }
    if (!dirty) return;

    const code =
      actions.length > 0 ? buildPatternCode(this.appliedGraph, actions) : this.baseCode;
    if (code === '') {
      if (this.playing) {
        repl.stop();
        this.playing = false;
        this.clearBeatTimer();
      }
      return;
    }
    if (this.started) {
      this.evaluate(repl, code);
    }
    if (actions.length > 0) {
      // One-shot overlay: revert to the base pattern at the next bar.
      this.revertPending = true;
      this.scheduleApply('bar');
    }
  }

  /** Diagnostic status (dev debug handle): playing state, bpm and evaluation count. */
  get status(): { playing: boolean; bpm: number; evaluations: number } {
    return { playing: this.playing, bpm: this.appliedGraph.bpm, evaluations: this.evaluations };
  }

  private evaluations = 0;

  private evaluate(repl: StrudelRepl, code: string): void {
    this.playing = true;
    this.evaluations += 1;
    this.startBeatTicker();
    void repl.evaluate(code, true).catch((error: unknown) => {
      // Audio boundary: a bad pattern must not take down the game loop.
      console.error('StrudelEngine: pattern evaluation failed', error);
    });
  }
}
