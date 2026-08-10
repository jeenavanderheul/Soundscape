import { describe, expect, it } from 'vitest';
import { ArrangementEngine, sectionMix } from '../../src/music/ArrangementEngine';
import { dominantZone, zoneAffinity } from '../../src/genres/GenreZones';
import { HarmonyEngine, ratioToSemitones } from '../../src/music/HarmonyEngine';
import { MelodyTracker, snapToScale } from '../../src/music/MelodyTracker';
import type { ResonanceEvent } from '../../src/resonance/ResonanceEvent';

describe('GenreZones — every direction is a genre (§29.5)', () => {
  it('keeps the void around spawn genre-less', () => {
    // Altitude is its own axis (§34), so the compass void is measured at
    // cruising height — down on the floor the echo chamber is supposed to pull.
    const near = zoneAffinity({ x: 5, y: 10, z: -5 });
    expect(Math.max(...Object.values(near))).toBeLessThan(0.05);
  });

  it('maps each of the eight points to its own grammar (§34)', () => {
    expect(dominantZone(zoneAffinity({ x: 0, y: 0, z: -200 }))).toBe('techno');
    expect(dominantZone(zoneAffinity({ x: 200, y: 0, z: 0 }))).toBe('jazz');
    expect(dominantZone(zoneAffinity({ x: 0, y: 0, z: 200 }))).toBe('ambient');
    expect(dominantZone(zoneAffinity({ x: -200, y: 0, z: 0 }))).toBe('dnb');
    expect(dominantZone(zoneAffinity({ x: 140, y: 0, z: -140 }))).toBe('garage');
    expect(dominantZone(zoneAffinity({ x: 140, y: 0, z: 140 }))).toBe('house');
    expect(dominantZone(zoneAffinity({ x: -140, y: 0, z: 140 }))).toBe('classical');
    expect(dominantZone(zoneAffinity({ x: -140, y: 0, z: -140 }))).toBe('trap');
  });

  it('blends neighbouring directions into a hybrid, and ignores the far side', () => {
    const northEast = zoneAffinity({ x: 140, y: 0, z: -140 });
    // The point itself leads, but both neighbours still sound underneath it.
    expect(northEast.garage).toBeGreaterThan(0.9);
    expect(northEast.techno).toBeGreaterThan(0.2);
    expect(northEast.jazz).toBeGreaterThan(0.2);
    // The opposite side of the world has no say here.
    expect(northEast.ambient).toBe(0);
    expect(northEast.classical).toBe(0);
  });

  it('turns skimming the floor into dub — the echo chamber (§34)', () => {
    // Cruising height is clean; hugging the ground fills with echo.
    expect(zoneAffinity({ x: 0, y: 10, z: 0 }).dub).toBe(0);
    expect(zoneAffinity({ x: 0, y: -3, z: 0 }).dub).toBe(1);
    // Cruising just above the floor is still clean: dub needs a real dive.
    expect(zoneAffinity({ x: 0, y: 0, z: 0 }).dub).toBe(0);
    expect(zoneAffinity({ x: 0, y: -2, z: 0 }).dub).toBeGreaterThan(0.4);
  });

  it('turns altitude into experimental', () => {
    expect(zoneAffinity({ x: 0, y: 0, z: 0 }).experimental).toBe(0);
    expect(zoneAffinity({ x: 0, y: 70, z: 0 }).experimental).toBe(1);
  });
});

describe('HarmonyEngine (§29.2 fase 4)', () => {
  const event = (ratio: number, atMs: number): ResonanceEvent =>
    ({ ratio, atMs, consonance: 0.9 }) as ResonanceEvent;

  it('snaps ratios to simple intervals', () => {
    expect(ratioToSemitones(1.5)).toBe(7); // perfect fifth
    expect(ratioToSemitones(1.25)).toBe(4); // major third
    expect(ratioToSemitones(3)).toBe(7); // octave-reduced fifth
  });

  it('builds a chord from combined resonances and forgets stale ones', () => {
    const harmony = new HarmonyEngine();
    expect(harmony.discovered).toBe(false);
    harmony.onResonance(event(1.5, 0));
    harmony.onResonance(event(1.25, 100));
    expect(harmony.discovered).toBe(true);
    expect(harmony.chordIntervals()).toEqual([0, 4, 7]);
    harmony.tick(120_000);
    expect(harmony.discovered).toBe(false);
  });
});

describe('MelodyTracker (§29.2 fase 5)', () => {
  it('samples at the control rate and only fires after real pitch travel', () => {
    const melody = new MelodyTracker();
    for (let t = 0; t < 2000; t += 100) melody.tick(t, 220);
    expect(melody.discovered).toBe(false);
    for (let t = 2000; t < 5000; t += 300) melody.tick(t, 220 * 2 ** ((t - 2000) / 4000));
    expect(melody.discovered).toBe(true);
    const phrase = melody.phrase(45);
    expect(phrase).toHaveLength(4);
    // Every note lands on the pentatonic scale, so any flight path is musical.
    for (const note of phrase) {
      expect(snapToScale(note, 45)).toBe(note);
    }
  });
});

describe('ArrangementEngine (§29.7 movement becomes arrangement)', () => {
  it('walks intro → groove → build → drop and breaks down when the player floats', () => {
    const engine = new ArrangementEngine();
    // §47: the form is the flight's, so it starts the moment the flight does.
    expect(engine.tick(0, 0, 0.5, 0)).toBe('intro');
    let t = 100;
    const run = (energy: number, ms: number, climb = 0) => {
      const end = t + ms;
      let section = engine.current;
      for (; t <= end; t += 500) section = engine.tick(t, 500, energy, climb);
      return section;
    };
    expect(run(0.5, 9000)).toBe('groove');
    // Only flying builds and drops now: climb into it, dive out of it.
    expect(run(0.9, 3000, 6)).toBe('build');
    expect(run(0.9, 500, -6)).toBe('drop');
    expect(run(0.05, 9000)).toBe('break');
    // The break steps the kick aside without going silent (§32): the
    // percussion and the top end still carry it.
    // The break keeps what the player built harmonically, and drops the kick.
    expect(sectionMix('break').drums).toBeLessThan(sectionMix('drop').drums);
    expect(sectionMix('break').drums).toBeGreaterThan(0.4);
    expect(sectionMix('break').harmony).toBe(1);
  });
});

describe('height is the arrangement (user decision)', () => {
  const engine = () => new ArrangementEngine();

  /** Run the engine for `ms` at a fixed energy and climb rate. */
  function run(e: ArrangementEngine, ms: number, energy: number, climb: number, fromMs = 0) {
    let section = e.current;
    for (let t = fromMs; t <= fromMs + ms; t += 250) section = e.tick(t, 250, energy, climb);
    return section;
  }

  it('climbing builds the track and diving out of the build is the drop', () => {
    const e = engine();
    run(e, 9000, 0.4, 0); // settle into a groove
    expect(run(e, 3000, 0.4, 6, 9250)).toBe('build');
    expect(run(e, 500, 0.4, -6, 12_500)).toBe('drop');
  });

  it('a drop has to be earned: diving without a build does not drop', () => {
    const e = engine();
    run(e, 9000, 0.4, 0);
    expect(run(e, 4000, 0.4, -6, 9250)).not.toBe('drop');
  });

  it('and it cannot be repeated straight away', () => {
    const e = engine();
    run(e, 9000, 0.4, 0);
    run(e, 3000, 0.4, 6, 9250);
    run(e, 500, 0.4, -6, 12_500);
    // Climbing again immediately after the drop must not build another one.
    expect(run(e, 4000, 0.4, 6, 13_500)).not.toBe('build');
  });
});

describe('§47 only the flight builds and drops', () => {
  function run(e: ArrangementEngine, ms: number, energy: number, climb: number, from = 0) {
    let section = e.current;
    for (let t = from; t <= from + ms; t += 250) section = e.tick(t, 250, energy, climb);
    return section;
  }

  it('flying flat out for a long time never hands you a build', () => {
    const engine = new ArrangementEngine();
    // Maximum energy, no climbing at all: it grooves, and that is all.
    expect(run(engine, 60_000, 1, 0)).toBe('groove');
  });

  it('a dive still counts after the ground field has damped it (§35)', () => {
    const engine = new ArrangementEngine();
    run(engine, 9000, 0.5, 0);
    expect(run(engine, 3000, 0.5, 6, 9250)).toBe('build');
    // One frame of real descent, then the field flattens it out: still a drop.
    engine.tick(12_500, 250, 0.5, -7);
    expect(engine.tick(12_750, 250, 0.5, -0.2)).toBe('drop');
  });

  it('floating breathes out and coming back in resumes the groove', () => {
    const engine = new ArrangementEngine();
    run(engine, 9000, 0.5, 0);
    expect(run(engine, 9000, 0.05, 0, 9250)).toBe('break');
    expect(run(engine, 9000, 0.6, 0, 18_500)).toBe('groove');
  });
});
