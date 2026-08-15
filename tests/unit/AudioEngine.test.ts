import { FakeAudioParam } from './audioFakes';
import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../../src/audio/AudioEngine';

class FakeNode {
  connections: unknown[] = [];
  connect(target: unknown): unknown {
    this.connections.push(target);
    return target;
  }
  disconnect(): void {
    this.connections = [];
  }
}

class FakeGainNode extends FakeNode {
  // §145 ramps the volume rather than setting it, so the fake has to record
  // the ramp — asserting on `.value` would pass while the real node clicked.
  gain = new FakeAudioParam(1);
}

class FakeCompressorNode extends FakeNode {}

class FakeAudioContext {
  static instanceCount = 0;
  state: 'running' | 'suspended' | 'closed' = 'running';
  destination = new FakeNode();
  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;
  createdGains: FakeGainNode[] = [];
  createdCompressors: FakeCompressorNode[] = [];

  constructor() {
    FakeAudioContext.instanceCount += 1;
  }

  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.createdGains.push(node);
    return node;
  }

  createDynamicsCompressor(): FakeCompressorNode {
    const node = new FakeCompressorNode();
    this.createdCompressors.push(node);
    return node;
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
  }

  async suspend(): Promise<void> {
    this.suspendCalls += 1;
    this.state = 'suspended';
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
  }
}

const fakeCtor = FakeAudioContext as unknown as typeof AudioContext;

function makeEngine(): { engine: AudioEngine; fake: () => FakeAudioContext } {
  const engine = new AudioEngine(fakeCtor);
  return {
    engine,
    fake: () => engine.context as unknown as FakeAudioContext,
  };
}

describe('AudioEngine', () => {
  it('throws a clear error when context is accessed before initialize', () => {
    const engine = new AudioEngine(fakeCtor);
    expect(() => engine.context).toThrowError(/not initialized/i);
  });

  it('throws a clear error when masterGain is accessed before initialize', () => {
    const engine = new AudioEngine(fakeCtor);
    expect(() => engine.masterGain).toThrowError(/not initialized/i);
  });

  it('initialize creates exactly one AudioContext', async () => {
    FakeAudioContext.instanceCount = 0;
    const { engine } = makeEngine();
    await engine.initialize();
    await engine.initialize();
    expect(FakeAudioContext.instanceCount).toBe(1);
  });

  it('chains masterGain -> volume -> compressor -> destination', async () => {
    const { engine, fake } = makeEngine();
    await engine.initialize();
    const ctx = fake();
    const gain = ctx.createdGains[0]!;
    const volume = ctx.createdGains[1]!;
    const compressor = ctx.createdCompressors[0]!;
    expect(engine.masterGain).toBe(gain as unknown as GainNode);
    // §145: the player's volume is its own node between the bus and the
    // limiter. It must NOT be the master gain, because the analyser taps that
    // one — a quiet setting would otherwise darken the world (§136.15).
    expect(gain.connections).toContain(volume);
    expect(gain.connections).not.toContain(compressor);
    expect(volume.connections).toContain(compressor);
    expect(compressor.connections).toContain(ctx.destination);
  });

  it('puts the volume on that node and nowhere else', async () => {
    const { engine, fake } = makeEngine();
    await engine.initialize();
    const ctx = fake();
    const gain = ctx.createdGains[0]!;
    const volume = ctx.createdGains[1]!;
    engine.setVolume(0.25);
    // Ramped, never stepped: a keypress must not be a click (§21).
    expect(volume.gain.calls.at(-1)?.method).toBe('setTargetAtTime');
    expect(volume.gain.lastRampedValue).toBeCloseTo(0.25);
    expect(gain.gain.calls).toHaveLength(0);
    // Out of range is clamped rather than trusted.
    engine.setVolume(4);
    expect(volume.gain.lastRampedValue).toBeCloseTo(1);
    engine.setVolume(-1);
    expect(volume.gain.lastRampedValue).toBeCloseTo(0);
  });

  it('getOutputNode returns the master gain input node', async () => {
    const { engine } = makeEngine();
    await engine.initialize();
    expect(engine.getOutputNode()).toBe(engine.masterGain);
  });

  it('resume calls context.resume', async () => {
    const { engine, fake } = makeEngine();
    await engine.initialize();
    await engine.resume();
    expect(fake().resumeCalls).toBe(1);
  });

  it('suspend calls context.suspend', async () => {
    const { engine, fake } = makeEngine();
    await engine.initialize();
    await engine.suspend();
    expect(fake().suspendCalls).toBe(1);
  });

  it('dispose closes the context and is idempotent', async () => {
    const { engine, fake } = makeEngine();
    await engine.initialize();
    const ctx = fake();
    await engine.dispose();
    await engine.dispose();
    expect(ctx.closeCalls).toBe(1);
    expect(() => engine.context).toThrowError(/not initialized/i);
  });

  it('dispose before initialize is a no-op', async () => {
    const engine = new AudioEngine(fakeCtor);
    await expect(engine.dispose()).resolves.toBeUndefined();
  });

  it('wraps context creation failure with a clear message', async () => {
    class ExplodingContext {
      constructor() {
        throw new Error('boom');
      }
    }
    const engine = new AudioEngine(ExplodingContext as unknown as typeof AudioContext);
    await expect(engine.initialize()).rejects.toThrowError(/failed to create audiocontext/i);
  });
});
