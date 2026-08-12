import { buildLayerGraph } from '../../src/audio/MusicalPrimitives';
import { createInitialMusicState } from '../../src/music/MusicState';
import { LEVEL_DEEP, createInitialTrackState } from '../../src/music/TrackState';
import { describe, expect, it } from 'vitest';
import { type Section, ArrangementEngine, sectionMix } from '../../src/music/ArrangementEngine';
import { dominantZone, zoneAffinity } from '../../src/genres/GenreZones';
import { HarmonyEngine, ratioToSemitones } from '../../src/music/HarmonyEngine';
import { MelodyTracker, snapToScale } from '../../src/music/MelodyTracker';
import type { ResonanceEvent } from '../../src/resonance/ResonanceEvent';

describe('GenreZones — every direction is a genre (§29.5)', () => {
  it('keeps the void around spawn genre-less', () => {
    const near = zoneAffinity({ x: 5, y: 10, z: -5 });
    expect(Math.max(...Object.values(near))).toBeLessThan(0.05);
  });

  it('§57 maps each of the TEN points to its own grammar', () => {
    const step = (Math.PI * 2) / 10;
    const out = { x: 0, y: 10, z: -200 }; // far enough out for full influence
    const at = (index: number) => dominantZone(zoneAffinity(out, step * index));
    expect(at(0)).toBe('techno');
    expect(at(1)).toBe('garage');
    expect(at(2)).toBe('jazz');
    expect(at(3)).toBe('house');
    expect(at(4)).toBe('experimental');
    expect(at(5)).toBe('ambient');
    expect(at(6)).toBe('breakbeat');
    expect(at(7)).toBe('bass');
    expect(at(8)).toBe('dub');
    expect(at(9)).toBe('trap');
  });

  it('blends neighbouring directions into a hybrid, and ignores the far side', () => {
    const step = (Math.PI * 2) / 10;
    const between = zoneAffinity({ x: 0, y: 10, z: -200 }, step * 0.5);
    // Half way between two worlds you hear both of them.
    expect(between.techno).toBeGreaterThan(0.4);
    expect(between.garage).toBeGreaterThan(0.4);
    // The far side of the compass has no say here.
    expect(between.ambient).toBe(0);
    expect(between.breakbeat).toBe(0);
  });

  it('§57 altitude is expression, never a place', () => {
    // Climbing builds the track and lifts the pitch — it must not move you to
    // another world, or you could never climb for a build where you are.
    const high = zoneAffinity({ x: 0, y: 68, z: -200 });
    const low = zoneAffinity({ x: 0, y: -3, z: -200 });
    expect(dominantZone(high)).toBe('techno');
    expect(dominantZone(low)).toBe('techno');
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
    // §58: the form comes from how hard you fly and how long you keep it up.
    expect(engine.tick(0, 0, 0.5)).toBe('intro');
    let t = 100;
    const run = (energy: number, ms: number) => {
      const end = t + ms;
      let section = engine.current;
      for (; t <= end; t += 500) section = engine.tick(t, 500, energy);
      return section;
    };
    expect(run(0.5, 9000)).toBe('groove');
    expect(run(0.9, 14_000)).toBe('build');
    expect(run(0.9, 9000)).toBe('drop');
    expect(run(0.05, 9000)).toBe('break');
    // §76: the break takes the drums OUT rather than turning them down, and
    // keeps everything the player built on top of them.
    expect(sectionMix('break').drums).toBe(0);
    expect(sectionMix('break').bass).toBe(0);
    expect(sectionMix('break').harmony).toBe(1);
    expect(sectionMix('break').texture).toBeGreaterThan(0.5);
  });
});

describe('§53 turning towards a world takes you there', () => {
  const step = (Math.PI * 2) / 10;

  it('flying north-west out of the techno region arrives in trap', () => {
    const outNorth = { x: 0, y: 10, z: -90 };
    expect(dominantZone(zoneAffinity(outNorth, 0))).toBe('techno');
    expect(dominantZone(zoneAffinity(outNorth, -step))).toBe('trap');
  });

  it('and standing still still reads the way the orb is pointing', () => {
    expect(dominantZone(zoneAffinity({ x: 110, y: 0, z: 110 }, step * 3))).toBe('house');
  });
});

describe('§60 the sections can be told apart by ear', () => {
  it('a build takes the floor away and the drop slams it back', () => {
    const build = sectionMix('build');
    const drop = sectionMix('drop');
    const groove = sectionMix('groove');
    // The bass is what makes a drop a drop: nearly gone, then full.
    expect(build.bass).toBeLessThan(0.4);
    expect(drop.bass).toBe(1);
    expect(drop.bass - build.bass).toBeGreaterThan(0.6);
    // And neither of them is the groove: it sits below both, as the baseline.
    expect(groove.drums).toBeLessThan(drop.drums);
    expect(groove.texture).toBeLessThan(build.texture);
  });

  it('a break steps the bottom aside without going silent (§32)', () => {
    const brk = sectionMix('break');
    expect(brk.drums).toBeLessThan(sectionMix('groove').drums);
    expect(brk.harmony).toBeGreaterThan(0.8);
  });
});

describe('§64 a drop has to have something to drop', () => {
  function push(engine: ArrangementEngine, ms: number, ready: boolean, from = 0) {
    let section = engine.current;
    for (let t = from; t <= from + ms; t += 250) section = engine.tick(t, 250, 0.9, ready);
    return section;
  }

  it('never builds while the track has no floor yet', () => {
    const engine = new ArrangementEngine();
    // Full energy for a minute and a half: it grooves, and that is correct —
    // a build takes the bass away, and there is no bass.
    expect(push(engine, 90_000, false)).toBe('groove');
  });

  it('and builds — then drops — the moment the track is ready', () => {
    const engine = new ArrangementEngine();
    push(engine, 20_000, false);
    expect(push(engine, 1000, true, 20_250)).toBe('build');
    expect(push(engine, 12_000, true, 21_500)).toBe('drop');
  });
});

describe('§76 sections build themselves by adding and removing parts', () => {
  const deep = { unlocked: true, level: LEVEL_DEEP };
  const full = (form: Section) => ({
    ...createInitialTrackState(),
    genre: 'techno' as const,
    form,
    bpm: 132,
    drums: { kick: deep, snare: deep, hats: deep },
    bass: deep,
    harmony: deep,
    melody: deep,
    texture: deep,
    rootMidi: 45,
    harmonyIntervals: [0, 3, 7],
    melodyNotes: [69, 72, 76],
  });
  const music = { ...createInitialMusicState(), bpm: 132, tempoConfidence: 0.6, rhythmDensity: 1 };
  const partsIn = (form: Section) => {
    const graph = buildLayerGraph(music, undefined, [], full(form));
    return Object.fromEntries(
      (['drums', 'bass', 'harmony', 'melody', 'texture'] as const).map((layer) => [
        layer,
        graph.layers[layer].primitives.length > 0,
      ]),
    );
  };

  it('an intro is a kick and the air around it — the bass has not arrived', () => {
    const intro = partsIn('intro');
    expect(intro.drums).toBe(true);
    expect(intro.bass).toBe(false);
    expect(intro.melody).toBe(false);
  });

  it('a build takes the floor OUT, and the drop puts it back', () => {
    expect(partsIn('build').bass).toBe(false);
    expect(partsIn('drop').bass).toBe(true);
    expect(partsIn('drop').drums).toBe(true);
  });

  it('a break drops the drums and the bass and keeps what was built on top', () => {
    const brk = partsIn('break');
    expect(brk.drums).toBe(false);
    expect(brk.bass).toBe(false);
    expect(brk.harmony).toBe(true);
    expect(brk.melody).toBe(true);
  });

  it('and the groove has everything the player earned', () => {
    const groove = partsIn('groove');
    expect(Object.values(groove).every(Boolean)).toBe(true);
  });
});
