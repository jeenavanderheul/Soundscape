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
    expect(zoneAffinity({ x: 0, y: -1, z: 0 }).dub).toBeGreaterThan(0.4);
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
    expect(engine.tick(0, 0, 0.5, 0)).toBe('none');
    expect(engine.tick(100, 100, 0.5, 1)).toBe('intro');
    let t = 100;
    const run = (energy: number, ms: number) => {
      const end = t + ms;
      let section = engine.current;
      for (; t <= end; t += 500) section = engine.tick(t, 500, energy, 3);
      return section;
    };
    expect(run(0.5, 9000)).toBe('groove');
    expect(run(0.9, 14_000)).toBe('build');
    expect(run(0.9, 9000)).toBe('drop');
    expect(run(0.05, 9000)).toBe('break');
    // The break steps the kick aside without going silent (§32): the
    // percussion and the top end still carry it.
    // The break keeps what the player built harmonically, and drops the kick.
    expect(sectionMix('break').drums).toBeLessThan(sectionMix('drop').drums);
    expect(sectionMix('break').drums).toBeGreaterThan(0.4);
    expect(sectionMix('break').harmony).toBe(1);
  });
});
