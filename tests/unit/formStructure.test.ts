import { describe, expect, it } from 'vitest';
import {
  consonanceToStability,
  HZ_SCALE_RANGE,
  hzToDetail,
  hzToScale,
  materialProfileForWaveform,
} from '../../src/world/StructureData';
import type { Waveform } from '../../src/player/FrequencyState';

describe('hzToScale (spec §3.1: pitch = space and scale)', () => {
  it('maps the low band to huge mass and the high band to tiny detail', () => {
    expect(hzToScale(20)).toBe(HZ_SCALE_RANGE.maxScale);
    expect(hzToScale(8000)).toBe(HZ_SCALE_RANGE.minScale);
  });

  it('clamps below 20 Hz and above 8 kHz', () => {
    expect(hzToScale(5)).toBe(HZ_SCALE_RANGE.maxScale);
    expect(hzToScale(16000)).toBe(HZ_SCALE_RANGE.minScale);
  });

  it('is monotonically decreasing across the §3.1 bands', () => {
    const bands = [20, 80, 300, 2000, 8000];
    for (let i = 1; i < bands.length; i++) {
      expect(hzToScale(bands[i]!)).toBeLessThan(hzToScale(bands[i - 1]!));
    }
  });

  it('is logarithmic: equal octave steps produce equal scale ratios', () => {
    const r1 = hzToScale(40) / hzToScale(80);
    const r2 = hzToScale(80) / hzToScale(160);
    expect(r1).toBeCloseTo(r2, 10);
  });

  it('rejects non-positive frequencies', () => {
    expect(() => hzToScale(0)).toThrow();
    expect(() => hzToScale(-100)).toThrow();
  });
});

describe('hzToDetail (inverse of mass: high frequency = fine detail)', () => {
  it('is 0 at the low end and 1 at the high end, clamped', () => {
    expect(hzToDetail(20)).toBe(0);
    expect(hzToDetail(8000)).toBe(1);
    expect(hzToDetail(5)).toBe(0);
    expect(hzToDetail(16000)).toBe(1);
  });

  it('is monotonically increasing', () => {
    const bands = [20, 80, 300, 2000, 8000];
    for (let i = 1; i < bands.length; i++) {
      expect(hzToDetail(bands[i]!)).toBeGreaterThan(hzToDetail(bands[i - 1]!));
    }
  });

  it('rejects non-positive frequencies', () => {
    expect(() => hzToDetail(0)).toThrow();
  });
});

describe('consonanceToStability (spec §3.6: harmony = connection)', () => {
  it('is clamped to [0, 1]', () => {
    expect(consonanceToStability(-0.5)).toBe(0);
    expect(consonanceToStability(1.5)).toBe(1);
  });

  it('is monotonic in consonance', () => {
    const samples = [0, 0.25, 0.5, 0.75, 1];
    for (let i = 1; i < samples.length; i++) {
      expect(consonanceToStability(samples[i]!)).toBeGreaterThanOrEqual(
        consonanceToStability(samples[i - 1]!),
      );
    }
  });
});

describe('materialProfileForWaveform (spec §3.7: timbre = matter)', () => {
  it('follows the timbre → matter table', () => {
    const expected: Record<Waveform, string> = {
      sine: 'glass',
      triangle: 'faceted',
      square: 'digital',
      saw: 'metallic',
      noise: 'fog',
    };
    for (const [waveform, profile] of Object.entries(expected)) {
      expect(materialProfileForWaveform(waveform as Waveform)).toBe(profile);
    }
  });
});
