import { describe, expect, it } from 'vitest';
import {
  beatingRoughness,
  BEATING_BAND,
  classify,
  CLASSIFY_THRESHOLDS,
  consonanceScore,
  dissonanceScore,
  frequencyRatio,
  interactionStrength,
  phaseDifference,
} from '../../src/resonance/WaveInteraction';

describe('frequencyRatio', () => {
  it('reduces any pair to the [1, 2) octave', () => {
    expect(frequencyRatio(220, 220)).toBe(1);
    expect(frequencyRatio(440, 220)).toBe(1); // octave collapses to unison
    expect(frequencyRatio(220, 440)).toBe(1);
    expect(frequencyRatio(330, 220)).toBeCloseTo(1.5, 10);
    expect(frequencyRatio(220, 330)).toBeCloseTo(1.5, 10); // order-independent
    expect(frequencyRatio(660, 220)).toBeCloseTo(1.5, 10); // 3/1 → 3/2
  });

  it('always lands in [1, 2) for arbitrary positive inputs', () => {
    const pairs: Array<[number, number]> = [
      [30, 7999],
      [8000, 30.01],
      [55.5, 1234.5],
      [999, 1000],
    ];
    for (const [a, b] of pairs) {
      const r = frequencyRatio(a, b);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThan(2);
    }
  });

  it('rejects non-positive frequencies', () => {
    expect(() => frequencyRatio(0, 220)).toThrowError();
    expect(() => frequencyRatio(220, -1)).toThrowError();
  });
});

describe('consonanceScore', () => {
  it('scores unison highest', () => {
    expect(consonanceScore(1)).toBeCloseTo(1, 5);
  });

  it('orders simple ratios above the tritone', () => {
    const fifth = consonanceScore(3 / 2);
    const fourth = consonanceScore(4 / 3);
    const majorThird = consonanceScore(5 / 4);
    const tritone = consonanceScore(Math.SQRT2);
    expect(fifth).toBeGreaterThan(tritone);
    expect(fourth).toBeGreaterThan(tritone);
    expect(majorThird).toBeGreaterThan(tritone);
    expect(consonanceScore(1)).toBeGreaterThan(fifth);
    expect(tritone).toBeLessThan(0.1);
  });

  it('falls off with detuning from a simple ratio', () => {
    const exact = consonanceScore(1.5);
    const slightlyOff = consonanceScore(1.5 * 2 ** (20 / 1200)); // +20 cents
    const wayOff = consonanceScore(1.5 * 2 ** (80 / 1200)); // +80 cents
    expect(exact).toBeGreaterThan(slightlyOff);
    expect(slightlyOff).toBeGreaterThan(wayOff);
  });

  it('stays within [0, 1]', () => {
    for (let r = 1; r < 2; r += 0.01) {
      const s = consonanceScore(r);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('beatingRoughness', () => {
  it('is zero outside the beating band', () => {
    expect(beatingRoughness(0)).toBe(0);
    expect(beatingRoughness(BEATING_BAND.minHz - 0.5)).toBe(0);
    expect(beatingRoughness(BEATING_BAND.maxHz + 1)).toBe(0);
    expect(beatingRoughness(200)).toBe(0);
  });

  it('is strong inside the beating band and symmetric in sign', () => {
    const mid = (BEATING_BAND.minHz + BEATING_BAND.maxHz) / 2;
    expect(beatingRoughness(mid)).toBeGreaterThan(0.9);
    expect(beatingRoughness(-mid)).toBe(beatingRoughness(mid));
    expect(beatingRoughness(5)).toBeGreaterThan(0);
    expect(beatingRoughness(25)).toBeGreaterThan(0);
  });
});

describe('dissonanceScore', () => {
  it('is low for a perfect fifth outside the beating band', () => {
    expect(dissonanceScore(220, 330)).toBeLessThan(0.2);
  });

  it('is high when |Δf| sits in the beating band', () => {
    // 200 vs 210 Hz: mistuned unison, 10 Hz beating.
    expect(dissonanceScore(200, 210)).toBeGreaterThan(0.8);
    expect(dissonanceScore(200, 210)).toBeGreaterThan(dissonanceScore(200, 300));
  });

  it('is high for a tritone even without beating', () => {
    expect(dissonanceScore(200, 200 * Math.SQRT2)).toBeGreaterThan(0.55);
  });

  it('is near zero for a clean unison with negligible beating', () => {
    expect(dissonanceScore(220, 220)).toBeLessThan(0.1);
  });
});

describe('phaseDifference', () => {
  it('wraps into [0, 2π)', () => {
    const tau = Math.PI * 2;
    expect(phaseDifference(0, 0)).toBe(0);
    expect(phaseDifference(Math.PI, 0)).toBeCloseTo(Math.PI, 10);
    expect(phaseDifference(0, Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(phaseDifference(tau + 0.5, 0)).toBeCloseTo(0.5, 10);
    expect(phaseDifference(-0.5, 0)).toBeCloseTo(tau - 0.5, 10);
  });
});

describe('interactionStrength', () => {
  const radii = { source: 8, target: 6 };
  const full = { source: 1, target: 1 };

  it('is zero at or beyond the combined radius', () => {
    expect(interactionStrength(14, radii, full)).toBe(0);
    expect(interactionStrength(50, radii, full)).toBe(0);
  });

  it('grows monotonically as distance shrinks', () => {
    const far = interactionStrength(12, radii, full);
    const mid = interactionStrength(7, radii, full);
    const near = interactionStrength(1, radii, full);
    expect(far).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(far);
    expect(near).toBeGreaterThan(mid);
    expect(near).toBeLessThanOrEqual(1);
  });

  it('is zero when either amplitude is zero', () => {
    expect(interactionStrength(1, radii, { source: 0, target: 1 })).toBe(0);
    expect(interactionStrength(1, radii, { source: 1, target: 0 })).toBe(0);
  });

  it('scales with amplitude', () => {
    const loud = interactionStrength(5, radii, { source: 1, target: 1 });
    const quiet = interactionStrength(5, radii, { source: 0.2, target: 1 });
    expect(loud).toBeGreaterThan(quiet);
  });
});

describe('classify', () => {
  const base = { deltaHz: 100, phaseDifference: 0, consonance: 0, dissonance: 0 };

  it('classifies coincident in-phase waves as amplification', () => {
    expect(classify({ ...base, deltaHz: 0.5, phaseDifference: 0.1, consonance: 1 })).toBe(
      'amplification',
    );
  });

  it('classifies coincident anti-phase waves as cancellation', () => {
    expect(classify({ ...base, deltaHz: 0.5, phaseDifference: Math.PI, consonance: 1 })).toBe(
      'cancellation',
    );
  });

  it('classifies high consonance as harmonic', () => {
    expect(
      classify({ ...base, consonance: CLASSIFY_THRESHOLDS.harmonicMinConsonance + 0.1 }),
    ).toBe('harmonic');
  });

  it('classifies high dissonance as dissonant', () => {
    expect(
      classify({ ...base, dissonance: CLASSIFY_THRESHOLDS.dissonantMinDissonance + 0.1 }),
    ).toBe('dissonant');
  });

  it('falls back to complex for in-between relations', () => {
    expect(classify({ ...base, consonance: 0.3, dissonance: 0.3 })).toBe('complex');
  });

  it('matches end-to-end scores: fifth is harmonic, beating unison is dissonant', () => {
    const fifth = classify({
      deltaHz: 110,
      phaseDifference: 1,
      consonance: consonanceScore(frequencyRatio(220, 330)),
      dissonance: dissonanceScore(220, 330),
    });
    expect(fifth).toBe('harmonic');

    const beating = classify({
      deltaHz: 10,
      phaseDifference: 1,
      consonance: consonanceScore(frequencyRatio(200, 210)),
      dissonance: dissonanceScore(200, 210),
    });
    expect(beating).toBe('dissonant');
  });
});
