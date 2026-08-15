import { describe, expect, it } from 'vitest';

import {
  advanceScanner,
  beamLiftAt,
  beamStrengthAt,
  orbitSeconds,
  SCANNER_START,
  type ScannerInput,
} from '../../src/rendering/domeScanner';
import { WaveTerrain } from '../../src/rendering/WaveTerrain';

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
  sinceSnare: 9,
  layers: 2,
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

  it('always keeps a second source across the ring, and turns it against the first in a double', () => {
    // User (15 aug): only one half of the ground was ever lit. There is now
    // always a lamp straight across the circle, so both halves have a source
    // and both travel; DOUBLE is still the one that counter-rotates.
    const groove = run({ ...quiet, section: 'groove' }, 1);
    const opposite = Math.abs(
      Math.atan2(
        Math.sin(groove.counterBearing! - groove.bearing - Math.PI),
        Math.cos(groove.counterBearing! - groove.bearing - Math.PI),
      ),
    );
    expect(opposite).toBeLessThan(1e-9);
    const deep = run({ ...quiet, section: 'deep' }, 1);
    expect(deep.counterBearing).not.toBeNull();
    expect(deep.counterBearing).not.toBeCloseTo(groove.counterBearing!, 6);
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

  it('§175 becomes one circle over every ring at five layers', () => {
    // Below five, the world's own formation holds.
    expect(run({ ...quiet, genre: 'techno', layers: 4 }, 1).formation).toBe('quarters');
    // At five, the rig drops every trick and simply turns — and it does so
    // even where a section would otherwise take the formation over.
    expect(run({ ...quiet, genre: 'techno', layers: 5 }, 1).formation).toBe('orbit');
    expect(run({ ...quiet, genre: 'techno', layers: 7, section: 'drop' }, 1).formation).toBe('orbit');
    expect(run({ ...quiet, genre: 'void-crusher', layers: 6 }, 1).formation).toBe('orbit');
    // And it keeps the speed the rules give it: a drop still turns faster than
    // a groove, arrived or not.
    const groove = run({ ...quiet, layers: 6, section: 'groove' }, 1).rawBearing;
    const drop = run({ ...quiet, layers: 6, section: 'drop' }, 1).rawBearing;
    expect(drop).toBeGreaterThan(groove);
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

/**
 * §156: the beam DISPLACES the terrain in the shader, which makes it part of
 * the surface — and §35 says the surface the player sees and the surface the
 * player hits are one thing. For two commits it was not: the GPU lifted the
 * ground and the collision knew nothing about it.
 */
describe('§156 the beam is part of the ground it presses on', () => {
  it('lifts the collision surface exactly where it lights it', () => {
    const terrain = new WaveTerrain('beam-lift');
    const scanner = {
      ...SCANNER_START,
      bearing: 0,
      width: 0.35,
      tail: 0.6,
      intensity: 1,
      elevation: 0.5,
    };
    const player = { x: 0, z: 0 };
    // Straight ahead of the beam, at the radius its band is pointing at.
    const peak = 260 + (55 - 260) * scanner.elevation;
    const before = terrain.groundHeightAt(peak, 0);
    terrain.setScanner(scanner, player);
    const after = terrain.groundHeightAt(peak, 0);
    expect(after - before).toBeCloseTo(beamLiftAt(scanner, 0, 0, peak, 0) * 0.8, 5);
    expect(after).toBeGreaterThan(before);
    terrain.dispose();
  });

  it('leaves the ground alone where the beam is not', () => {
    const terrain = new WaveTerrain('beam-lift');
    const scanner = { ...SCANNER_START, bearing: 0, width: 0.3, tail: 0.5, intensity: 1 };
    const behind = terrain.groundHeightAt(-200, 0);
    terrain.setScanner(scanner, { x: 0, z: 0 });
    // Ahead of the band, in the dark, nothing has been measured yet.
    expect(terrain.groundHeightAt(-200, 0)).toBeCloseTo(behind, 6);
    terrain.dispose();
  });
});

/**
 * §180 (user: "wissel ook met de rechterhelft, en licht gaat van links naar
 * rechts in cirkelvorm"). The accent has to keep moving side to side even in a
 * world that has not earned a snare yet, and one hit must move it exactly once.
 */
describe('the accent walks from side to side', () => {
  const hit = (state: typeof SCANNER_START, input: ScannerInput, frames: number) => {
    let next = state;
    for (let i = 0; i < frames; i++) next = advanceScanner(next, input, 1 / 60);
    return next;
  };

  it('moves once per hit, not once per frame', () => {
    // "sinceSnare < 0.05" is true for three frames at 60 fps. The old code
    // toggled on each of them, so where the accent landed depended on the
    // frame rate — at 120 fps it would have ended on the other side.
    const quietState = hit(SCANNER_START, quiet, 60);
    const struck = hit(quietState, { ...quiet, sinceSnare: 0 }, 6);
    expect(struck.flip).toBe(1 - quietState.flip);
    const held = hit(struck, { ...quiet, sinceSnare: 0 }, 20);
    expect(held.flip).toBe(struck.flip);
  });

  it('re-arms in the silence between hits, so the next hit moves it back', () => {
    let state = hit(SCANNER_START, quiet, 60);
    const first = state.flip;
    state = hit(state, { ...quiet, sinceSnare: 0 }, 4);
    state = hit(state, quiet, 30);
    state = hit(state, { ...quiet, sinceSnare: 0 }, 4);
    expect(state.flip).toBe(first);
  });

  it('lets the kick carry the accent while a world has no snare yet', () => {
    // The snare is the last drum a world earns; until then this never fired and
    // the light sat on one side for the whole opening.
    const noSnare: ScannerInput = { ...quiet, sinceSnare: 30, sinceKick: 0 };
    const before = hit(SCANNER_START, quiet, 60);
    const after = hit(before, noSnare, 4);
    expect(after.flip).toBe(1 - before.flip);
  });

  it('leaves the kick alone once a snare is actually keeping time', () => {
    // Otherwise both drums fight over the same switch and it stutters.
    const withSnare: ScannerInput = { ...quiet, sinceSnare: 0.6, sinceKick: 0 };
    const before = hit(SCANNER_START, quiet, 60);
    expect(hit(before, withSnare, 6).flip).toBe(before.flip);
  });
});
