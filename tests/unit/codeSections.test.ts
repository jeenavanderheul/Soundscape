import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { sectioned } from '../../src/ui/CodeOverlay';
import { buildWorldLayerGraph } from '../../src/audio/WorldLayerGraph';
import { buildPatternCode } from '../../src/audio/StrudelEngine';
import { genreGrammar, regionBpm, voiceLabels } from '../../src/audio/MusicalPrimitives';
import { createInitialMusicState } from '../../src/music/MusicState';
import { LEVEL_DEEP, createInitialTrackState } from '../../src/music/TrackState';

/**
 * §97: what is on screen is the code that is SOUNDING, grouped by role. The
 * labels have to line up one for one with the voices the engine emitted, or
 * the banners would name the wrong lines — the same class of lie §93 removed.
 */
describe('the score is grouped by role, and stays honest', () => {
  const deep = { unlocked: true, level: LEVEL_DEEP };
  const track = (form: 'drop' | 'break' | 'return') => ({
    ...createInitialTrackState(),
    genre: 'techno' as const,
    form,
    bpm: regionBpm(genreGrammar('techno')),
    drums: { kick: deep, snare: deep, hats: deep },
    bass: deep, harmony: deep, melody: deep, texture: deep,
    rootMidi: 45, harmonyIntervals: [0, 3, 7, 10], melodyNotes: [69, 72, 76],
  });
  const graphAt = (form: 'drop' | 'break' | 'return') => {
    const t = track(form);
    const music = { ...createInitialMusicState(), bpm: t.bpm, tempoConfidence: 0.6, dynamics: 0.5 };
    return buildWorldLayerGraph({ music, structures: [], track: t, patterns: {}, motion: 1, energy: 0.5 });
  };

  it('gives one label per voice the engine renders', () => {
    const graph = graphAt('drop');
    const voices = (buildPatternCode(graph, []).match(/^ {2}(?!\/\/)/gm) ?? []).length;
    expect(voiceLabels(graph)).toHaveLength(voices);
  });

  it('banners each role once, in the order it is played', () => {
    const graph = graphAt('drop');
    const out = sectioned(buildPatternCode(graph, []), voiceLabels(graph));
    const banners = [...out.matchAll(/── (.+?) ──/g)].map((m) => m[1]);
    expect(banners).toContain('KICK');
    expect(banners).toContain('SUB');
    expect(banners).toContain('ATMOSPHERE');
    // A role is announced once per run, not before every line it owns.
    for (let i = 1; i < banners.length; i += 1) expect(banners[i]).not.toBe(banners[i - 1]);
  });

  it('§96 the void shows its TENSION ENGINE, and the finale its CLIMAX', () => {
    const voidGraph = graphAt('break');
    const voidOut = sectioned(buildPatternCode(voidGraph, []), voiceLabels(voidGraph));
    expect(voidOut).toContain('TENSION ENGINE');
    // …and the void never stops the engine (§95).
    expect(voidOut).toContain('KICK');

    const finale = graphAt('return');
    const finaleOut = sectioned(buildPatternCode(finale, []), voiceLabels(finale));
    expect(finaleOut).toContain('CLIMAX');
  });

  it('leaves the code itself untouched — only banners are added', () => {
    const graph = graphAt('drop');
    const code = buildPatternCode(graph, []);
    const out = sectioned(code, voiceLabels(graph));
    const strip = (s: string) =>
      s.split('\n').filter((l) => !l.includes('──') && l.trim() !== '').join('\n');
    expect(strip(out)).toBe(strip(code));
  });
});
