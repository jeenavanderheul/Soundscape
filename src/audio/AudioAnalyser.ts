import type { AudioEngine } from './AudioEngine';

/**
 * Audio → visual bus (spec §12): wraps an AnalyserNode tapped off the
 * AudioEngine master output and derives a compact, exponentially smoothed
 * AnalysisSnapshot per logic/visual tick. All buffers are preallocated and
 * reused — zero allocations per update. The analyser is a tap, never part
 * of the audible signal chain; audio timing does not depend on it (§15).
 */

export const ANALYSER_CONFIG = {
  fftSize: 2048,
  /** Band edges (§12): low → mass/terrain, mid → motion, high → detail. */
  lowMaxHz: 250,
  midMaxHz: 2000,
  /** Exponential smoothing time constant in seconds (§12: smooth first). */
  smoothingTau: 0.08,
  /** Mean positive spectral-flux (0..1) required to flag an onset. */
  onsetFluxThreshold: 0.05,
  /** Minimum seconds between onset flags — no retrigger flicker (§23). */
  onsetCooldownSeconds: 0.12,
} as const;

/** Minimal AnalyserNode surface — injectable fake in tests. */
export interface AnalyserLike {
  readonly fftSize: number;
  readonly frequencyBinCount: number;
  getByteFrequencyData(array: Uint8Array): void;
  getByteTimeDomainData(array: Uint8Array): void;
}

export interface AnalysisSnapshot {
  rms: number;
  lowBand: number;
  midBand: number;
  highBand: number;
  /** True for exactly the tick a transient was detected (§12 pulses). */
  onset: boolean;
  /** Normalized 0..1 against Nyquist — material brightness proxy (§12). */
  spectralCentroid: number;
}

export interface BandEnergies {
  lowBand: number;
  midBand: number;
  highBand: number;
}

/** Mean normalized (0..1) bin energy per band. Pure — unit-testable. */
export function computeBandEnergies(
  bins: Uint8Array,
  sampleRate: number,
  fftSize: number,
): BandEnergies {
  const binHz = sampleRate / fftSize;
  let lowSum = 0;
  let lowCount = 0;
  let midSum = 0;
  let midCount = 0;
  let highSum = 0;
  let highCount = 0;
  for (let i = 0; i < bins.length; i++) {
    const hz = i * binHz;
    const value = bins[i]! / 255;
    if (hz < ANALYSER_CONFIG.lowMaxHz) {
      lowSum += value;
      lowCount++;
    } else if (hz < ANALYSER_CONFIG.midMaxHz) {
      midSum += value;
      midCount++;
    } else {
      highSum += value;
      highCount++;
    }
  }
  return {
    lowBand: lowCount > 0 ? lowSum / lowCount : 0,
    midBand: midCount > 0 ? midSum / midCount : 0,
    highBand: highCount > 0 ? highSum / highCount : 0,
  };
}

/** RMS of a byte time-domain buffer, normalized so full swing ≈ 1. */
export function computeRms(time: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < time.length; i++) {
    const centered = (time[i]! - 128) / 128;
    sum += centered * centered;
  }
  return Math.sqrt(sum / time.length);
}

/** Magnitude-weighted mean frequency, normalized 0..1 against Nyquist. */
export function computeSpectralCentroid(
  bins: Uint8Array,
  sampleRate: number,
  fftSize: number,
): number {
  const binHz = sampleRate / fftSize;
  let weighted = 0;
  let total = 0;
  for (let i = 0; i < bins.length; i++) {
    const value = bins[i]!;
    weighted += i * binHz * value;
    total += value;
  }
  if (total === 0) return 0;
  return weighted / total / (sampleRate / 2);
}

export class AudioAnalyser {
  private readonly analyser: AnalyserLike;
  private readonly sampleRate: number;
  private readonly freqData: Uint8Array;
  private readonly timeData: Uint8Array;
  private readonly previousBins: Uint8Array;
  private secondsSinceOnset = Number.POSITIVE_INFINITY;
  private readonly current: AnalysisSnapshot = {
    rms: 0,
    lowBand: 0,
    midBand: 0,
    highBand: 0,
    onset: false,
    spectralCentroid: 0,
  };

  constructor(analyser: AnalyserLike, sampleRate: number) {
    this.analyser = analyser;
    this.sampleRate = sampleRate;
    this.freqData = new Uint8Array(analyser.frequencyBinCount);
    this.timeData = new Uint8Array(analyser.fftSize);
    this.previousBins = new Uint8Array(analyser.frequencyBinCount);
  }

  /** Reused object — read, do not retain across mutations you care about. */
  get snapshot(): Readonly<AnalysisSnapshot> {
    return this.current;
  }

  update(dtSeconds: number): void {
    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.timeData);

    const bands = computeBandEnergies(this.freqData, this.sampleRate, this.analyser.fftSize);
    const rawRms = computeRms(this.timeData);
    const rawCentroid = computeSpectralCentroid(
      this.freqData,
      this.sampleRate,
      this.analyser.fftSize,
    );

    // Exponential smoothing before exposure (§12): one shared blend factor.
    const blend = 1 - Math.exp(-dtSeconds / ANALYSER_CONFIG.smoothingTau);
    const s = this.current;
    s.rms += (rawRms - s.rms) * blend;
    s.lowBand += (bands.lowBand - s.lowBand) * blend;
    s.midBand += (bands.midBand - s.midBand) * blend;
    s.highBand += (bands.highBand - s.highBand) * blend;
    s.spectralCentroid += (rawCentroid - s.spectralCentroid) * blend;
    s.onset = this.detectOnset(dtSeconds);
  }

  /** Positive spectral flux against the previous frame, with cooldown. */
  private detectOnset(dtSeconds: number): boolean {
    let flux = 0;
    for (let i = 0; i < this.freqData.length; i++) {
      const delta = this.freqData[i]! - this.previousBins[i]!;
      if (delta > 0) flux += delta;
    }
    this.previousBins.set(this.freqData);
    flux /= this.freqData.length * 255;

    this.secondsSinceOnset += dtSeconds;
    const ready = this.secondsSinceOnset >= ANALYSER_CONFIG.onsetCooldownSeconds;
    if (!ready || flux < ANALYSER_CONFIG.onsetFluxThreshold) return false;
    this.secondsSinceOnset = 0;
    return true;
  }
}

/** Engine surface attachAudioAnalyser needs — keeps the tap testable. */
export interface AnalyserHost {
  readonly context: AudioContext;
  getOutputNode(): AudioNode;
}

/** Tap the master output into a new AnalyserNode (§12 audio→visual bus). */
export function attachAudioAnalyser(engine: AnalyserHost | AudioEngine): AudioAnalyser {
  const context = engine.context;
  const node = context.createAnalyser();
  node.fftSize = ANALYSER_CONFIG.fftSize;
  node.smoothingTimeConstant = 0; // this module owns smoothing (§12)
  engine.getOutputNode().connect(node);
  return new AudioAnalyser(node, context.sampleRate);
}
