import { describe, expect, it } from 'vitest';
import { RHYTHM_DETECTOR_CONFIG, RhythmDetector } from '../../src/music/RhythmDetector';

/** Feed a steady pulse train: onsets every `intervalMs`, with update calls between them. */
function feedTrain(
  detector: RhythmDetector,
  startMs: number,
  intervalMs: number,
  count: number,
): number {
  let t = startMs;
  for (let i = 0; i < count; i += 1) {
    detector.update(t);
    detector.onOnset(t);
    t += intervalMs;
  }
  detector.update(t);
  return t;
}

describe('RhythmDetector', () => {
  it('converges on a steady 120 BPM pulse train', () => {
    const detector = new RhythmDetector();
    feedTrain(detector, 0, 500, 24);
    expect(detector.bpm).toBeGreaterThan(118);
    expect(detector.bpm).toBeLessThan(122);
  });

  it('raises tempoConfidence with a regular train and decays it without input', () => {
    const detector = new RhythmDetector();
    const end = feedTrain(detector, 0, 500, 24);
    const peak = detector.tempoConfidence;
    expect(peak).toBeGreaterThan(0.6);

    // 10 seconds of silence, stepped like the logic loop.
    for (let t = end; t <= end + 10_000; t += 100) detector.update(t);
    expect(detector.tempoConfidence).toBeLessThan(peak * 0.5);
  });

  it('confidence stays low for an irregular train', () => {
    const detector = new RhythmDetector();
    const intervals = [500, 810, 340, 655, 470, 920, 385, 730, 515, 860, 410, 640];
    let t = 0;
    for (const interval of intervals) {
      detector.update(t);
      detector.onOnset(t);
      t += interval;
    }
    detector.update(t);
    expect(detector.tempoConfidence).toBeLessThan(0.5);
  });

  it('a single anomalous 2x interval barely moves the BPM estimate', () => {
    const detector = new RhythmDetector();
    let t = feedTrain(detector, 0, 500, 24);
    const before = detector.bpm;

    // One missed beat: a single 1000 ms gap, then the train resumes.
    t += 500; // last onset was at t-500 after feedTrain; make the gap 1000 ms total
    detector.update(t);
    detector.onOnset(t);
    expect(Math.abs(detector.bpm - before)).toBeLessThan(3);

    feedTrain(detector, t + 500, 500, 4);
    expect(Math.abs(detector.bpm - before)).toBeLessThan(3);
  });

  it('folds slow pulses up into the musical range (1500 ms → 80 BPM)', () => {
    const detector = new RhythmDetector();
    feedTrain(detector, 0, 1500, 16);
    expect(detector.bpm).toBeGreaterThan(78);
    expect(detector.bpm).toBeLessThan(82);
  });

  it('folds fast pulses down into the musical range (250 ms → 120 BPM)', () => {
    const detector = new RhythmDetector();
    feedTrain(detector, 0, 250, 24);
    expect(detector.bpm).toBeGreaterThan(118);
    expect(detector.bpm).toBeLessThan(122);
  });

  it('quantizeStrength rises gradually, never jumps, and stays in [0, 1]', () => {
    const detector = new RhythmDetector();
    expect(detector.quantizeStrength).toBe(0);

    const samples: number[] = [];
    let t = 0;
    for (let i = 0; i < 40; i += 1) {
      detector.update(t);
      detector.onOnset(t);
      samples.push(detector.quantizeStrength);
      t += 500;
    }

    // Early strength is low; sustained regularity grows it substantially.
    expect(samples[3]).toBeLessThan(0.3);
    expect(samples[39]).toBeGreaterThan(0.5);
    for (let i = 1; i < samples.length; i += 1) {
      const current = samples[i] ?? -1;
      const previous = samples[i - 1] ?? -1;
      expect(current).toBeGreaterThanOrEqual(0);
      expect(current).toBeLessThanOrEqual(1);
      // Gradual: no single step jumps more than 0.2.
      expect(Math.abs(current - previous)).toBeLessThan(0.2);
    }
  });

  it('quantize is identity with no rhythm evidence', () => {
    const detector = new RhythmDetector();
    expect(detector.quantize(1234)).toBe(1234);
  });

  it('quantize snaps toward the grid proportionally to quantizeStrength', () => {
    const detector = new RhythmDetector();
    const end = feedTrain(detector, 0, 500, 40);
    const strength = detector.quantizeStrength;
    expect(strength).toBeGreaterThan(0.5);

    // The grid is anchored on the last onset (end - 500); +120 ms is off-grid.
    const lastOnset = end - 500;
    const input = lastOnset + 500 + 120;
    const nearestGrid = lastOnset + 500;
    const out = detector.quantize(input);
    // Snapped toward grid, proportionally, never past it.
    expect(out).toBeLessThan(input);
    expect(out).toBeGreaterThanOrEqual(nearestGrid);
    expect(out).toBeCloseTo(input + (nearestGrid - input) * strength, 6);
  });

  it('measures rhythmDensity as smoothed onsets per second', () => {
    const detector = new RhythmDetector();
    feedTrain(detector, 0, 500, 40); // 2 onsets/sec
    expect(detector.rhythmDensity).toBeGreaterThan(1.5);
    expect(detector.rhythmDensity).toBeLessThan(2.5);
  });

  it('rhythmicRegularity is high for steady trains and low for irregular ones', () => {
    const steady = new RhythmDetector();
    feedTrain(steady, 0, 500, 24);
    expect(steady.rhythmicRegularity).toBeGreaterThan(0.8);

    const messy = new RhythmDetector();
    const intervals = [500, 900, 300, 700, 450, 950, 350, 800];
    let t = 0;
    for (const interval of intervals) {
      messy.update(t);
      messy.onOnset(t);
      t += interval;
    }
    messy.update(t);
    expect(messy.rhythmicRegularity).toBeLessThan(steady.rhythmicRegularity);
  });

  it('keeps history buffers bounded under long input streams', () => {
    const detector = new RhythmDetector();
    feedTrain(detector, 0, 500, 1000);
    expect(detector.ioiHistorySize).toBeLessThanOrEqual(RHYTHM_DETECTOR_CONFIG.maxIoiHistory);
    expect(detector.onsetHistorySize).toBeLessThanOrEqual(RHYTHM_DETECTOR_CONFIG.maxOnsetHistory);
  });

  it('ignores sub-debounce double triggers', () => {
    const detector = new RhythmDetector();
    let t = feedTrain(detector, 0, 500, 24);
    const before = detector.bpm;
    // Ghost double-trigger 10 ms after a real onset.
    detector.onOnset(t);
    detector.onOnset(t + 10);
    feedTrain(detector, t + 500, 500, 4);
    expect(Math.abs(detector.bpm - before)).toBeLessThan(3);
  });

  it('a long silence gap does not produce a bogus interval', () => {
    const detector = new RhythmDetector();
    const end = feedTrain(detector, 0, 500, 24);
    const before = detector.bpm;
    // 20 s pause, then a lone onset: the 20 s IOI must be discarded.
    detector.update(end + 20_000);
    detector.onOnset(end + 20_000);
    expect(Math.abs(detector.bpm - before)).toBeLessThan(3);
  });
});
