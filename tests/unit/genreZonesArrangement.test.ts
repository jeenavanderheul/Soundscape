import { buildLayerGraph } from '../../src/audio/MusicalPrimitives';
import { createInitialMusicState } from '../../src/music/MusicState';
import { LEVEL_DEEP, createInitialTrackState } from '../../src/music/TrackState';
import { describe, expect, it } from 'vitest';
import { type Section, ArrangementEngine, sectionLabel, sectionMix } from '../../src/music/ArrangementEngine';
import { dominantZone, zoneAffinity } from '../../src/genres/GenreZones';
import { HarmonyEngine, ratioToSemitones } from '../../src/music/HarmonyEngine';
import { MelodyTracker, snapToScale } from '../../src/music/MelodyTracker';
import type { ResonanceEvent } from '../../src/resonance/ResonanceEvent';

describe('GenreZones — every direction is a genre (§29.5)', () => {
  it('keeps the void around spawn genre-less', () => {
    const near = zoneAffinity({ x: 5, y: 10, z: -5 });
    expect(Math.max(...Object.values(near))).toBeLessThan(0.05);
  });

  it('maps the ten readable points onto the two active world halves', () => {
    const step = (Math.PI * 2) / 10;
    const out = { x: 0, y: 10, z: -200 }; // far enough out for full influence
    const at = (index: number) => dominantZone(zoneAffinity(out, step * index));
    expect(at(0)).toBe('techno');
    expect(at(1)).toBe('techno');
    expect(at(2)).toBe('techno');
    expect(at(3)).toBe('sub-pressure');
    expect(at(4)).toBe('sub-pressure');
    expect(at(5)).toBe('sub-pressure');
    expect(at(6)).toBe('sub-pressure');
    expect(at(7)).toBe('sub-pressure');
    expect(at(8)).toBe('techno');
    expect(at(9)).toBe('techno');
  });

  it('blends neighbouring directions into a hybrid, and ignores the far side', () => {
    const between = zoneAffinity({ x: 0, y: 10, z: -200 }, Math.PI / 2);
    expect(between.techno).toBeGreaterThan(0.4);
    expect(between['sub-pressure']).toBeGreaterThan(0.4);
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

describe('§84 the FLIGHT ARC — thirty-two cycles that are the flight', () => {
  const BAR = 1800;
  /** Fly `cycles` bars into the arc and report where that lands. */
  function flyTo(cycles: number, engine = new ArrangementEngine(), ready = true) {
    engine.tick(0, 0, 0.5, ready, BAR);
    for (let c = 0; c < cycles; c += 1) engine.tick(0, BAR, 0.5, ready, BAR);
    return engine;
  }

  it('walks the eight phases in order, four cycles each', () => {
    const expected = [
      [0, 'intro'], [3, 'intro'],
      [4, 'groove'], [7, 'groove'],
      [8, 'discovery'], [11, 'discovery'],
      [12, 'build'], [15, 'build'],
      [16, 'drop'], [19, 'drop'],
      [20, 'deep'], [23, 'deep'],
      [24, 'break'], [27, 'break'],
      [28, 'return'], [31, 'return'],
    ] as const;
    for (const [cycle, phase] of expected) {
      expect(`${cycle}:${flyTo(cycle).current}`).toBe(`${cycle}:${phase}`);
    }
  });

  it('is the same shape every time — energy no longer rewrites the form', () => {
    const pushing = new ArrangementEngine();
    const floating = new ArrangementEngine();
    pushing.tick(0, 0, 1, true, BAR);
    floating.tick(0, 0, 0, true, BAR);
    for (let c = 0; c < 18; c += 1) {
      pushing.tick(0, BAR, 1, true, BAR);
      floating.tick(0, BAR, 0, true, BAR);
    }
    expect(pushing.current).toBe('drop');
    expect(floating.current).toBe(pushing.current);
  });

  it('§46 speed decides how fast you fly through it, not what it is', () => {
    const slow = new ArrangementEngine();
    const fast = new ArrangementEngine();
    slow.tick(0, 0, 0.5, true, BAR);
    fast.tick(0, 0, 0.5, true, BAR);
    // The same real time, but one flight is paced twice as hard.
    for (let i = 0; i < 12; i += 1) {
      slow.tick(0, BAR, 0.5, true, BAR);
      fast.tick(0, BAR * 2, 0.5, true, BAR);
    }
    // Same wall-clock, twice the flight: one is still under pressure while the
    // other is already through the void.
    expect(slow.cycle).toBe(12);
    expect(slow.current).toBe('build');
    expect(fast.cycle).toBe(24);
    expect(fast.current).toBe('break');
  });

  it('§64 holds at the end of PRESSURE until there is a floor to drop', () => {
    const engine = flyTo(24, new ArrangementEngine(), false);
    expect(engine.current).toBe('build');
    // Give it a floor and the very next cycle pays off.
    engine.tick(0, BAR, 0.5, true, BAR);
    expect(engine.current).toBe('drop');
  });

  it('throws the riser on the cycle BEFORE a drop lands, twice a lap', () => {
    const engine = new ArrangementEngine();
    engine.tick(0, 0, 0.5, true, BAR);
    const risers: number[] = [];
    for (let c = 0; c < 32; c += 1) {
      engine.tick(0, BAR, 0.5, true, BAR);
      if (engine.takeRiser()) risers.push(engine.cycle);
    }
    expect(risers).toEqual([15, 27]);
  });

  it('a second lap starts at DISCOVERY I — the biome is already entered', () => {
    const engine = flyTo(32);
    expect(engine.current).toBe('groove');
    expect(engine.cycle).toBe(4);
  });

  it('§95 VOID steps back without stopping — the track keeps running', () => {
    const brk = sectionMix('break');
    const deep = sectionMix('deep');
    // The bottom thins right out…
    expect(brk.drums).toBeLessThan(deep.drums / 2);
    expect(brk.bass).toBeLessThan(deep.bass / 2);
    // …but nothing you earned ever goes silent. Zeroing these took ten voices
    // down to five right after the last rung landed, so the moment a player
    // finally had a whole track was the moment it fell apart.
    expect(brk.drums).toBeGreaterThan(0);
    expect(brk.bass).toBeGreaterThan(0);
    // And the top opens all the way up, which is what makes it a breath.
    expect(brk.harmony).toBe(1);
    expect(brk.texture).toBeGreaterThan(0.5);
    expect(brk.atmosphere).toBe(1);
  });

  it('DROP II is the loudest the track ever gets', () => {
    const drop2 = sectionMix('return');
    const drop1 = sectionMix('drop');
    const total = (m: typeof drop1) => m.drums + m.bass + m.harmony + m.melody + m.texture;
    expect(total(drop2)).toBeGreaterThan(total(drop1));
  });

  it('§61 a world may fly its own order — ambient voids before it peaks', () => {
    const swell = new ArrangementEngine();
    swell.setStyle('swell');
    swell.tick(0, 0, 0.5, true, BAR);
    for (let c = 0; c < 12; c += 1) swell.tick(0, BAR, 0.5, true, BAR);
    expect(swell.current).toBe('break');
  });

  it('the word on screen is the phase you are in', () => {
    expect(sectionLabel('intro')).toBe('ENTER BIOME');
    expect(sectionLabel('groove')).toBe('DISCOVERY I');
    expect(sectionLabel('discovery')).toBe('DISCOVERY II');
    expect(sectionLabel('build')).toBe('PRESSURE');
    expect(sectionLabel('drop')).toBe('DROP I');
    expect(sectionLabel('deep')).toBe('DEEP FLIGHT');
    expect(sectionLabel('break')).toBe('VOID');
    expect(sectionLabel('return')).toBe('DROP II');
  });
});

describe('§53 turning towards a world takes you there', () => {
  const step = (Math.PI * 2) / 10;

  it('keeps north-west in Techno and reaches SUB PRESSURE by turning south', () => {
    const outNorth = { x: 0, y: 10, z: -90 };
    expect(dominantZone(zoneAffinity(outNorth, 0))).toBe('techno');
    expect(dominantZone(zoneAffinity(outNorth, -step))).toBe('techno');
    expect(dominantZone(zoneAffinity(outNorth, Math.PI))).toBe('sub-pressure');
  });

  it('and standing still still reads the way the orb is pointing', () => {
    expect(dominantZone(zoneAffinity({ x: 110, y: 0, z: 110 }, step * 3))).toBe('sub-pressure');
  });
});

describe('§60 the sections can be told apart by ear', () => {
  it('§92 the phases build UP: nothing is taken away before the void', () => {
    const enter = sectionMix('intro');
    const groove = sectionMix('groove');
    const build = sectionMix('build');
    const drop = sectionMix('drop');
    // PRESSURE is where the sub ARRIVES, so it is already at full there — it
    // used to be removed here and handed back two phases later, which is what
    // made a build-up sound like parts coming and going at random.
    expect(build.bass).toBe(1);
    expect(drop.bass).toBe(1);
    // Every phase from DISCOVERY I on keeps what the one before it had.
    for (const layer of ['drums', 'bass'] as const) {
      expect(groove[layer]).toBeGreaterThan(enter[layer]);
      expect(build[layer]).toBeGreaterThanOrEqual(groove[layer]);
      expect(drop[layer]).toBeGreaterThanOrEqual(build[layer]);
    }
    // And the groove still reads as the baseline it all measures against.
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

  it('never reaches the peak while the track has no floor yet', () => {
    const engine = new ArrangementEngine();
    // Full energy for a minute and a half: it discovers, and that is correct —
    // the peak takes the bass away, and there is no bass.
    expect(push(engine, 90_000, false)).toBe('build');
  });

  it('and pays off the moment the track is ready', () => {
    const engine = new ArrangementEngine();
    push(engine, 90_000, false);
    expect(push(engine, 2000, true)).toBe('drop');
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

  it('§100 ENTER BIOME is the air AND the first rhythmic element', () => {
    const intro = partsIn('intro');
    // A beat from the first bar: four cycles of air is 7.2s of musical time,
    // which at cruise is twenty seconds before a player hears any rhythm.
    expect(intro.drums).toBe(true);
    // …but only the beat. Everything else still arrives in its own phase.
    expect(intro.bass).toBe(false);
    expect(intro.melody).toBe(false);
    expect(sectionMix('intro').drums).toBeLessThan(sectionMix('drop').drums);
  });

  it('§92 PRESSURE brings the sub IN — nothing is taken away before the void', () => {
    expect(partsIn('build').bass).toBe(true);
    expect(partsIn('drop').bass).toBe(true);
    expect(partsIn('drop').drums).toBe(true);
  });

  it('§95 the void keeps every part the flight earned — it only thins them', () => {
    const brk = partsIn('break');
    expect(Object.values(brk).every(Boolean)).toBe(true);
  });

  it('and the groove has everything the player earned', () => {
    const groove = partsIn('groove');
    expect(Object.values(groove).every(Boolean)).toBe(true);
  });
});
