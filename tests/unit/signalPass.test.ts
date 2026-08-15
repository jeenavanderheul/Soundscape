import { describe, expect, it } from 'vitest';
import { BEAT_SYNC_CONFIG } from '../../src/rendering/BeatSync';
import {
  SIGNAL_FRAGMENT,
  SIGNAL_VERTEX,
  SLICE_MS,
  createSignalUniforms,
  echoDecay,
  safeAmounts,
  sliceEnvelope,
} from '../../src/rendering/SignalPass';

/**
 * §156: the world's post pass. The GPU work cannot be exercised here, so what
 * is tested is everything that decides what the GPU is asked to do — the rest
 * state, the envelopes, and the §23 safety clamp.
 */
describe('echoDecay', () => {
  it('is nothing at zero frames and never reaches one', () => {
    expect(echoDecay(0)).toBe(0);
    expect(echoDecay(-3)).toBe(0);
    for (const frames of [1, 4, 12, 60, 600]) {
      expect(echoDecay(frames)).toBeLessThan(1);
    }
  });

  it('leaves a tail the requested number of frames long', () => {
    for (const frames of [2, 8, 30]) {
      const decay = echoDecay(frames);
      // After `frames` frames the memory is down to 5% — the point where a
      // line stops reading against near-black.
      expect(Math.pow(decay, frames)).toBeCloseTo(0.05, 6);
      expect(Math.pow(decay, frames - 1)).toBeGreaterThan(0.05);
    }
  });
});

describe('sliceEnvelope', () => {
  it('is an event, not a state', () => {
    expect(sliceEnvelope(0, 1)).toBe(1);
    expect(sliceEnvelope(SLICE_MS, 1)).toBe(0);
    expect(sliceEnvelope(SLICE_MS * 4, 1)).toBe(0);
    // Never fired: the age is +Infinity.
    expect(sliceEnvelope(Number.POSITIVE_INFINITY, 1)).toBe(0);
  });

  it('decays monotonically and stays inside the strength it was fired with', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let age = 0; age < SLICE_MS; age += 5) {
      const value = sliceEnvelope(age, 0.4);
      expect(value).toBeLessThanOrEqual(0.4);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });

  it('is silent at zero strength', () => {
    expect(sliceEnvelope(10, 0)).toBe(0);
  });
});

/**
 * §23 is the reason this file exists at all. Ghost frames, tearing, clipping
 * and channel displacement are photosensitivity-relevant, and nothing else in
 * the render path reads `prefers-reduced-motion`.
 */
describe('safeAmounts under reduced motion', () => {
  const cap = BEAT_SYNC_CONFIG.maxModulationDepth;

  it('passes everything through when the gate is off', () => {
    const raw = { persistence: 0.9, clip: 0.8, slice: 0.7, displace: 0.6 };
    expect(safeAmounts(raw, false)).toEqual(raw);
  });

  it('removes frame slicing entirely and holds luminance under the beat cap', () => {
    for (let v = 0; v <= 1.0001; v += 0.05) {
      const safe = safeAmounts(
        { persistence: v, clip: v, slice: v, displace: v },
        true,
      );
      expect(safe.slice).toBe(0);
      expect(safe.persistence).toBeLessThanOrEqual(cap);
      // Clipping multiplies luminance by 1 + clip * CLIP_GAIN; it is that lift
      // that has to stay under the cap, not the raw input.
      expect(safe.clip * 0.85).toBeLessThanOrEqual(cap + 1e-9);
    }
  });

  it('clamps out-of-range input rather than trusting the caller', () => {
    const safe = safeAmounts({ persistence: 4, clip: -2, slice: 9, displace: 3 }, false);
    expect(safe).toEqual({ persistence: 1, clip: 0, slice: 1, displace: 1 });
  });
});

describe('the rest state', () => {
  it('gates every effect to zero, so the pass is a plain copy of the scene', () => {
    const uniforms = createSignalUniforms();
    for (const key of ['uAccumulate', 'uDecay', 'uPersistence', 'uDisplace', 'uGrain', 'uClip', 'uSlice'] as const) {
      expect(uniforms[key].value).toBe(0);
    }
  });
});

/**
 * Two traps this repo has walked into before, and both only show up as a
 * silent shader-compile warning at runtime.
 */
describe('the shader source', () => {
  const sources = [SIGNAL_VERTEX, SIGNAL_FRAGMENT];

  it('contains no backtick, which would close the template literal', () => {
    for (const source of sources) expect(source).not.toContain('`');
  });

  it('uses no GLSL reserved word as an identifier', () => {
    // `half` is the one that has bitten here; the rest are its neighbours in
    // the ES 1.00 reserved list and are just as easy to reach for.
    const reserved = ['half', 'input', 'output', 'filter', 'sample', 'active', 'flat', 'double'];
    for (const source of sources) {
      for (const word of reserved) {
        expect(source).not.toMatch(new RegExp(`\\b${word}\\b`));
      }
    }
  });
});
