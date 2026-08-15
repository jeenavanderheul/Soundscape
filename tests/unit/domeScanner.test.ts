import { describe, expect, it } from 'vitest';

import {
  advanceScanner,
  beamStrengthAt,
  orbitSeconds,
  SCANNER_START,
  type ScannerInput,
} from '../../src/rendering/domeScanner';

/**
 * §146: the dome turns on the music's clock, and every behaviour belongs to a
 * section rather than to a random timer. These are the claims that make it a
 * measurement instead of a light show.
 */

const quiet: ScannerInput = {
  genre: null,
  bpm: 128,
  section: 'groove',
  low: 0,
  mid: 0,
  high: 0,
  sinceKick: 9,
  instability: 0,
};

/** Runs the scanner for `seconds` at 60 fps, so timing claims are real. */
function run(input: ScannerInput, seconds: number) {
  let state = SCANNER_START;
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) state = advanceScanner(state, input, dt);
  return state;
}

describe('§146 the dome signal', () => {
  it('turns in whole bars, never in arbitrary seconds', () => {
    // 128 bpm: a bar is 1.875s. Every section must land on a multiple of it.
    const bar = (60 / 128) * 4;
    for (const section of ['intro', 'groove', 'build', 'drop', 'break'] as const) {
      const seconds = orbitSeconds(128, section);
      expect(seconds / bar).toBeCloseTo(Math.round(seconds / bar));
    }
    // The peak turns fastest, the opening slowest.
    expect(orbitSeconds(128, 'drop')).toBeLessThan(orbitSeconds(128, 'groove'));
    expect(orbitSeconds(128, 'groove')).toBeLessThan(orbitSeconds(128, 'intro'));
  });

  it('keeps turning when the world has no tempo yet', () => {
    expect(orbitSeconds(0, 'groove')).toBeGreaterThan(0);
    expect(Number.isFinite(orbitSeconds(0, 'groove'))).toBe(true);
  });

  it('completes exactly one lap per orbit', () => {
    const seconds = orbitSeconds(128, 'groove');
    const half = run(quiet, seconds / 2);
    // Half a lap is half a turn away from where it started.
    expect(half.bearing).toBeGreaterThan(2.9);
    expect(half.bearing).toBeLessThan(3.4);
  });

  it('gives every section its own behaviour', () => {
    expect(run({ ...quiet, section: 'groove' }, 0.5).mode).toBe('normal');
    expect(run({ ...quiet, section: 'build' }, 0.5).mode).toBe('accelerate');
    expect(run({ ...quiet, section: 'break' }, 0.5).mode).toBe('hold');
    expect(run({ ...quiet, section: 'return' }, 0.5).mode).toBe('reverse');
    expect(run({ ...quiet, section: 'deep' }, 0.5).mode).toBe('double');
    expect(run({ ...quiet, section: 'drop' }, 0.5).mode).toBe('drop');
  });

  it('holds still through a break and turns back through a return', () => {
    const held = run({ ...quiet, section: 'break' }, 2);
    expect(held.bearing).toBe(SCANNER_START.bearing);
    // Reverse leaves the start going the other way, so it wraps round the top.
    const reversed = run({ ...quiet, section: 'return' }, 0.5);
    expect(reversed.bearing).toBeGreaterThan(Math.PI);
  });

  it('splits into two signals only where the section asks for it', () => {
    expect(run({ ...quiet, section: 'deep' }, 1).counterBearing).not.toBeNull();
    expect(run({ ...quiet, section: 'groove' }, 1).counterBearing).toBeNull();
    expect(run({ ...quiet, section: 'discovery' }, 1).ghostBearing).not.toBeNull();
    expect(run({ ...quiet, section: 'groove' }, 1).ghostBearing).toBeNull();
  });

  it('opens the band with bass and walks it up the dome with mids', () => {
    const still = run(quiet, 3);
    const heavy = run({ ...quiet, low: 1 }, 3);
    const bright = run({ ...quiet, mid: 1 }, 3);
    expect(heavy.width).toBeGreaterThan(still.width * 1.8);
    expect(bright.elevation).toBeGreaterThan(still.elevation + 0.3);
  });

  it('punches on the kick and goes silent at the top of a drop', () => {
    const between = run({ ...quiet, sinceKick: 0.4 }, 0.2);
    const onIt = run({ ...quiet, sinceKick: 0 }, 0.2);
    expect(onIt.intensity).toBeGreaterThan(between.intensity);
    // The one moment the signal is allowed to be absent.
    expect(run({ ...quiet, section: 'drop', sinceKick: 0.05 }, 0.2).intensity).toBe(0);
    expect(run({ ...quiet, section: 'drop', sinceKick: 0.5 }, 0.2).intensity).toBeGreaterThan(0.4);
  });

  it('lights a band with soft edges and a tail behind it, and nothing else', () => {
    const beam = 0;
    const width = 0.3;
    const tail = 1;
    // Dead centre is full; the edge of the band has fallen away.
    expect(beamStrengthAt(0, beam, width, tail, 1)).toBe(1);
    expect(beamStrengthAt(0.29, beam, width, tail, 1)).toBeLessThan(0.1);
    // Behind it, an afterimage that decays.
    const near = beamStrengthAt(-0.5, beam, width, tail, 1);
    const far = beamStrengthAt(-1.1, beam, width, tail, 1);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    // Ahead of it, darkness — the world has not been measured yet.
    expect(beamStrengthAt(0.9, beam, width, tail, 1)).toBe(0);
    // Turning the other way puts the tail on the other side.
    expect(beamStrengthAt(0.9, beam, width, tail, -1)).toBeGreaterThan(0);
    expect(beamStrengthAt(-0.9, beam, width, tail, -1)).toBe(0);
  });

  it('§148 gives each world its own way of moving the light', () => {
    // Techno lands on musical positions only: every bearing it ever takes is
    // one of four, however long it runs.
    const seen = new Set<string>();
    let state = SCANNER_START;
    for (let i = 0; i < 600; i++) {
      state = advanceScanner(state, { ...quiet, genre: 'techno' }, 1 / 60);
      seen.add(state.bearing.toFixed(3));
    }
    expect(seen.size).toBe(4);

    // The void turns slower than the riot, by a wide margin.
    const void1 = run({ ...quiet, genre: 'void-crusher' }, 2).bearing;
    const riot1 = run({ ...quiet, genre: 'percussion-riot' }, 2).bearing;
    expect(riot1).toBeGreaterThan(void1 * 2);

    // The riot runs three clusters; everything else runs one.
    expect(run({ ...quiet, genre: 'percussion-riot' }, 1).extraBearings).toHaveLength(3);
    expect(run({ ...quiet, genre: 'techno' }, 1).extraBearings).toHaveLength(0);

    // The broken machine stumbles: it covers less ground than its own rate
    // would suggest, and it does it the same way every time.
    const brokenA = run({ ...quiet, genre: 'broken-machine' }, 3).rawBearing;
    const brokenB = run({ ...quiet, genre: 'broken-machine' }, 3).rawBearing;
    const straight = run({ ...quiet, genre: null }, 3).rawBearing;
    expect(brokenA).toBe(brokenB);
    expect(brokenA).toBeLessThan(straight * 1.1);
  });

  it('§148 strobes only the world that asks for it', () => {
    const strobed = new Set<number>();
    let state = SCANNER_START;
    for (let i = 0; i < 400; i++) {
      state = advanceScanner(state, { ...quiet, genre: 'heavy-signal' }, 1 / 60);
      strobed.add(Math.round(state.intensity * 100));
    }
    // Two families of values: on, and chopped down to a fifth.
    expect(strobed.size).toBeGreaterThan(1);
    expect(Math.min(...strobed)).toBeLessThan(Math.max(...strobed) * 0.3);
  });

  it('leaves most of the world dark at any moment', () => {
    const state = run({ ...quiet, low: 1 }, 3);
    let lit = 0;
    const samples = 720;
    for (let i = 0; i < samples; i++) {
      const bearing = (i / samples) * Math.PI * 2;
      if (beamStrengthAt(bearing, state.bearing, state.width, state.tail, 1) > 0.15) lit++;
    }
    // §146 composition: a limited section, never the whole circle.
    expect(lit / samples).toBeLessThan(0.35);
  });
});
