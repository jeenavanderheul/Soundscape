import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { buildLayerGraph, genreGrammar } from '../../src/audio/MusicalPrimitives';
import { buildPatternCode, setSamplesLoaded } from '../../src/audio/StrudelEngine';
import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { CallResponse, respondTo } from '../../src/music/CallResponse';
import { GENRE_LADDERS, ladderFor, nextStep } from '../../src/music/GenreLadder';
import { createInitialMusicState, type GenreAffinity } from '../../src/music/MusicState';
import { TrackBuilder, type FlightState } from '../../src/music/TrackBuilder';
import { createInitialTrackState, TrackEvents, type TrackGenre } from '../../src/music/TrackState';

const ROAMING: FlightState = { velocity: 12, hz: 220, energy: 0.5 };

function affinityOf(genre: Exclude<TrackGenre, null>): GenreAffinity {
  const zero: GenreAffinity = { techno: 0, ambient: 0, jazz: 0, dnb: 0, experimental: 0 };
  return { ...zero, [genre]: 0.9 };
}

/** Fly for `seconds` inside one region and report the order layers arrived in. */
function flyThrough(genre: Exclude<TrackGenre, null>, seconds: number): string[] {
  const store = createStore(createInitialTrackState());
  const bus = createEventBus<TrackEvents>();
  const order: string[] = [];
  bus.on('track:layer', ({ layer }) => order.push(layer));
  const builder = new TrackBuilder(store, bus);
  const music = { ...createInitialMusicState(), bpm: 128, tempoConfidence: 0.6, dynamics: 0.5 };
  for (let ms = 0; ms <= seconds * 1000; ms += 250) {
    builder.tick(ms, music, ROAMING, affinityOf(genre));
  }
  return order;
}

describe('§31 genre ladders — every grammar builds a track in its own order', () => {
  it('covers all seven layers exactly once per genre', () => {
    for (const [genre, ladder] of Object.entries(GENRE_LADDERS)) {
      const layers = ladder.map((step) => step.layer);
      expect(new Set(layers).size, genre).toBe(7);
    }
  });

  it('offers only the next unearned step of the current grammar', () => {
    const track = createInitialTrackState();
    expect(nextStep(track, ladderFor('techno'))?.layer).toBe('kick');
    expect(nextStep(track, ladderFor('ambient'))?.layer).toBe('texture');
    expect(nextStep(track, ladderFor('jazz'))?.layer).toBe('harmony');
    expect(nextStep(track, ladderFor('dnb'))?.layer).toBe('bass');
  });

  it('returns null once the whole track is earned', () => {
    const full = {
      ...createInitialTrackState(),
      drums: {
        kick: { unlocked: true, level: 1 },
        snare: { unlocked: true, level: 1 },
        hats: { unlocked: true, level: 1 },
      },
      bass: { unlocked: true, level: 1 },
      harmony: { unlocked: true, level: 1 },
      melody: { unlocked: true, level: 1 },
      texture: { unlocked: true, level: 1 },
    };
    expect(nextStep(full, ladderFor('ambient'))).toBeNull();
  });

  it('Techno opens with the pulse; Ambient opens with space, not a kick', () => {
    expect(flyThrough('techno', 12)[0]).toBe('kick');
    const ambient = flyThrough('ambient', 20);
    expect(ambient[0]).toBe('texture');
    expect(ambient).not.toContain('kick');
  });

  it('Jazz opens with harmony and DnB with the sub', () => {
    expect(flyThrough('jazz', 10)[0]).toBe('harmony');
    expect(flyThrough('dnb', 8).slice(0, 2)).toEqual(['bass', 'snare']);
  });

  it('keeps every earned layer when the player crosses into another region', () => {
    const store = createStore(createInitialTrackState());
    const bus = createEventBus<TrackEvents>();
    const builder = new TrackBuilder(store, bus);
    const music = { ...createInitialMusicState(), bpm: 128, tempoConfidence: 0.6, dynamics: 0.5 };
    for (let ms = 0; ms <= 12_000; ms += 250) builder.tick(ms, music, ROAMING, affinityOf('techno'));
    const earned = store.getState().drums;
    expect(earned.kick.unlocked).toBe(true);
    // Fly west into Drum & Bass: the kick stays, and the ladder continues.
    for (let ms = 12_250; ms <= 20_000; ms += 250) {
      builder.tick(ms, music, ROAMING, affinityOf('dnb'));
    }
    const after = store.getState();
    expect(after.drums.kick.unlocked).toBe(true);
    expect(after.genre).toBe('dnb');
    expect(after.bass.unlocked).toBe(true);
  });
});

describe('§31 grammar rewrites the same layer', () => {
  const trackWithEverything = (genre: Exclude<TrackGenre, null>) => ({
    ...createInitialTrackState(),
    bpm: 128,
    genre,
    drums: {
      kick: { unlocked: true, level: 1 },
      snare: { unlocked: true, level: 1 },
      hats: { unlocked: true, level: 1 },
    },
    bass: { unlocked: true, level: 1 },
    harmony: { unlocked: true, level: 1 },
    melody: { unlocked: true, level: 1 },
    texture: { unlocked: true, level: 1 },
    melodyNotes: [69, 72, 76],
    form: 'groove' as const,
  });

  const codeFor = (genre: Exclude<TrackGenre, null>): string => {
    setSamplesLoaded(true);
    const music = { ...createInitialMusicState(), bpm: 128, tempoConfidence: 0.6 };
    return buildPatternCode(buildLayerGraph(music, undefined, [], trackWithEverything(genre)));
  };

  it('writes Ambient harmony as a pad and Techno harmony as a stab', () => {
    expect(codeFor('ambient')).toContain('attack(.8)');
    expect(codeFor('techno')).toContain('lpf("<900 1600 1100 2200>")');
  });

  it('gives Experimental true polymeter: 7 hats against 5 percussion against 4', () => {
    const code = codeFor('experimental');
    expect(code).toContain('hh*7');
    expect(code).toContain('rim*5');
    expect(genreGrammar('experimental').hatCycle).toBe(7);
  });

  it('gives Ambient air and DnB noise as texture', () => {
    expect(codeFor('ambient')).toContain('room(.9)');
    expect(codeFor('dnb')).toContain('hpf(7000)');
  });
});

describe('§31 Jazz — the world answers', () => {
  it('transposes, inverts and reverses a phrase', () => {
    expect(respondTo([60, 64, 67], 'transpose')).toEqual([55, 59, 62]);
    expect(respondTo([60, 64, 67], 'invert')).toEqual([60, 56, 53]);
    expect(respondTo([60, 64, 67], 'retrograde')).toEqual([67, 64, 60]);
  });

  it('waits for the player to finish, then takes its turn', () => {
    const conversation = new CallResponse();
    expect(conversation.tick(0, [60, 64, 67])).toEqual([]);
    // Still the player's turn while the delay has not passed.
    expect(conversation.tick(500, [60, 64, 67])).toEqual([]);
    expect(conversation.tick(1400, [60, 64, 67])).toEqual([55, 59, 62]);
    expect(conversation.turns).toBe(1);
  });

  it('yields the floor the moment the player plays again', () => {
    const conversation = new CallResponse();
    conversation.tick(0, [60, 64, 67]);
    expect(conversation.tick(1400, [60, 64, 67])).toHaveLength(3);
    expect(conversation.tick(1500, [62, 65, 69])).toEqual([]);
  });

  it('ignores a phrase that never moved', () => {
    const conversation = new CallResponse();
    conversation.tick(0, [60, 60, 60]);
    expect(conversation.tick(5000, [60, 60, 60])).toEqual([]);
  });

  it('answers with a different angle each exchange', () => {
    const conversation = new CallResponse();
    conversation.tick(0, [60, 64, 67]);
    const first = conversation.tick(1400, [60, 64, 67]);
    conversation.tick(1500, [62, 66, 69]);
    const second = conversation.tick(3000, [62, 66, 69]);
    expect(second).not.toEqual(first);
    expect(conversation.turns).toBe(2);
  });
});
