import { describe, expect, it } from 'vitest';
import {
  ANALYSER_CONFIG,
  attachAudioAnalyser,
  AudioAnalyser,
  computeBandEnergies,
  computeRms,
  computeSpectralCentroid,
  type AnalyserLike,
} from '../../src/audio/AudioAnalyser';

const SAMPLE_RATE = 48000;
const FFT_SIZE = 2048;
const BIN_COUNT = FFT_SIZE / 2;
const BIN_HZ = SAMPLE_RATE / FFT_SIZE; // 23.4375 Hz per bin

class FakeAnalyser implements AnalyserLike {
  fftSize = FFT_SIZE;
  frequencyBinCount = BIN_COUNT;
  freq = new Uint8Array(BIN_COUNT);
  time = new Uint8Array(FFT_SIZE).fill(128);

  getByteFrequencyData(array: Uint8Array): void {
    array.set(this.freq);
  }

  getByteTimeDomainData(array: Uint8Array): void {
    array.set(this.time);
  }
}

function fillHzRange(bins: Uint8Array, fromHz: number, toHz: number, value: number): void {
  for (let i = 0; i < bins.length; i++) {
    const hz = i * BIN_HZ;
    if (hz >= fromHz && hz < toHz) bins[i] = value;
  }
}

describe('band energy math', () => {
  it('reports energy only in the band that contains it', () => {
    const bins = new Uint8Array(BIN_COUNT);
    fillHzRange(bins, 40, 200, 255);
    const low = computeBandEnergies(bins, SAMPLE_RATE, FFT_SIZE);
    expect(low.lowBand).toBeGreaterThan(0.5);
    expect(low.midBand).toBe(0);
    expect(low.highBand).toBe(0);

    bins.fill(0);
    fillHzRange(bins, 400, 1800, 255);
    const mid = computeBandEnergies(bins, SAMPLE_RATE, FFT_SIZE);
    expect(mid.midBand).toBeGreaterThan(0.5);
    expect(mid.lowBand).toBe(0);
    expect(mid.highBand).toBe(0);

    bins.fill(0);
    fillHzRange(bins, 4000, 12000, 255);
    const high = computeBandEnergies(bins, SAMPLE_RATE, FFT_SIZE);
    expect(high.highBand).toBeGreaterThan(0.3);
    expect(high.lowBand).toBe(0);
    expect(high.midBand).toBe(0);
  });

  it('normalizes full-scale bins to 1 within a band', () => {
    const bins = new Uint8Array(BIN_COUNT).fill(255);
    const { lowBand, midBand, highBand } = computeBandEnergies(bins, SAMPLE_RATE, FFT_SIZE);
    expect(lowBand).toBeCloseTo(1, 5);
    expect(midBand).toBeCloseTo(1, 5);
    expect(highBand).toBeCloseTo(1, 5);
  });
});

describe('rms math', () => {
  it('is zero for a silent (centered) time-domain buffer', () => {
    const time = new Uint8Array(FFT_SIZE).fill(128);
    expect(computeRms(time)).toBeCloseTo(0, 2);
  });

  it('approaches 1 for a full-swing square signal', () => {
    const time = new Uint8Array(FFT_SIZE);
    for (let i = 0; i < time.length; i++) time[i] = i % 2 === 0 ? 255 : 0;
    expect(computeRms(time)).toBeGreaterThan(0.9);
  });
});

describe('spectral centroid', () => {
  it('is higher for high-frequency content than low-frequency content', () => {
    const lowBins = new Uint8Array(BIN_COUNT);
    fillHzRange(lowBins, 40, 200, 255);
    const highBins = new Uint8Array(BIN_COUNT);
    fillHzRange(highBins, 8000, 16000, 255);
    const low = computeSpectralCentroid(lowBins, SAMPLE_RATE, FFT_SIZE);
    const high = computeSpectralCentroid(highBins, SAMPLE_RATE, FFT_SIZE);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThanOrEqual(1);
  });

  it('is zero for silence', () => {
    expect(computeSpectralCentroid(new Uint8Array(BIN_COUNT), SAMPLE_RATE, FFT_SIZE)).toBe(0);
  });
});

describe('AudioAnalyser smoothing', () => {
  it('does not jump to the raw value in a single small step', () => {
    const fake = new FakeAnalyser();
    fake.freq.fill(255);
    const analyser = new AudioAnalyser(fake, SAMPLE_RATE);
    analyser.update(0.016);
    expect(analyser.snapshot.lowBand).toBeGreaterThan(0);
    expect(analyser.snapshot.lowBand).toBeLessThan(0.5);
  });

  it('converges to the raw value after repeated updates', () => {
    const fake = new FakeAnalyser();
    fake.freq.fill(255);
    const analyser = new AudioAnalyser(fake, SAMPLE_RATE);
    for (let i = 0; i < 200; i++) analyser.update(0.016);
    expect(analyser.snapshot.lowBand).toBeGreaterThan(0.95);
    expect(analyser.snapshot.midBand).toBeGreaterThan(0.95);
    expect(analyser.snapshot.highBand).toBeGreaterThan(0.95);
  });

  it('decays smoothly back toward silence', () => {
    const fake = new FakeAnalyser();
    fake.freq.fill(255);
    const analyser = new AudioAnalyser(fake, SAMPLE_RATE);
    for (let i = 0; i < 200; i++) analyser.update(0.016);
    fake.freq.fill(0);
    analyser.update(0.016);
    const first = analyser.snapshot.lowBand;
    expect(first).toBeGreaterThan(0.5); // no instant drop
    for (let i = 0; i < 200; i++) analyser.update(0.016);
    expect(analyser.snapshot.lowBand).toBeLessThan(0.05);
  });
});

describe('AudioAnalyser onset detection', () => {
  it('flags an onset on a sudden spectral rise and respects the cooldown', () => {
    const fake = new FakeAnalyser();
    const analyser = new AudioAnalyser(fake, SAMPLE_RATE);
    analyser.update(0.016); // silence baseline
    expect(analyser.snapshot.onset).toBe(false);

    fake.freq.fill(200);
    analyser.update(0.016);
    expect(analyser.snapshot.onset).toBe(true);

    // Second spike inside the cooldown window is suppressed.
    fake.freq.fill(0);
    analyser.update(0.016);
    fake.freq.fill(200);
    analyser.update(0.016);
    expect(analyser.snapshot.onset).toBe(false);

    // After the cooldown, a new spike triggers again.
    fake.freq.fill(0);
    analyser.update(ANALYSER_CONFIG.onsetCooldownSeconds + 0.05);
    fake.freq.fill(200);
    analyser.update(0.016);
    expect(analyser.snapshot.onset).toBe(true);
  });

  it('does not flag onsets for a steady sustained spectrum', () => {
    const fake = new FakeAnalyser();
    fake.freq.fill(180);
    const analyser = new AudioAnalyser(fake, SAMPLE_RATE);
    analyser.update(0.016); // first frame may spike
    for (let i = 0; i < 30; i++) {
      analyser.update(0.016);
      expect(analyser.snapshot.onset).toBe(false);
    }
  });
});

describe('AudioAnalyser allocations', () => {
  it('exposes the same snapshot object across updates (reused, no per-tick allocation)', () => {
    const fake = new FakeAnalyser();
    const analyser = new AudioAnalyser(fake, SAMPLE_RATE);
    analyser.update(0.016);
    const first = analyser.snapshot;
    analyser.update(0.016);
    expect(analyser.snapshot).toBe(first);
  });
});

describe('attachAudioAnalyser', () => {
  it('creates an AnalyserNode on the context and taps the master output', () => {
    const created: FakeAnalyser[] = [];
    const connections: unknown[] = [];
    const fakeContext = {
      sampleRate: SAMPLE_RATE,
      createAnalyser() {
        const node = new FakeAnalyser() as FakeAnalyser & { smoothingTimeConstant?: number };
        created.push(node);
        return node;
      },
    };
    const fakeEngine = {
      get context() {
        return fakeContext as unknown as AudioContext;
      },
      getOutputNode() {
        return {
          connect(target: unknown) {
            connections.push(target);
            return target;
          },
        } as unknown as AudioNode;
      },
    };
    const analyser = attachAudioAnalyser(fakeEngine);
    expect(created).toHaveLength(1);
    expect(connections[0]).toBe(created[0]);
    expect(analyser.snapshot.rms).toBe(0);
  });
});
