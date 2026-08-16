import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { TRACK_LAYERS } from '../../src/music/TrackForm';
import { scoreHeader } from '../../src/ui/ScoreHeader';
import { createInitialMusicState } from '../../src/music/MusicState';
import { performanceFrom } from '../../src/music/Performance';
import { LEVEL_DEEP, LEVEL_EARNED, createInitialTrackState } from '../../src/music/TrackState';

/**
 * §109: the header is the preset's own shape with LIVE values in it. If any
 * of it were static it would be decoration; these check that each line is
 * actually reading the flight.
 */
describe('the score reads like the preset it came from', () => {
  const base = {
    ...createInitialTrackState(),
    genre: 'locked-groove' as const,
    bpm: 134,
    drums: {
      kick: { unlocked: true, level: LEVEL_DEEP },
      snare: { unlocked: true, level: LEVEL_EARNED },
      hats: { unlocked: false, level: 0 },
    },
  };
  const state = (over: Partial<Parameters<typeof scoreHeader>[0]> = {}) =>
    scoreHeader({
      track: base, cycle: 5, style: 'driven', trackNumber: 2,
      energy: 0.5, bank: 'RolandTR909', order: TRACK_LAYERS, ...over,
    });

  it('names the world, the track and its tempo', () => {
    const text = state();
    expect(text).toContain('THE LOOP — LOCKED-GROOVE · TRACK 02');
    expect(text).toContain('setcpm(134 / 4)');
  });

  it('shows the ladder in THIS TRACK’s order, with what you hold', () => {
    // Was asserting the written ladder's order. That order stopped being the
    // one that plays at §128, so the header on screen was listing rungs the
    // music was not following; it is handed the live order now.
    const text = state();
    expect(text).toContain('kick → clap/snare → hats → sub/bass → rave stab → signal → texture');
    const shuffled = state({ order: ['texture', 'kick', 'hats', 'snare', 'bass', 'harmony', 'melody'] });
    expect(shuffled).toContain('texture → kick → hats → clap/snare');
    // Deep, earned, not yet — in the ladder's order, under the names.
    const held = text.split('\n').find((l) => l.includes('●'))!;
    expect(held.indexOf('●●')).toBeLessThan(held.indexOf('○○'));
  });

  it('puts the flight where it actually is in the thirty-two', () => {
    expect(state({ cycle: 0 })).toContain('◆··· ····');
    const mid = state({ cycle: 5 }).split('\n').find((l) => l.includes('◆'))!;
    expect(mid).toContain('▬▬▬▬ ▬◆··');
    expect(state({ cycle: 5 })).toContain('cycle 05 · DISCOVERY I');
  });

  it('§61 follows the world’s own order through the phases', () => {
    // A swelling world voids where a driven one builds pressure.
    expect(state({ cycle: 12, style: 'driven' })).toContain('PRESSURE');
    expect(state({ cycle: 12, style: 'swell' })).toContain('VOID');
  });

  it('reports the performance numbers being fed in right now', () => {
    const music = createInitialMusicState();
    const high = performanceFrom(music, { altitude: 60, amplitude: 0.9, velocity: 40 });
    const low = performanceFrom(music, { altitude: 1, amplitude: 0.1, velocity: 40 });
    const alt = (t: string) => Number(/ALT ([0-9.]+)/.exec(t)![1]);
    const wind = (t: string) => Number(/WIND ([0-9.]+)/.exec(t)![1]);
    expect(alt(state({ performance: high }))).toBeGreaterThan(alt(state({ performance: low })));
    expect(wind(state({ performance: high }))).toBeGreaterThan(wind(state({ performance: low })));
    expect(state({ energy: 0.75 })).toContain('EDGE 0.75');
  });
});
