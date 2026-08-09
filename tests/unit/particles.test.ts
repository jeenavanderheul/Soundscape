import { describe, expect, it } from 'vitest';
import {
  amplitudeToBrightness,
  hzToPointSize,
  PARTICLE_CONFIG,
  seedParticlePositions,
  wrapAxis,
} from '../../src/rendering/ParticleSystem';

describe('seedParticlePositions', () => {
  it('same seed produces identical positions', () => {
    const a = seedParticlePositions(200, 10, 'void');
    const b = seedParticlePositions(200, 10, 'void');
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('different seeds produce different positions', () => {
    const a = seedParticlePositions(200, 10, 'seed-a');
    const b = seedParticlePositions(200, 10, 'seed-b');
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('returns xyz triplets for every particle', () => {
    expect(seedParticlePositions(50, 10, 's')).toHaveLength(150);
  });

  it('keeps every coordinate within the radius', () => {
    const positions = seedParticlePositions(500, 8, 's');
    for (const v of positions) {
      expect(Math.abs(v)).toBeLessThanOrEqual(8);
    }
  });
});

describe('hzToPointSize', () => {
  it('is monotonically decreasing across the audible range (high hz → finer points)', () => {
    const samples = [20, 80, 300, 1000, 2000, 8000, 16000];
    for (let i = 1; i < samples.length; i++) {
      expect(hzToPointSize(samples[i]!)).toBeLessThan(hzToPointSize(samples[i - 1]!));
    }
  });

  it('stays within the configured size bounds, clamping out-of-range hz', () => {
    for (const hz of [1, 20, 440, 20000, 100000]) {
      const size = hzToPointSize(hz);
      expect(size).toBeGreaterThanOrEqual(PARTICLE_CONFIG.minPointSize);
      expect(size).toBeLessThanOrEqual(PARTICLE_CONFIG.maxPointSize);
    }
  });
});

describe('amplitudeToBrightness', () => {
  it('is monotonically increasing (more amplitude → brighter)', () => {
    expect(amplitudeToBrightness(0)).toBeLessThan(amplitudeToBrightness(0.5));
    expect(amplitudeToBrightness(0.5)).toBeLessThan(amplitudeToBrightness(1));
  });

  it('never goes fully dark and never exceeds 1', () => {
    for (const amp of [-1, 0, 0.25, 1, 2]) {
      const b = amplitudeToBrightness(amp);
      expect(b).toBeGreaterThan(0);
      expect(b).toBeLessThanOrEqual(1);
    }
  });
});

describe('wrapAxis', () => {
  it('leaves values inside the radius untouched', () => {
    expect(wrapAxis(3, 0, 10)).toBe(3);
    expect(wrapAxis(-9.5, 0, 10)).toBe(-9.5);
  });

  it('wraps values beyond the radius to the opposite side of the center', () => {
    expect(wrapAxis(11, 0, 10)).toBe(-9);
    expect(wrapAxis(-12, 0, 10)).toBe(8);
  });

  it('wraps relative to a moving center', () => {
    expect(wrapAxis(115, 100, 10)).toBe(95);
  });
});
