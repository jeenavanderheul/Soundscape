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
import { LEVEL_DEEP, createInitialTrackState, type TrackGenre } from '../../src/music/TrackState';

/**
 * §102 THE SHAPE OF A TRACK, GUARDED — for every world, not just the one
 * being worked on.
 *
 * Every complaint about the build-up so far has been the same shape: a step
 * that adds nothing, a step that takes something away, or a phase that is
 * silent. Each was found by rendering the pattern and counting, never by the
 * suite — so the counting is the suite now.
 */
const PHASES: Section[] = ['intro', 'groove', 'discovery', 'build', 'drop', 'deep', 'break', 'return'];
const WORLDS: Exclude<TrackGenre, null>[] = ['techno', 'sub-pressure'];

/** How many voices this world renders at that point in the arc. */
function voicesAt(genre: Exclude<TrackGenre, null>, form: Section): number {
  setSamplesLoaded(true);
  const steps = ladderFor(genre);
  let track = {
    ...createInitialTrackState(),
    genre, form,
    bpm: regionBpm(genreGrammar(genre)),
    rootMidi: 45, harmonyIntervals: [0, 3, 7, 10], melodyNotes: [69, 72, 76, 74],
  } as ReturnType<typeof createInitialTrackState>;
  for (const { layer } of steps.slice(0, rungsDueAt(form, steps))) {
    const state = { unlocked: true, level: LEVEL_DEEP };
    if (layer === 'kick' || layer === 'hats' || layer === 'snare') {
      track = { ...track, drums: { ...track.drums, [layer]: state } };
    } else {
      track = { ...track, [layer]: state };
    }
  }
  const music = { ...createInitialMusicState(), bpm: track.bpm, tempoConfidence: 0.6, dynamics: 0.5 };
  const graph = buildWorldLayerGraph({
    music, structures: [], track, patterns: {}, motion: 1, energy: 0.5,
  });
  return (buildPatternCode(graph, []).match(/^ {2}/gm) ?? []).length;
}

describe.each(WORLDS)('%s builds like one track', (genre) => {
  const counts = () => PHASES.map((form) => voicesAt(genre, form));

  it('is never silent — arriving somewhere always sounds like something', () => {
    for (const [i, n] of counts().entries()) {
      expect(`${PHASES[i]}: ${n}`).not.toBe(`${PHASES[i]}: 0`);
    }
  });

  it('never takes a step backwards', () => {
    const n = counts();
    for (let i = 1; i < n.length; i += 1) {
      expect(`${PHASES[i]}: ${n[i]!} vs ${n[i - 1]!}`).toBe(
        `${PHASES[i]}: ${Math.max(n[i]!, n[i - 1]!)} vs ${n[i - 1]!}`,
      );
    }
  });

  it('has no dead step: every phase but the void brings something new', () => {
    const n = counts();
    for (let i = 1; i < n.length; i += 1) {
      if (PHASES[i] === 'break') continue; // the void steps back on purpose
      expect(`${PHASES[i]}: +${n[i]! - n[i - 1]!}`).not.toBe(`${PHASES[i]}: +0`);
    }
  });

  it('opens on a beat and ends fuller than it started (§100)', () => {
    const n = counts();
    expect(n[0]!).toBeGreaterThan(0);
    expect(n[n.length - 1]!).toBeGreaterThan(n[0]! * 2);
  });

  it('never changes its own clock — no tempo transform anywhere (§91)', () => {
    for (const form of PHASES) {
      const steps = ladderFor(genre);
      let track = {
        ...createInitialTrackState(), genre, form,
        bpm: regionBpm(genreGrammar(genre)), rootMidi: 45,
        harmonyIntervals: [0, 3, 7, 10], melodyNotes: [69, 72, 76],
      } as ReturnType<typeof createInitialTrackState>;
      for (const { layer } of steps.slice(0, rungsDueAt(form, steps))) {
        const state = { unlocked: true, level: LEVEL_DEEP };
        if (layer === 'kick' || layer === 'hats' || layer === 'snare') {
          track = { ...track, drums: { ...track.drums, [layer]: state } };
        } else {
          track = { ...track, [layer]: state };
        }
      }
      const music = { ...createInitialMusicState(), bpm: track.bpm, tempoConfidence: 0.6, dynamics: 0.5 };
      const code = buildPatternCode(
        buildWorldLayerGraph({ music, structures: [], track, patterns: {}, motion: 1, energy: 0.5 }),
        [],
      );
      // A whole LAYER being sped up is a tempo change wearing a fill's coat —
      // that was the kick that "suddenly went fast" every eighth bar (§102).
      expect(`${form}: ${/lastOf\([0-9]+, x => x\.(fast|slow)\(/.test(code)}`).toBe(`${form}: false`);
      expect(`${form}: ${/setcpm|\.cpm\(/.test(code)}`).toBe(`${form}: false`);
    }
  });
});
