import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { buildWorldLayerGraph } from '../../src/audio/WorldLayerGraph';
import { genreGrammar, regionBpm } from '../../src/audio/MusicalPrimitives';
import { buildPatternCode, setSamplesLoaded } from '../../src/audio/StrudelEngine';
import { ladderFor } from '../../src/music/GenreLadder';
import { rungsDueAt, type Section } from '../../src/music/ArrangementEngine';
import { createInitialMusicState } from '../../src/music/MusicState';
import { LEVEL_DEEP, createInitialTrackState } from '../../src/music/TrackState';

/**
 * §101: NO TEMPLATE MAY GATE ITSELF.
 *
 * The MACHINE PRESSURE presets arrange themselves with 32-cycle `mask()`
 * chains, and when those grammars were built from them the masks came along
 * into the templates. They then fought the arc: the kick was granted on
 * arrival but masked silent for four cycles, and the bass was earned at
 * PRESSURE but masked silent until DROP I — four cycles of nothing at exactly
 * the moment the player had just won something.
 *
 * Presence belongs to ONE system (§92). A `mask` spanning many cycles is an
 * arrangement, and an arrangement in a template is invisible to the engine
 * that is supposed to own it. Short masks are figures — a hit every eight
 * bars — and those are fine.
 */
const PHASES: Section[] = ['intro', 'groove', 'discovery', 'build', 'drop', 'deep', 'break', 'return'];
const WORLDS = ['techno', 'sub-pressure'] as const;

/**
 * A mask is a FIGURE if it repeats within a bar or two — one hit every eight,
 * say. It is an ARRANGEMENT once it spans the length of the arc, because then
 * it is deciding which PHASE a part belongs to, which is not its business.
 */
function arrangementMasks(code: string): string[] {
  return [...code.matchAll(/\.mask\("([^"]*)"\)/g)]
    .map((m) => m[1]!)
    .filter((pattern) => {
      const cycles = pattern
        .replace(/[<>]/g, '')
        .trim()
        .split(/\s+/)
        .reduce((total, token) => total + (Number(/!(\d+)/.exec(token)?.[1]) || 1), 0);
      return cycles >= 16;
    });
}

describe('presence is the arc’s job, never a template’s', () => {
  const deep = { unlocked: true, level: LEVEL_DEEP };

  for (const genre of WORLDS) {
    it(`${genre} renders no arrangement mask in any phase`, () => {
      setSamplesLoaded(true);
      const steps = ladderFor(genre);
      for (const form of PHASES) {
        let track = {
          ...createInitialTrackState(),
          genre, form,
          bpm: regionBpm(genreGrammar(genre)),
          rootMidi: 45, harmonyIntervals: [0, 3, 7, 10], melodyNotes: [69, 72, 76],
        } as ReturnType<typeof createInitialTrackState>;
        steps.slice(0, rungsDueAt(form, steps)).forEach(({ layer }) => {
          if (layer === 'kick' || layer === 'hats' || layer === 'snare') {
            track = { ...track, drums: { ...track.drums, [layer]: deep } };
          } else {
            track = { ...track, [layer]: deep };
          }
        });
        const music = { ...createInitialMusicState(), bpm: track.bpm, tempoConfidence: 0.6, dynamics: 0.5 };
        const graph = buildWorldLayerGraph({
          music, structures: [], track, patterns: {}, motion: 1, energy: 0.5,
        });
        const found = arrangementMasks(buildPatternCode(graph, []));
        expect(`${genre}/${form}: ${found.join(' | ')}`).toBe(`${genre}/${form}: `);
      }
    });
  }

  it('still allows a short mask, which is a figure and not an arrangement', () => {
    expect(arrangementMasks('s("white").mask("<1 0!7>")')).toEqual([]);
    expect(arrangementMasks('s("x").mask("<0!15 1 0!15 1>")')).toHaveLength(1);
    expect(arrangementMasks('s("x").mask("<0!16 1!8 0!4 1!4>")')).toHaveLength(1);
  });
});
