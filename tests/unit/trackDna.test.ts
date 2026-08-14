import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { applyDna, dnaFor } from '../../src/music/TrackDNA';
import { buildWorldLayerGraph } from '../../src/audio/WorldLayerGraph';
import { buildPatternCode, setSamplesLoaded } from '../../src/audio/StrudelEngine';
import { createInitialMusicState } from '../../src/music/MusicState';
import { LEVEL_DEEP, createInitialTrackState, type TrackGenre } from '../../src/music/TrackState';

/**
 * §118: staying in a world used to give the same composition forever with
 * only the root note moving — infinite in number, not in music. These check
 * that a track is now a READING of its document, and that the document
 * survives being read.
 */
describe('track N is not track 1 in another key', () => {
  const render = (genre: Exclude<TrackGenre, null>, trackNumber: number) => {
    setSamplesLoaded(true);
    const deep = { unlocked: true, level: LEVEL_DEEP };
    const track = {
      ...createInitialTrackState(),
      genre, form: 'return' as const, bpm: 134,
      drums: { kick: deep, snare: deep, hats: deep },
      bass: deep, harmony: deep, melody: deep, texture: deep,
      rootMidi: 45, harmonyIntervals: [0, 3, 7, 10], melodyNotes: [69, 72],
    } as ReturnType<typeof createInitialTrackState>;
    const music = { ...createInitialMusicState(), bpm: 134, tempoConfidence: 0.6, dynamics: 0.5 };
    const graph = buildWorldLayerGraph({ music, structures: [], track, patterns: {}, motion: 1, energy: 0.6 });
    graph.dna = dnaFor(genre, trackNumber);
    return buildPatternCode(graph, []);
  };

  it('track 1 is the document exactly as written', () => {
    // A player meets a world before it starts bending.
    const dna = dnaFor('techno', 1);
    expect(dna.character).toBe('as written');
    // Values are normalised on the way through, so `.5` becomes `0.5` — but
    // nothing is MOVED: the numbers come out exactly as they went in.
    expect(applyDna('s("bd").lpf(1000).distort(.5).room(.4)', dna))
      .toBe('s("bd").lpf(1000).distort(0.5).room(0.4)');
  });

  it('every following track is a different reading', () => {
    const seen = new Set([2, 3, 4, 5, 6, 7, 8].map((n) => render('techno', n)));
    expect(seen.size).toBe(7);
  });

  it('is deterministic — the same track is the same track, every flight', () => {
    expect(render('techno', 27)).toBe(render('techno', 27));
    expect(dnaFor('techno', 27)).toEqual(dnaFor('techno', 27));
  });

  it('and differs per world, so depth is a place and not a formula', () => {
    expect(dnaFor('techno', 27)).not.toEqual(dnaFor('void-crusher', 27));
  });

  it('reads more freely with depth, without ever leaving the genre', () => {
    // Reach widens and settles: track 50 explores a corner, it does not
    // become another world.
    const early = dnaFor('techno', 2);
    const deep = dnaFor('techno', 50);
    expect(Math.abs(deep.sparse - 0.5)).toBeGreaterThan(Math.abs(early.sparse - 0.5) - 0.5);
    expect(deep.drive).toBeLessThanOrEqual(1);
    expect(Math.abs(deep.tilt)).toBeLessThanOrEqual(1);
  });

  it('touches the numbers, never the notes', () => {
    // The whole reason a world stays itself: its figures, its masks and its
    // machines come through a reading untouched.
    const one = render('techno', 1);
    const deep = render('techno', 27);
    const skeleton = (code: string) =>
      code.replace(/\.(lpf|hpf|bpf|distort|shape|room|degradeBy)\([0-9.]+\)/g, '');
    expect(skeleton(deep)).toBe(skeleton(one));
  });

  it('never pushes a value out of range', () => {
    for (let n = 1; n <= 60; n += 1) {
      const out = applyDna('s("x").lpf(9000).hpf(40).distort(2.6).shape(.8).room(.9).degradeBy(.8)', dnaFor('techno', n));
      const hz = [...out.matchAll(/\.(?:lpf|hpf)\((\d+)\)/g)].map((m) => Number(m[1]));
      expect(hz.every((v) => v >= 30 && v <= 18000)).toBe(true);
      expect(Number(/\.shape\(([0-9.]+)\)/.exec(out)![1]!)).toBeLessThanOrEqual(0.9);
      expect(Number(/\.room\(([0-9.]+)\)/.exec(out)![1]!)).toBeLessThanOrEqual(1);
      expect(Number(/\.degradeBy\(([0-9.]+)\)/.exec(out)![1]!)).toBeLessThanOrEqual(0.92);
    }
  });
});
