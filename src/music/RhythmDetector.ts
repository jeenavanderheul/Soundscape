/**
 * RhythmDetector (spec §3.3, §3.4, §10): pure logic, no DOM/audio/three.
 *
 * Consumes timestamped pulse onsets (LMB release pulses, Space resonance
 * pulses), tracks inter-onset intervals in bounded buffers, and estimates a
 * musical BPM via octave folding + outlier-rejected averaging. Confidence
 * rises with regularity and decays during silence. Quantization strength
 * grows gradually with sustained confidence ("the system gradually
 * remembers"), never jumping.
 *
 * Driven from the lower-frequency logic loop via `update(nowMs)`; onsets are
 * fed via `onOnset(tMs)`. All state is plain numbers; no randomness needed.
 */

export interface RhythmDetectorConfig {
  /** Musical BPM range; raw IOI tempos are octave-folded into it. */
  minBpm: number;
  maxBpm: number;
  /** Bounded history sizes (spec §10: bounded buffers). */
  maxIoiHistory: number;
  maxOnsetHistory: number;
  /** Onsets closer than this are debounce ghosts and ignored. */
  minIoiMs: number;
  /** Gaps longer than this are silence, not an interval. */
  maxIoiMs: number;
  /** Relative deviation from the median beyond which an IOI is an outlier. */
  outlierTolerance: number;
  /** Per-estimate lerp of confidence toward measured regularity. */
  confidenceAttack: number;
  /** Linear confidence decay per second during silence. */
  confidenceDecayPerSec: number;
  /** Silence must exceed this before confidence decays (slow trains stay valid). */
  silenceGraceMs: number;
  /** Per-estimate lerp of bpm toward the new target (limits jump size). */
  bpmSmoothing: number;
  /** Exponential rate at which quantizeStrength approaches confidence. */
  quantizeRisePerSec: number;
  /** Sliding window for onset-rate measurement. */
  densityWindowMs: number;
  /** Exponential smoothing rate for rhythmDensity. */
  densityRatePerSec: number;
  /** Scales mean-absolute-deviation into the regularity penalty. */
  regularityPenalty: number;
}

export const RHYTHM_DETECTOR_CONFIG: RhythmDetectorConfig = {
  minBpm: 60,
  maxBpm: 180,
  maxIoiHistory: 16,
  maxOnsetHistory: 32,
  minIoiMs: 100,
  maxIoiMs: 3000,
  outlierTolerance: 0.25,
  confidenceAttack: 0.25,
  confidenceDecayPerSec: 0.15,
  silenceGraceMs: 2000,
  bpmSmoothing: 0.2,
  quantizeRisePerSec: 0.2,
  densityWindowMs: 4000,
  densityRatePerSec: 1.5,
  regularityPenalty: 4,
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[mid - 1] ?? 0) + upper) / 2;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export class RhythmDetector {
  private readonly iois: number[] = [];
  private readonly onsets: number[] = [];
  private lastOnsetMs: number | null = null;
  private lastUpdateMs: number | null = null;
  private gridOriginMs = 0;
  private bpmValue = 0;
  private confidence = 0;
  private strength = 0;
  private density = 0;
  private regularity = 0;

  constructor(private readonly config: RhythmDetectorConfig = RHYTHM_DETECTOR_CONFIG) {}

  get bpm(): number {
    return this.bpmValue;
  }

  get tempoConfidence(): number {
    return this.confidence;
  }

  get quantizeStrength(): number {
    return this.strength;
  }

  get rhythmDensity(): number {
    return this.density;
  }

  get rhythmicRegularity(): number {
    return this.regularity;
  }

  get ioiHistorySize(): number {
    return this.iois.length;
  }

  get onsetHistorySize(): number {
    return this.onsets.length;
  }

  /** Register a pulse onset at time tMs (must be monotonically non-decreasing). */
  onOnset(tMs: number): void {
    const { minIoiMs, maxIoiMs, maxIoiHistory, maxOnsetHistory } = this.config;

    if (this.lastOnsetMs !== null) {
      const ioi = tMs - this.lastOnsetMs;
      if (ioi < minIoiMs) return; // debounce ghost; keep prior onset as anchor
      if (ioi <= maxIoiMs) {
        this.iois.push(ioi);
        if (this.iois.length > maxIoiHistory) this.iois.shift();
      }
      // Gaps beyond maxIoiMs are silence: no interval recorded.
    }

    this.lastOnsetMs = tMs;
    this.gridOriginMs = tMs;
    this.onsets.push(tMs);
    if (this.onsets.length > maxOnsetHistory) this.onsets.shift();

    if (this.iois.length >= 2) this.reestimate();
  }

  /** Advance time-driven behavior: confidence decay, quantize strength, density. */
  update(nowMs: number): void {
    const deltaMs = this.lastUpdateMs === null ? 0 : Math.max(0, nowMs - this.lastUpdateMs);
    this.lastUpdateMs = nowMs;
    const deltaSec = deltaMs / 1000;

    const silentMs = this.lastOnsetMs === null ? Infinity : nowMs - this.lastOnsetMs;
    if (silentMs > this.config.silenceGraceMs) {
      this.confidence = Math.max(0, this.confidence - this.config.confidenceDecayPerSec * deltaSec);
    }

    // Gradual quantization: strength lags confidence, never jumps (§3.3).
    const rise = 1 - Math.exp(-this.config.quantizeRisePerSec * deltaSec);
    this.strength = clamp01(this.strength + (this.confidence - this.strength) * rise);

    // Smoothed onsets/sec over a sliding window.
    const windowStart = nowMs - this.config.densityWindowMs;
    let count = 0;
    for (const onset of this.onsets) {
      if (onset > windowStart && onset <= nowMs) count += 1;
    }
    const rawRate = count / (this.config.densityWindowMs / 1000);
    const blend = 1 - Math.exp(-this.config.densityRatePerSec * deltaSec);
    this.density += (rawRate - this.density) * blend;
  }

  /**
   * Snap a timestamp toward the beat grid proportionally to quantizeStrength.
   * Identity while there is no rhythm evidence.
   */
  quantize(tMs: number): number {
    if (this.bpmValue <= 0 || this.strength <= 0) return tMs;
    const beatMs = 60_000 / this.bpmValue;
    const beats = Math.round((tMs - this.gridOriginMs) / beatMs);
    const gridMs = this.gridOriginMs + beats * beatMs;
    return tMs + (gridMs - tMs) * this.strength;
  }

  /** Fold a raw IOI tempo into the musical [minBpm, maxBpm] range by octaves. */
  private foldBpm(ioiMs: number): number {
    let bpm = 60_000 / ioiMs;
    while (bpm < this.config.minBpm) bpm *= 2;
    while (bpm > this.config.maxBpm) bpm /= 2;
    return bpm;
  }

  private reestimate(): void {
    const folded = this.iois.map((ioi) => this.foldBpm(ioi));
    const med = median(folded);

    // Outlier rejection: one anomalous interval never jumps the estimate (§3.4).
    const inliers = folded.filter(
      (bpm) => Math.abs(bpm - med) / med <= this.config.outlierTolerance,
    );
    const pool = inliers.length > 0 ? inliers : folded;
    const target = pool.reduce((sum, bpm) => sum + bpm, 0) / pool.length;

    this.bpmValue =
      this.bpmValue === 0
        ? target
        : this.bpmValue + (target - this.bpmValue) * this.config.bpmSmoothing;

    // Regularity from mean absolute deviation around the median (all samples).
    const mad = folded.reduce((sum, bpm) => sum + Math.abs(bpm - med), 0) / folded.length / med;
    this.regularity = clamp01(1 - mad * this.config.regularityPenalty);
    this.confidence = clamp01(
      this.confidence + (this.regularity - this.confidence) * this.config.confidenceAttack,
    );
  }
}
