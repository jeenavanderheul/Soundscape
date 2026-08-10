/**
 * MusicStateAnalyzer (spec §10, §15): pure logic, called from the
 * lower-frequency logic loop. Merges RhythmDetector output and the current
 * FrequencyState into the MusicStore with smoothed, bounded, immutable
 * updates. M4 scope: rhythm/tempo fields, dynamics, pitchCenter,
 * timbreBrightness, transientDensity and a simple energy-based void → intro
 * transition. Later phases and analyzers are out of scope here.
 */
import type { Store } from '../core/stores';
import type { FrequencyState } from '../player/FrequencyState';
import type { MusicState } from './MusicState';
import type { RhythmDetector } from './RhythmDetector';

export interface MusicStateAnalyzerConfig {
  /** Exponential smoothing rates (per second). */
  dynamicsRate: number;
  pitchRate: number;
  brightnessRate: number;
  transientRate: number;
  /** Onset rate (per second) that maps to transientDensity = 1. */
  transientFullScale: number;
  /** rhythmDensity (onsets/sec) that counts as full rhythmic energy. */
  energyDensityFullScale: number;
  /** Blend of amplitude vs rhythm in the phase-energy metric. */
  energyAmplitudeWeight: number;
  /** Energy level and hold time required for void → intro. */
  introEnergyThreshold: number;
  introHoldMs: number;
  /** Clamp on a single logic-step delta (tab suspension safety). */
  maxDeltaMs: number;
  maxBpm: number;
  /** M5 genre signals: smoothing rates for repetition and low-end energy. */
  repetitionRate: number;
  lowEndRate: number;
}

export const MUSIC_STATE_ANALYZER_CONFIG: MusicStateAnalyzerConfig = {
  dynamicsRate: 3,
  pitchRate: 1.5,
  brightnessRate: 2,
  transientRate: 2,
  transientFullScale: 8,
  energyDensityFullScale: 2,
  energyAmplitudeWeight: 0.6,
  introEnergyThreshold: 0.3,
  introHoldMs: 3000,
  maxDeltaMs: 500,
  maxBpm: 300,
  repetitionRate: 1.5,
  lowEndRate: 3,
};

const WAVEFORM_NOISE: Record<FrequencyState['waveform'], number> = {
  sine: 0,
  triangle: 0.05,
  square: 0.15,
  saw: 0.25,
  noise: 1,
};

const WAVEFORM_BRIGHTNESS: Record<FrequencyState['waveform'], number> = {
  sine: 0.1,
  triangle: 0.3,
  square: 0.6,
  saw: 0.8,
  noise: 0.9,
};

const BRIGHTNESS_MIN_HZ = 20;
const BRIGHTNESS_MAX_HZ = 8000;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Frame-rate-independent exponential approach of current toward target. */
function smooth(current: number, target: number, ratePerSec: number, deltaSec: number): number {
  return current + (target - current) * (1 - Math.exp(-ratePerSec * deltaSec));
}

/** Normalized log-frequency position, 0 at 20 Hz → 1 at 8 kHz (spec §3.1). */
function logHzNorm(hz: number): number {
  if (hz <= BRIGHTNESS_MIN_HZ) return 0;
  return clamp01(Math.log(hz / BRIGHTNESS_MIN_HZ) / Math.log(BRIGHTNESS_MAX_HZ / BRIGHTNESS_MIN_HZ));
}

export class MusicStateAnalyzer {
  private lastNowMs: number | null = null;
  private introEnergyMs = 0;

  constructor(
    private readonly store: Store<MusicState>,
    private readonly rhythm: RhythmDetector,
    private readonly config: MusicStateAnalyzerConfig = MUSIC_STATE_ANALYZER_CONFIG,
  ) {}

  /** Logic-loop step: advance rhythm time and publish a smoothed MusicState.
   * `lowBand` is the smoothed low-band energy from the audio analyser (§12). */
  update(nowMs: number, frequency: Readonly<FrequencyState>, lowBand = 0): void {
    const { config, rhythm } = this;
    const rawDelta = this.lastNowMs === null ? 0 : nowMs - this.lastNowMs;
    this.lastNowMs = nowMs;
    const deltaSec = Math.min(config.maxDeltaMs, Math.max(0, rawDelta)) / 1000;

    rhythm.update(nowMs);

    const amplitude = clamp01(frequency.amplitude);
    const brightnessTarget = clamp01(
      0.5 * WAVEFORM_BRIGHTNESS[frequency.waveform] + 0.5 * logHzNorm(frequency.hz),
    );
    const transientTarget = clamp01(rhythm.rhythmDensity / config.transientFullScale);

    this.store.setState((current) => {
      // pitchCenter smoothing runs in log-frequency space (spec §5).
      const pitchCenter =
        frequency.hz > 0 && current.pitchCenter > 0
          ? Math.exp(
              smooth(Math.log(current.pitchCenter), Math.log(frequency.hz), config.pitchRate, deltaSec),
            )
          : frequency.hz;

      return {
        ...current,
        bpm: Math.min(config.maxBpm, Math.max(0, rhythm.bpm)),
        tempoConfidence: clamp01(rhythm.tempoConfidence),
        rhythmDensity: Math.max(0, rhythm.rhythmDensity),
        rhythmicRegularity: clamp01(rhythm.rhythmicRegularity),
        dynamics: clamp01(smooth(current.dynamics, amplitude, config.dynamicsRate, deltaSec)),
        pitchCenter,
        timbreBrightness: clamp01(
          smooth(current.timbreBrightness, brightnessTarget, config.brightnessRate, deltaSec),
        ),
        transientDensity: clamp01(
          smooth(current.transientDensity, transientTarget, config.transientRate, deltaSec),
        ),
        // §9 genre signals: repetition is regular, confident pulse over time;
        // low end and timbre noise feed the Techno/Ambient profiles.
        repetition: clamp01(
          smooth(
            current.repetition,
            clamp01(rhythm.rhythmicRegularity * rhythm.tempoConfidence),
            config.repetitionRate,
            deltaSec,
          ),
        ),
        lowEndEnergy: clamp01(
          smooth(current.lowEndEnergy, clamp01(lowBand), config.lowEndRate, deltaSec),
        ),
        timbreNoise: clamp01(
          smooth(current.timbreNoise, WAVEFORM_NOISE[frequency.waveform], config.brightnessRate, deltaSec),
        ),
        formPhase: this.nextFormPhase(current.formPhase, amplitude, rawDelta),
      };
    });
  }

  /** M4 scope: only the energy-based void → intro transition; intro persists. */
  private nextFormPhase(
    phase: MusicState['formPhase'],
    amplitude: number,
    deltaMs: number,
  ): MusicState['formPhase'] {
    if (phase !== 'void') return phase;
    const { config, rhythm } = this;
    const energy =
      config.energyAmplitudeWeight * amplitude +
      (1 - config.energyAmplitudeWeight) * clamp01(rhythm.rhythmDensity / config.energyDensityFullScale);
    this.introEnergyMs = energy >= config.introEnergyThreshold ? this.introEnergyMs + deltaMs : 0;
    return this.introEnergyMs >= config.introHoldMs ? 'intro' : 'void';
  }
}
