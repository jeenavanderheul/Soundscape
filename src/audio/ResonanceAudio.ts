import type { Waveform } from '../player/FrequencyState';

/**
 * Immutable shared resonance event, spec §8. Structural mirror of the shape the
 * resonance core emits on the event bus (P5: one event drives audio AND visuals).
 * TypeScript structural typing keeps this compatible with the core's declaration.
 */
export type ResonanceClass =
  | 'harmonic'
  | 'dissonant'
  | 'amplification'
  | 'cancellation'
  | 'complex';

export interface ResonanceEvent {
  id: string;
  atMs: number;
  sourceId: string;
  targetId: string;
  sourceHz: number;
  targetHz: number;
  ratio: number;
  consonance: number;
  dissonance: number;
  amplitude: number;
  velocity: number;
  phaseDifference: number;
  sourceWaveform: Waveform;
  targetWaveform: Waveform;
  strength: number;
  persistence: number;
  classification: ResonanceClass;
}

export type ResonanceAudioEvents = { 'resonance:event': ResonanceEvent };

/** Minimal structural slice of the game EventBus this system needs. */
export interface ResonanceEventSource {
  on(event: 'resonance:event', handler: (event: ResonanceEvent) => void): () => void;
}

export const MAX_RESPONSE_VOICES = 4;

/**
 * GAIN STAGING (spec §21: max layering must not clip the master).
 * Worst-case simultaneous peak into masterGain -> DynamicsCompressor:
 *   player tone            0.40  (PlayerTone MAX_GAIN)
 *   nearest resonator      0.42  (amplitude 0.5 * panner gain 5/6 at interaction range)
 *   two remote resonators  0.05  (inverse falloff ≈ 5/d at 60+ units, amp ≤ 0.35)
 *   response voices        0.32  (MAX_RESPONSE_VOICES × VOICE_GAIN 0.08)
 *   incoherent sum       ≈ 1.19 instantaneous worst case
 * Sines are rarely phase-coherent, so real peaks sit well below that; the master
 * DynamicsCompressor (default threshold −24 dBFS) absorbs the transient overs.
 * Keep VOICE_GAIN at or below 0.08 when adding response types.
 */
const VOICE_GAIN = 0.08;

const MIN_BEAT_HZ = 0.5;
const MAX_BEAT_HZ = 16;
const SWELL_TC_S = 0.4; // warm swell time constant
const RELEASE_TC_S = 0.35;
const STEAL_TC_S = 0.03;

interface Voice {
  oscillators: OscillatorNode[];
  nodes: AudioNode[]; // gains/filters, disconnected on cleanup
  gain: GainNode; // per-voice output gain
}

/**
 * Renders the audible consequence of every ResonanceEvent (spec §8, M2).
 * One immutable event, one bounded response voice; all parameter changes ramped.
 */
export class ResonanceAudio {
  private readonly context: AudioContext;
  private readonly output: AudioNode;
  private readonly unsubscribe: () => void;
  private voices: Voice[] = [];
  private disposed = false;

  constructor(context: AudioContext, output: AudioNode, events: ResonanceEventSource) {
    this.context = context;
    this.output = output;
    this.unsubscribe = events.on('resonance:event', (event) => this.respond(event));
  }

  get activeVoiceCount(): number {
    return this.voices.length;
  }

  respond(event: ResonanceEvent): void {
    if (this.disposed) return;
    if (this.voices.length >= MAX_RESPONSE_VOICES) {
      const oldest = this.voices[0];
      if (oldest !== undefined) this.steal(oldest);
    }
    switch (event.classification) {
      case 'harmonic':
      case 'amplification':
        this.startHarmonicSwell(event);
        break;
      case 'dissonant':
        this.startBeating(event);
        break;
      case 'cancellation':
        this.startCancellationDip(event);
        break;
      case 'complex':
        this.startShimmer(event);
        break;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    for (const voice of [...this.voices]) {
      for (const osc of voice.oscillators) osc.stop();
      this.cleanup(voice);
    }
    this.voices = [];
  }

  /** Warm swell: response gain rises smoothly, an overtone at a ratio-related multiple fades in. */
  private startHarmonicSwell(event: ResonanceEvent): void {
    const now = this.context.currentTime;
    const voice = this.createVoice();
    const peak = VOICE_GAIN * clamp01(event.strength);

    const fundamental = this.createOscillator('sine', event.targetHz);
    fundamental.connect(voice.gain);

    const overtone = this.createOscillator('sine', overtoneHz(event.targetHz, event.ratio));
    const overtoneGain = this.context.createGain();
    overtoneGain.gain.value = 0.4; // subtle, relative to voice gain
    overtone.connect(overtoneGain);
    overtoneGain.connect(voice.gain);
    voice.nodes.push(overtoneGain);

    voice.gain.gain.setTargetAtTime(peak, now, SWELL_TC_S);
    voice.gain.gain.setTargetAtTime(0, now + 1.8, RELEASE_TC_S);
    this.finishVoice(voice, [fundamental, overtone], now + 3.2);
  }

  /** Audible beating: amplitude modulation at the |Δf| beat rate plus slight detune tension. */
  private startBeating(event: ResonanceEvent): void {
    const now = this.context.currentTime;
    const voice = this.createVoice();
    const peak = VOICE_GAIN * clamp01(event.strength);

    // Slightly sharp of the target: the tension between the two is the material (§3.6).
    const carrier = this.createOscillator(event.targetWaveform, event.targetHz * 1.005);
    const tremolo = this.context.createGain();
    tremolo.gain.value = 1;
    carrier.connect(tremolo);
    tremolo.connect(voice.gain);
    voice.nodes.push(tremolo);

    const beatHz = clamp(Math.abs(event.sourceHz - event.targetHz), MIN_BEAT_HZ, MAX_BEAT_HZ);
    const lfo = this.createOscillator('sine', beatHz);
    const depth = this.context.createGain();
    depth.gain.value = 0.5 * clamp01(0.5 + event.dissonance * 0.5); // deeper beating when more dissonant
    lfo.connect(depth);
    depth.connect(tremolo.gain);
    voice.nodes.push(depth);

    voice.gain.gain.setTargetAtTime(peak, now, 0.15);
    voice.gain.gain.setTargetAtTime(0, now + 1.5, RELEASE_TC_S);
    this.finishVoice(voice, [carrier, lfo], now + 2.6);
  }

  /** Brief spectral dip: notch at targetHz, level drops sharply then recovers before fading. */
  private startCancellationDip(event: ResonanceEvent): void {
    const now = this.context.currentTime;
    const voice = this.createVoice();
    const peak = VOICE_GAIN * clamp01(event.strength);

    const carrier = this.createOscillator(event.targetWaveform, event.targetHz);
    const notch = this.context.createBiquadFilter();
    notch.type = 'notch';
    notch.frequency.value = event.targetHz;
    notch.Q.value = 8;
    carrier.connect(notch);
    notch.connect(voice.gain);
    voice.nodes.push(notch);

    voice.gain.gain.setTargetAtTime(peak * 0.7, now, 0.05); // fast but click-free entry
    voice.gain.gain.linearRampToValueAtTime(peak * 0.05, now + 0.3); // the dip
    voice.gain.gain.setTargetAtTime(peak * 0.5, now + 0.35, 0.2); // recover
    voice.gain.gain.setTargetAtTime(0, now + 1.0, RELEASE_TC_S);
    this.finishVoice(voice, [carrier], now + 2.0);
  }

  /** Filtered shimmer: carrier through a bandpass whose center is slowly modulated. */
  private startShimmer(event: ResonanceEvent): void {
    const now = this.context.currentTime;
    const voice = this.createVoice();
    const peak = VOICE_GAIN * clamp01(event.strength);

    const carrier = this.createOscillator(event.targetWaveform, event.targetHz);
    const bandpass = this.context.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = event.targetHz * 2;
    bandpass.Q.value = 4;
    carrier.connect(bandpass);
    bandpass.connect(voice.gain);
    voice.nodes.push(bandpass);

    const shimmerLfo = this.createOscillator('sine', 6);
    const shimmerDepth = this.context.createGain();
    shimmerDepth.gain.value = event.targetHz * 0.5; // sweep width around the bandpass center
    shimmerLfo.connect(shimmerDepth);
    shimmerDepth.connect(bandpass.frequency);
    voice.nodes.push(shimmerDepth);

    voice.gain.gain.setTargetAtTime(peak, now, 0.25);
    voice.gain.gain.setTargetAtTime(0, now + 1.6, RELEASE_TC_S);
    this.finishVoice(voice, [carrier, shimmerLfo], now + 2.8);
  }

  private createVoice(): Voice {
    const gain = this.context.createGain();
    gain.gain.value = 0; // silent birth — every rise is a ramp
    gain.connect(this.output);
    return { oscillators: [], nodes: [], gain };
  }

  private createOscillator(waveform: Waveform | OscillatorType, hz: number): OscillatorNode {
    const osc = this.context.createOscillator();
    osc.type = toOscillatorType(waveform);
    osc.frequency.value = hz; // safe: not started yet
    return osc;
  }

  private finishVoice(voice: Voice, oscillators: OscillatorNode[], stopAt: number): void {
    voice.oscillators = oscillators;
    for (const osc of oscillators) osc.start();
    // The first oscillator's natural end retires the whole voice.
    const primary = oscillators[0];
    if (primary !== undefined) primary.onended = () => this.cleanup(voice);
    for (const osc of oscillators) osc.stop(stopAt);
    this.voices.push(voice);
  }

  /** Voice stealing: fast click-free fade, immediate stop, slot freed for the new event. */
  private steal(voice: Voice): void {
    const now = this.context.currentTime;
    voice.gain.gain.setTargetAtTime(0, now, STEAL_TC_S);
    for (const osc of voice.oscillators) osc.stop(now + 0.1);
    this.remove(voice);
    // cleanup still runs via onended when the stop time is reached
  }

  private cleanup(voice: Voice): void {
    this.remove(voice);
    for (const osc of voice.oscillators) {
      osc.onended = null;
      osc.disconnect();
    }
    for (const node of voice.nodes) node.disconnect();
    voice.gain.disconnect();
  }

  private remove(voice: Voice): void {
    this.voices = this.voices.filter((v) => v !== voice);
  }
}

/** Nearest small harmonic multiple of the target — the "ratio-related" overtone. */
function overtoneHz(targetHz: number, ratio: number): number {
  const normalized = ratio >= 1 ? ratio : 1 / Math.max(ratio, 1e-6);
  const multiple = clamp(Math.round(normalized), 2, 6);
  return targetHz * multiple;
}

function toOscillatorType(waveform: Waveform | OscillatorType): OscillatorType {
  switch (waveform) {
    case 'saw':
      return 'sawtooth';
    case 'noise':
      return 'sine'; // no oscillator equivalent yet (matches PlayerTone)
    default:
      return waveform;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
