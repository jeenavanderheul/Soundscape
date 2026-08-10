import { describe, expect, it } from 'vitest';
import { SpatialAudio } from '../../src/audio/SpatialAudio';
import { createFirstResonator } from '../../src/world/Resonator';
import type { ResonatorData } from '../../src/world/Resonator';
import { FakeAudioContext, asContext, asOutput } from './audioFakes';

function makeSpatial(): { spatial: SpatialAudio; ctx: FakeAudioContext } {
  const ctx = new FakeAudioContext();
  const spatial = new SpatialAudio(asContext(ctx), asOutput(ctx.destination));
  return { spatial, ctx };
}

function testResonator(overrides: Partial<ResonatorData> = {}): ResonatorData {
  return { ...createFirstResonator(), ...overrides };
}

describe('SpatialAudio', () => {
  it('addResonator builds oscillator -> gain -> panner -> output', () => {
    const { spatial, ctx } = makeSpatial();
    spatial.addResonator(testResonator());
    const osc = ctx.createdOscillators[0]!;
    const gain = ctx.createdGains[0]!;
    const panner = ctx.createdPanners[0]!;
    expect(osc.connections).toContain(gain);
    expect(gain.connections).toContain(panner);
    expect(panner.connections).toContain(ctx.destination);
    expect(osc.startCalls).toBe(1);
  });

  it('configures the panner for HRTF and inverse distance with usable falloff', () => {
    const { spatial, ctx } = makeSpatial();
    const data = testResonator();
    spatial.addResonator(data);
    const panner = ctx.createdPanners[0]!;
    expect(panner.panningModel).toBe('HRTF');
    expect(panner.distanceModel).toBe('inverse');
    expect(panner.refDistance).toBeGreaterThan(0);
    expect(panner.rolloffFactor).toBeGreaterThan(0);
    expect(panner.maxDistance).toBeGreaterThanOrEqual(data.audibleRadius);
  });

  it('positions the panner from resonator data', () => {
    const { spatial, ctx } = makeSpatial();
    const data = testResonator({ position: { x: 1, y: 2, z: 3 } });
    spatial.addResonator(data);
    const panner = ctx.createdPanners[0]!;
    expect(panner.positionX.value).toBe(1);
    expect(panner.positionY.value).toBe(2);
    expect(panner.positionZ.value).toBe(3);
  });

  it('sets oscillator frequency and waveform from data', () => {
    const { spatial, ctx } = makeSpatial();
    spatial.addResonator(testResonator({ baseHz: 330, waveform: 'sine' }));
    const osc = ctx.createdOscillators[0]!;
    expect(osc.frequency.value).toBe(330);
    expect(osc.type).toBe('sine');
  });

  it('fades resonator gain in via setTargetAtTime instead of jumping', () => {
    const { spatial, ctx } = makeSpatial();
    spatial.setMotion(1); // §42 gate open, so the drone fades to its own amplitude
    spatial.addResonator(testResonator({ amplitude: 0.5 }));
    const gain = ctx.createdGains[0]!.gain;
    expect(gain.value).toBe(0);
    const call = gain.calls.at(-1)!;
    expect(call.method).toBe('setTargetAtTime');
    expect(call.value).toBeCloseTo(0.5);
  });

  it('ignores a duplicate resonator id', () => {
    const { spatial, ctx } = makeSpatial();
    spatial.addResonator(testResonator());
    spatial.addResonator(testResonator());
    expect(ctx.createdOscillators).toHaveLength(1);
  });

  it('removeResonator fades out, stops and disconnects the chain', () => {
    const { spatial, ctx } = makeSpatial();
    const data = testResonator();
    spatial.addResonator(data);
    spatial.removeResonator(data.id);
    const osc = ctx.createdOscillators[0]!;
    const gain = ctx.createdGains[0]!;
    const panner = ctx.createdPanners[0]!;
    expect(gain.gain.calls.at(-1)!.value).toBe(0);
    expect(osc.stopCalls).toBe(1);
    expect(osc.disconnectCalls).toBeGreaterThan(0);
    expect(gain.disconnectCalls).toBeGreaterThan(0);
    expect(panner.disconnectCalls).toBeGreaterThan(0);
  });

  it('removeResonator with unknown id is a no-op', () => {
    const { spatial } = makeSpatial();
    expect(() => spatial.removeResonator('nope')).not.toThrow();
  });

  it('setListenerPose smooths listener params with setTargetAtTime', () => {
    const { spatial, ctx } = makeSpatial();
    spatial.setListenerPose({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
    const listener = ctx.listener;
    for (const param of [listener.positionX, listener.positionY, listener.positionZ]) {
      const call = param.calls.at(-1)!;
      expect(call.method).toBe('setTargetAtTime');
      expect(call.timeConstant).toBeGreaterThan(0);
    }
    expect(listener.positionX.calls.at(-1)!.value).toBe(1);
    expect(listener.positionY.calls.at(-1)!.value).toBe(2);
    expect(listener.positionZ.calls.at(-1)!.value).toBe(3);
    expect(listener.forwardZ.calls.at(-1)!.value).toBe(-1);
    expect(listener.upY.calls.at(-1)!.value).toBe(1);
  });

  it('dispose stops and disconnects all sources', () => {
    const { spatial, ctx } = makeSpatial();
    spatial.addResonator(testResonator({ id: 'a' }));
    spatial.addResonator(testResonator({ id: 'b' }));
    spatial.dispose();
    for (const osc of ctx.createdOscillators) {
      expect(osc.stopCalls).toBe(1);
      expect(osc.disconnectCalls).toBeGreaterThan(0);
    }
    for (const panner of ctx.createdPanners) {
      expect(panner.disconnectCalls).toBeGreaterThan(0);
    }
  });
});
