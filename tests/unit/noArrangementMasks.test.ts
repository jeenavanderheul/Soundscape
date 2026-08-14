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
 * §104: span alone cannot tell a figure from an arrangement — the machine-rise
 * is `<0!15 1 0!15 1>`, thirty-two cycles wide and yet one swell every sixteen
 * bars. What separates them is what the mask DOES:
 *
 *   an ARRANGEMENT gates the start and then leaves the part ON — a long run of
 *   leading zeros followed by mostly ones, which is a phase decision;
 *   a FIGURE is mostly OFF — the mask is the note itself.
 */
function arrangementMasks(code: string): string[] {
  return [...code.matchAll(/\.mask\("([^"]*)"\)/g)]
    .map((m) => m[1]!)
    .filter((pattern) => {
      const steps = pattern.replace(/[<>]/g, '').trim().split(/\s+/);
      let total = 0;
      let on = 0;
      let leadingZeros = 0;
      let stillLeading = true;
      for (const token of steps) {
        const run = Number(/!(\d+)/.exec(token)?.[1]) || 1;
        const isOn = token.startsWith('1');
        total += run;
        if (isOn) {
          on += run;
          stillLeading = false;
        } else if (stillLeading) {
          leadingZeros += run;
        }
      }
      return leadingZeros >= 4 && on / total >= 0.25;
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

  it('tells a figure from an arrangement by what the mask does, not its span', () => {
    // The machine-rise: thirty-two cycles wide, but on for two of them.
    expect(arrangementMasks('s("white").mask("<1 0!7>")')).toEqual([]);
    expect(arrangementMasks('s("x").mask("<0!15 1 0!15 1>")')).toEqual([]);
    // A part held silent for half the arc and then left on: an arrangement.
    expect(arrangementMasks('s("x").mask("<0!16 1!8 0!4 1!4>")')).toHaveLength(1);
    expect(arrangementMasks('s("x").mask("<0!4 1!20 0!4 1!4>")')).toHaveLength(1);
  });
});
