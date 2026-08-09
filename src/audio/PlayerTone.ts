import type { FrequencyState, Waveform } from '../player/FrequencyState';

const MIN_HZ = 20;
const MAX_HZ = 12000;
/** Headroom so the player tone plus resonators never clip the master (spec §21). */
const MAX_GAIN = 0.4;
const FREQ_SMOOTHING_S = 0.05;
const GAIN_SMOOTHING_S = 0.08;
const RELEASE_S = 0.5;

/** Maps FrequencyState waveforms to OscillatorNode types. 'noise' has no oscillator equivalent in M1. */
export function oscillatorType(waveform: Waveform): OscillatorType {
  switch (waveform) {
    case 'saw':
      return 'sawtooth';
    case 'noise':
      return 'sine';
    default:
      return waveform;
  }
}

/**
 * The player's single controllable tone (spec §12, M1).
 * All hz/gain changes go through setTargetAtTime ramps so no interaction clicks.
 */
export class PlayerTone {
  private readonly context: AudioContext;
  private readonly output: AudioNode;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;

  constructor(context: AudioContext, output: AudioNode) {
    this.context = context;
    this.output = output;
  }

  start(state: FrequencyState): void {
    if (this.oscillator !== null) return;
    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();
    oscillator.type = oscillatorType(state.waveform);
    // Direct value set is safe here: the oscillator has not started yet.
    oscillator.frequency.value = clampHz(state.hz);
    gainNode.gain.value = 0; // fade in via update() ramps — never an audible jump
    oscillator.connect(gainNode);
    gainNode.connect(this.output);
    oscillator.start();
    this.oscillator = oscillator;
    this.gainNode = gainNode;
  }

  update(state: FrequencyState, _dtSeconds: number): void {
    if (this.oscillator === null || this.gainNode === null) return;
    const now = this.context.currentTime;
    const type = oscillatorType(state.waveform);
    if (this.oscillator.type !== type) this.oscillator.type = type;
    this.oscillator.frequency.setTargetAtTime(clampHz(state.hz), now, FREQ_SMOOTHING_S);
    const gain = clamp01(state.amplitude) * MAX_GAIN;
    this.gainNode.gain.setTargetAtTime(gain, now, GAIN_SMOOTHING_S);
  }

  stop(): void {
    if (this.oscillator === null || this.gainNode === null) return;
    const oscillator = this.oscillator;
    const gainNode = this.gainNode;
    this.oscillator = null;
    this.gainNode = null;
    const now = this.context.currentTime;
    gainNode.gain.setTargetAtTime(0, now, GAIN_SMOOTHING_S);
    oscillator.onended = () => {
      oscillator.disconnect();
      gainNode.disconnect();
    };
    oscillator.stop(now + RELEASE_S);
  }

  dispose(): void {
    this.stop();
  }
}

function clampHz(hz: number): number {
  return Math.min(MAX_HZ, Math.max(MIN_HZ, hz));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
