import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bpmToCps,
  buildPatternCode,
  msUntilNextCycleBoundary,
  StrudelEngine,
  STRUDEL_HEADROOM,
  setSamplesLoaded,
} from '../../src/audio/StrudelEngine';
import {
  buildLayerGraph,
  createEmptyLayerGraph,
  TEMPO_CONFIDENCE_THRESHOLD,
  type MusicalLayerGraph,
} from '../../src/audio/MusicalPrimitives';
import { createInitialMusicState } from '../../src/music/MusicState';
import { asContext, FakeAudioContext, FakeGainNode } from './audioFakes';

// Sample loading is module-level state; each test starts from the offline
// synth palette and opts in explicitly.
beforeEach(() => setSamplesLoaded(false));

const strudel = vi.hoisted(() => {
  const repl = {
    evaluate: vi.fn(async (_code: string, _autostart?: boolean) => undefined),
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    setCps: vi.fn(),
    scheduler: { now: vi.fn(() => 0) },
  };
  const destinationGain = {
    connections: [] as unknown[],
    disconnectCalls: 0,
    connect(target: unknown) {
      this.connections.push(target);
      return target;
    },
    disconnect() {
      this.disconnectCalls += 1;
      this.connections = [];
    },
  };
  const initStrudel = vi.fn(async (_options?: unknown) => repl);
  return { repl, destinationGain, initStrudel };
});

vi.mock('@strudel/web', () => ({
  initStrudel: strudel.initStrudel,
  getSuperdoughAudioController: () => ({ output: { destinationGain: strudel.destinationGain } }),
  samples: vi.fn(async () => undefined),
}));

/** Code string passed to the nth repl.evaluate call ('' if absent). */
function evaluatedCode(index: number): string {
  const calls = strudel.repl.evaluate.mock.calls as unknown as readonly [string, boolean?][];
  return calls[index]?.[0] ?? '';
}

function confidentGraph(bpm = 120, rhythmDensity = 1): MusicalLayerGraph {
  return buildLayerGraph({
    ...createInitialMusicState(),
    bpm,
    tempoConfidence: TEMPO_CONFIDENCE_THRESHOLD + 0.1,
    rhythmDensity,
    pitchCenter: 220,
  });
}

describe('boundary math', () => {
  it('bpmToCps: one bar of four beats is one cycle', () => {
    expect(bpmToCps(120)).toBeCloseTo(0.5);
    expect(bpmToCps(60)).toBeCloseTo(0.25);
  });

  it('bpmToCps clamps bpm', () => {
    expect(bpmToCps(0)).toBeCloseTo(bpmToCps(30));
    expect(bpmToCps(10_000)).toBeCloseTo(bpmToCps(300));
  });

  it('returns 0 ms exactly on a cycle boundary', () => {
    expect(msUntilNextCycleBoundary(0, 120, 'beat')).toBe(0);
    expect(msUntilNextCycleBoundary(3, 120, 'bar')).toBe(0);
    expect(msUntilNextCycleBoundary(1.25, 120, 'beat')).toBe(0);
  });

  it('computes ms until next beat from a cycle position', () => {
    // 120 bpm -> cycle (bar) = 2 s, beat = 1/4 cycle = 0.5 s
    expect(msUntilNextCycleBoundary(1.125, 120, 'beat')).toBeCloseTo(250);
  });

  it('computes ms until next bar from a cycle position', () => {
    expect(msUntilNextCycleBoundary(1.25, 120, 'bar')).toBeCloseTo(1500);
  });

  it('clamps non-positive bpm and ignores non-finite cycle positions', () => {
    expect(msUntilNextCycleBoundary(0.5, 0, 'bar')).toBeCloseTo(msUntilNextCycleBoundary(0.5, 30, 'bar'));
    expect(msUntilNextCycleBoundary(Number.NaN, 120, 'bar')).toBe(0);
  });
});

describe('buildPatternCode', () => {
  it('renders pulse and sub templates', () => {
    setSamplesLoaded(false); // pure template path: offline synth palette
    const code = buildPatternCode(confidentGraph());
    expect(code).toContain('s("sbd*4")');
    expect(code).toContain('note("a2").s("sine")');
    expect(code.startsWith('stack(')).toBe(true);
  });

  it('is deterministic for equal graphs', () => {
    expect(buildPatternCode(confidentGraph())).toBe(buildPatternCode(confidentGraph()));
  });

  it('returns empty string for an empty graph', () => {
    expect(buildPatternCode(createEmptyLayerGraph())).toBe('');
  });

  it('throws on non-finite numeric params', () => {
    const graph = confidentGraph();
    const broken: MusicalLayerGraph = {
      ...graph,
      layers: {
        ...graph.layers,
        drums: {
          ...graph.layers.drums,
          primitives: graph.layers.drums.primitives.map((p) => ({
            ...p,
            parameters: { ...p.parameters, gain: Number.NaN },
          })),
        },
      },
    };
    expect(() => buildPatternCode(broken)).toThrow();
  });

  it('clamps numeric params before interpolation', () => {
    setSamplesLoaded(false); // pure template path: offline synth palette
    const graph = confidentGraph();
    const loud: MusicalLayerGraph = {
      ...graph,
      layers: {
        ...graph.layers,
        drums: {
          ...graph.layers.drums,
          primitives: graph.layers.drums.primitives.map((p) => ({
            ...p,
            parameters: { ...p.parameters, gain: 99, steps: 99 },
          })),
        },
      },
    };
    const code = buildPatternCode(loud);
    expect(code).toContain('s("sbd*8")');
    expect(code).toContain('.gain(1.000)');
  });
});

describe('StrudelEngine', () => {
  let fakeContext: FakeAudioContext;
  let engine: StrudelEngine;

  beforeEach(async () => {
    vi.useFakeTimers();
    strudel.repl.evaluate.mockClear();
    strudel.repl.stop.mockClear();
    strudel.repl.setCps.mockClear();
    strudel.repl.scheduler.now.mockClear().mockReturnValue(0);
    strudel.initStrudel.mockClear();
    strudel.destinationGain.disconnectCalls = 0;
    strudel.destinationGain.connections = [];
    fakeContext = new FakeAudioContext();
    engine = new StrudelEngine();
    await engine.initialize(asContext(fakeContext));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes strudel with our AudioContext', () => {
    expect(strudel.initStrudel).toHaveBeenCalledWith(
      expect.objectContaining({ audioContext: fakeContext }),
    );
  });

  it('reroutes superdough output into an owned gain node with headroom', () => {
    expect(strudel.destinationGain.disconnectCalls).toBe(1);
    const output = engine.getOutputNode() as unknown as FakeGainNode;
    expect(strudel.destinationGain.connections).toContain(output);
    expect(output.gain.value).toBeCloseTo(STRUDEL_HEADROOM);
    expect(fakeContext.createdGains).toContain(output);
  });

  it('coalesces rapid setLayerGraph calls into one evaluate with the latest graph', async () => {
    await engine.start();
    engine.setLayerGraph(confidentGraph(120, 0), 'bar');
    engine.setLayerGraph(confidentGraph(120, 1), 'bar');
    await vi.runAllTimersAsync();
    expect(strudel.repl.evaluate).toHaveBeenCalledTimes(1);
    const code = evaluatedCode(0);
    expect(code).toContain('s("bd*4").bank("RolandTR909")'); // sample bank loaded
    expect(strudel.repl.setCps).toHaveBeenCalledWith(bpmToCps(120));
  });

  it('anchors boundary waits to the audible scheduler grid across tempo changes', async () => {
    await engine.start();
    engine.setLayerGraph(confidentGraph(120), 'bar');
    await vi.advanceTimersByTimeAsync(0); // no audible grid yet -> applies immediately
    expect(strudel.repl.evaluate).toHaveBeenCalledTimes(1);
    // Audible grid says we are 1.25 cycles in: 0.75 cycles until the next bar
    // at the CURRENT 120 bpm (2 s/bar) = 1500 ms. The pending 240 bpm graph
    // must not shorten the wait (epoch/pending-tempo math would give 750 ms).
    strudel.repl.scheduler.now.mockReturnValue(1.25);
    engine.setLayerGraph(confidentGraph(240), 'bar');
    await vi.advanceTimersByTimeAsync(1_499);
    expect(strudel.repl.evaluate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(strudel.repl.evaluate).toHaveBeenCalledTimes(2);
    expect(strudel.repl.setCps).toHaveBeenLastCalledWith(bpmToCps(240));
  });

  it('does not evaluate again for an unchanged graph', async () => {
    await engine.start();
    engine.setLayerGraph(confidentGraph(), 'bar');
    await vi.runAllTimersAsync();
    engine.setLayerGraph(confidentGraph(), 'bar');
    await vi.runAllTimersAsync();
    expect(strudel.repl.evaluate).toHaveBeenCalledTimes(1);
  });

  it('stops the scheduler when the graph becomes empty', async () => {
    await engine.start();
    engine.setLayerGraph(confidentGraph(), 'bar');
    await vi.runAllTimersAsync();
    engine.setLayerGraph(createEmptyLayerGraph(), 'bar');
    await vi.runAllTimersAsync();
    expect(strudel.repl.stop).toHaveBeenCalled();
    expect(strudel.repl.evaluate).toHaveBeenCalledTimes(1);
  });

  it('does not evaluate while stopped', async () => {
    engine.setLayerGraph(confidentGraph(), 'bar');
    await vi.runAllTimersAsync();
    expect(strudel.repl.evaluate).not.toHaveBeenCalled();
  });

  it('evaluates the applied graph when started after apply', async () => {
    engine.setLayerGraph(confidentGraph(), 'bar');
    await vi.runAllTimersAsync();
    await engine.start();
    expect(strudel.repl.evaluate).toHaveBeenCalledTimes(1);
  });

  it('setParameter bpm forwards clamped cps', () => {
    engine.setParameter('bpm', 140);
    expect(strudel.repl.setCps).toHaveBeenCalledWith(bpmToCps(140));
  });

  it('setParameter rejects non-finite values', () => {
    expect(() => engine.setParameter('bpm', Number.NaN)).toThrow();
    expect(() => engine.setParameter('gain', Number.POSITIVE_INFINITY)).toThrow();
  });

  it('setParameter gain ramps the owned gain node within headroom', () => {
    engine.setParameter('gain', 0.5);
    const output = engine.getOutputNode() as unknown as FakeGainNode;
    expect(output.gain.lastRampedValue).toBeCloseTo(0.5 * STRUDEL_HEADROOM);
  });

  it('schedule applies a one-bar overlay then reverts to the base pattern', async () => {
    await engine.start();
    engine.setLayerGraph(confidentGraph(), 'bar');
    await vi.runAllTimersAsync();
    engine.schedule({ kind: 'accent', gain: 0.6 }, 'bar');
    await vi.advanceTimersByTimeAsync(2_100);
    const overlay = evaluatedCode(1);
    expect(overlay).toContain('bpf(2200)');
    await vi.advanceTimersByTimeAsync(2_100);
    const reverted = evaluatedCode(2);
    expect(reverted).not.toContain('bpf(2200)');
    expect(strudel.repl.evaluate).toHaveBeenCalledTimes(3);
  });

  it('emits beat callbacks at each beat boundary while playing', async () => {
    const beats: number[] = [];
    engine.onBeat((event) => beats.push(event.atMs));
    await engine.start();
    engine.setLayerGraph(confidentGraph(), 'bar');
    await vi.advanceTimersByTimeAsync(0); // pattern applies at the boundary
    expect(beats).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500); // 120 bpm -> one beat per 500 ms
    expect(beats).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(beats).toHaveLength(3);
  });

  it('does not emit beats before a pattern is playing', async () => {
    const beats: number[] = [];
    engine.onBeat((event) => beats.push(event.atMs));
    await engine.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(beats).toHaveLength(0);
  });

  it('stops emitting beats after stop()', async () => {
    const beats: number[] = [];
    engine.onBeat((event) => beats.push(event.atMs));
    await engine.start();
    engine.setLayerGraph(confidentGraph(), 'bar');
    await vi.advanceTimersByTimeAsync(500);
    expect(beats).toHaveLength(1);
    engine.stop();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(beats).toHaveLength(1);
  });

  it('unsubscribing a beat handler stops delivery', async () => {
    const beats: number[] = [];
    const detach = engine.onBeat((event) => beats.push(event.atMs));
    await engine.start();
    engine.setLayerGraph(confidentGraph(), 'bar');
    await vi.advanceTimersByTimeAsync(500);
    expect(beats).toHaveLength(1);
    detach();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(beats).toHaveLength(1);
  });

  it('stops emitting beats when the graph becomes empty', async () => {
    const beats: number[] = [];
    engine.onBeat((event) => beats.push(event.atMs));
    await engine.start();
    engine.setLayerGraph(confidentGraph(), 'bar');
    await vi.advanceTimersByTimeAsync(500);
    expect(beats).toHaveLength(1);
    engine.setLayerGraph(createEmptyLayerGraph(), 'bar');
    await vi.advanceTimersByTimeAsync(0); // empty graph applies, playback stops
    await vi.advanceTimersByTimeAsync(2_000);
    expect(beats).toHaveLength(1);
  });

  it('dispose stops playback and cancels pending applies', async () => {
    await engine.start();
    engine.setLayerGraph(confidentGraph(), 'bar');
    engine.dispose();
    await vi.runAllTimersAsync();
    expect(strudel.repl.stop).toHaveBeenCalled();
    expect(strudel.repl.evaluate).not.toHaveBeenCalled();
  });
});
