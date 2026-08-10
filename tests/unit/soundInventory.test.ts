import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { buildLayerGraph } from '../../src/audio/MusicalPrimitives';
import { DRUM_BANKS, buildPatternCode, setSamplesLoaded } from '../../src/audio/StrudelEngine';
import { GRAMMAR_BANKS } from '../../src/audio/MusicalPrimitives';
import { SOUND_INVENTORY } from '../../src/audio/soundInventory.generated';
import { GENRE_NAMES, createInitialMusicState } from '../../src/music/MusicState';
import { createInitialTrackState, LEVEL_DEEP, type TrackGenre } from '../../src/music/TrackState';

/**
 * §38: HARD CHECK. Every sound the engine can utter must exist in the sample
 * maps we load. A name that looks plausible but is not there produces silence,
 * not an error — so nothing else in the game can catch it. This test can.
 */

const INVENTORY = new Set(SOUND_INVENTORY);

/** A fully earned track, so every template in the grammar is exercised. */
function fullTrack(genre: Exclude<TrackGenre, null>) {
  const deep = { unlocked: true, level: LEVEL_DEEP };
  return {
    ...createInitialTrackState(),
    bpm: 140,
    genre,
    form: 'groove' as const,
    drums: { kick: deep, snare: deep, hats: deep },
    bass: deep,
    harmony: deep,
    melody: deep,
    texture: deep,
    melodyNotes: [69, 72, 76, 79],
    harmonyIntervals: [0, 3, 7],
    responseNotes: [64, 67, 71],
  };
}

function codeFor(genre: Exclude<TrackGenre, null>, samplesLoaded: boolean): string {
  setSamplesLoaded(samplesLoaded);
  const music = { ...createInitialMusicState(), bpm: 140, tempoConfidence: 0.6, pitchCenter: 110 };
  return buildPatternCode(buildLayerGraph(music, undefined, [], fullTrack(genre)));
}

/** Every sound name in the code, with the bank it is played on. */
function soundsIn(code: string): string[] {
  const found: string[] = [];
  // Each voice is one expression; a bank applies to the sounds in its own voice.
  for (const voice of code.split(/,\n/)) {
    const bank = voice.match(/\.bank\("([^"]+)"\)/)?.[1] ?? null;
    for (const match of voice.matchAll(/(?:^|[^a-zA-Z])s\("([^"]+)"\)/g)) {
      for (const token of match[1]!.split(/[\s[\]<>*~,|]+/).filter(Boolean)) {
        if (/^[\d.]+$/.test(token)) continue; // a multiplier, not a sound
        found.push(bank ? `${bank}_${token}`.toLowerCase() : token.toLowerCase());
      }
    }
    for (const match of voice.matchAll(/\.s\("([^"]+)"\)/g)) {
      found.push(match[1]!.toLowerCase());
    }
  }
  return found;
}

describe('§38 the sound library actually supports the game', () => {
  it('has a real inventory to check against', () => {
    expect(SOUND_INVENTORY.length).toBeGreaterThan(500);
    expect(INVENTORY.has('rolandtr909_bd')).toBe(true);
    expect(INVENTORY.has('sine')).toBe(true);
    // The exact trap that produced silence once: a plausible machine that
    // is not in the maps must NOT be treated as available.
    expect(INVENTORY.has('rolandtr77_bd')).toBe(false);
  });

  // The allowlist is what a wrong name silently falls back FROM, so it is the
  // one list that must be right. Without this the fallback hides mistakes.
  it('names only drum machines that ship a complete kit', () => {
    const incomplete: string[] = [];
    for (const bank of DRUM_BANKS) {
      const missing = ['bd', 'sd', 'hh', 'oh'].filter(
        (drum) => !INVENTORY.has(`${bank.toLowerCase()}_${drum}`),
      );
      if (missing.length > 0) incomplete.push(`${bank} (no ${missing.join('/')})`);
    }
    expect(incomplete).toEqual([]);
  });

  it('lets every grammar name a machine the engine will actually use', () => {
    const unknown = GRAMMAR_BANKS.filter((bank) => !DRUM_BANKS.has(bank));
    expect(unknown, 'these silently fall back to the 909').toEqual([]);
  });

  for (const genre of GENRE_NAMES) {
    for (const samples of [true, false]) {
      it(`plays only sounds that exist — ${genre}, samples ${samples ? 'loaded' : 'offline'}`, () => {
        const code = codeFor(genre as Exclude<TrackGenre, null>, samples);
        const sounds = soundsIn(code);
        expect(sounds.length).toBeGreaterThan(0);
        const missing = [...new Set(sounds)].filter((s) => !INVENTORY.has(s));
        expect(missing, `${genre} asks for sounds that do not exist`).toEqual([]);
      });
    }
  }

  it('covers the neutral void as well', () => {
    setSamplesLoaded(true);
    const music = { ...createInitialMusicState(), bpm: 120, tempoConfidence: 0.6 };
    const code = buildPatternCode(buildLayerGraph(music, undefined, [], createInitialTrackState()));
    const missing = soundsIn(code).filter((s) => !INVENTORY.has(s));
    expect(missing).toEqual([]);
  });
});
