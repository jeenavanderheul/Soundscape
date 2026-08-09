import { describe, expect, it } from 'vitest';
import { PlayerTone } from '../../src/audio/PlayerTone';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import type { FrequencyState } from '../../src/player/FrequencyState';
import { FakeAudioContext, asContext, asOutput } from './audioFakes';

function makeTone(): {
  tone: PlayerTone;
  ctx: FakeAudioContext;
  state: FrequencyState;
} {
  const ctx = new FakeAudioContext();
  const tone = new PlayerTone(asContext(ctx), asOutput(ctx.destination));
  return { tone, ctx, state: createInitialFrequencyState() };
}

describe('PlayerTone', () => {
  it('start connects oscillator -> gain -> output and starts once', () => {
    const { tone, ctx, state } = makeTone();
    tone.start(state);
    tone.start(state);
    expect(ctx.createdOscillators).toHaveLength(1);
    expect(ctx.createdGains).toHaveLength(1);
    const osc = ctx.createdOscillators[0]!;
    const gain = ctx.createdGains[0]!;
    expect(osc.connections).toContain(gain);
    expect(gain.connections).toContain(ctx.destination);
    expect(osc.startCalls).toBe(1);
  });

  it('starts silent so there is no click on start', () => {
    const { tone, ctx, state } = makeTone();
    tone.start(state);
    expect(ctx.createdGains[0]!.gain.value).toBe(0);
  });

  it('update ramps frequency with setTargetAtTime, never jumping .value', () => {
    const { tone, ctx, state } = makeTone();
    tone.start(state);
    const freq = ctx.createdOscillators[0]!.frequency;
    const valueAfterStart = freq.value;
    tone.update({ ...state, hz: 440 }, 1 / 60);
    expect(freq.value).toBe(valueAfterStart);
    const call = freq.calls.at(-1)!;
    expect(call.method).toBe('setTargetAtTime');
    expect(call.value).toBe(440);
    expect(call.timeConstant).toBeGreaterThan(0);
  });

  it('update ramps gain from amplitude with setTargetAtTime, never jumping .value', () => {
    const { tone, ctx, state } = makeTone();
    tone.start(state);
    const gain = ctx.createdGains[0]!.gain;
    tone.update({ ...state, amplitude: 1 }, 1 / 60);
    expect(gain.value).toBe(0);
    const call = gain.calls.at(-1)!;
    expect(call.method).toBe('setTargetAtTime');
    expect(call.value).toBeGreaterThan(0);
    expect(call.timeConstant).toBeGreaterThan(0);
  });

  it('gain target scales with amplitude and stays bounded at 1', () => {
    const { tone, ctx, state } = makeTone();
    tone.start(state);
    const gain = ctx.createdGains[0]!.gain;
    tone.update({ ...state, amplitude: 0.5 }, 1 / 60);
    const half = gain.calls.at(-1)!.value;
    tone.update({ ...state, amplitude: 5 }, 1 / 60);
    const clamped = gain.calls.at(-1)!.value;
    expect(clamped).toBeGreaterThan(half);
    expect(clamped).toBeLessThanOrEqual(1);
  });

  it('maps waveform names to oscillator types (saw -> sawtooth)', () => {
    const { tone, ctx, state } = makeTone();
    tone.start({ ...state, waveform: 'saw' });
    expect(ctx.createdOscillators[0]!.type).toBe('sawtooth');
    tone.update({ ...state, waveform: 'square' }, 1 / 60);
    expect(ctx.createdOscillators[0]!.type).toBe('square');
  });

  it('falls back to sine for the noise waveform (no oscillator noise type)', () => {
    const { tone, ctx, state } = makeTone();
    tone.start({ ...state, waveform: 'noise' });
    expect(ctx.createdOscillators[0]!.type).toBe('sine');
  });

  it('clamps non-positive hz to an audible minimum', () => {
    const { tone, ctx, state } = makeTone();
    tone.start(state);
    tone.update({ ...state, hz: -10 }, 1 / 60);
    expect(ctx.createdOscillators[0]!.frequency.calls.at(-1)!.value).toBeGreaterThan(0);
  });

  it('stop ramps gain to 0, stops later, and disconnects on end', () => {
    const { tone, ctx, state } = makeTone();
    tone.start(state);
    const osc = ctx.createdOscillators[0]!;
    const gain = ctx.createdGains[0]!;
    tone.stop();
    const gainCall = gain.gain.calls.at(-1)!;
    expect(gainCall.method).toBe('setTargetAtTime');
    expect(gainCall.value).toBe(0);
    expect(osc.stopCalls).toBe(1);
    expect(osc.stopTimes[0]!).toBeGreaterThan(ctx.currentTime);
    expect(osc.disconnectCalls).toBeGreaterThan(0);
    expect(gain.disconnectCalls).toBeGreaterThan(0);
  });

  it('update and stop are no-ops before start', () => {
    const { tone, state } = makeTone();
    expect(() => tone.update(state, 1 / 60)).not.toThrow();
    expect(() => tone.stop()).not.toThrow();
  });

  it('can start again after stop', () => {
    const { tone, ctx, state } = makeTone();
    tone.start(state);
    tone.stop();
    tone.start(state);
    expect(ctx.createdOscillators).toHaveLength(2);
    expect(ctx.createdOscillators[1]!.startCalls).toBe(1);
  });

  it('dispose disconnects everything', () => {
    const { tone, ctx, state } = makeTone();
    tone.start(state);
    tone.dispose();
    expect(ctx.createdOscillators[0]!.disconnectCalls).toBeGreaterThan(0);
    expect(ctx.createdGains[0]!.disconnectCalls).toBeGreaterThan(0);
  });
});
