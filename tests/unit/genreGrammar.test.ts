import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import {
  genreGrammar,
} from '../../src/audio/MusicalPrimitives';
import { sectionMix } from '../../src/music/ArrangementEngine';
import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { CallResponse, respondTo } from '../../src/music/CallResponse';
import { GENRE_CURVES } from '../../src/music/GenreLadder';
import { createInitialMusicState, type GenreAffinity } from '../../src/music/MusicState';
import { TrackBuilder } from '../../src/music/TrackBuilder';
import { LEVEL_DEEP, createInitialTrackState, TrackEvents, type TrackGenre } from '../../src/music/TrackState';


function affinityOf(genre: Exclude<TrackGenre, null>): GenreAffinity {
  const zero: GenreAffinity = {
  techno: 0, 'sub-pressure': 0, 'heavy-signal': 0,
  'broken-machine': 0, 'percussion-riot': 0, 'void-crusher': 0,
};
  return { ...zero, [genre]: 0.9 };
}

/** Fly for `seconds` inside one region and report the order layers arrived in. */
describe('§31 genre ladders — every grammar builds a track in its own order', () => {
  it('gives every world seven rungs, rising, in its own shape', () => {
    // The layer ORDER lives in TrackForm now — this file only says WHEN a world
    // offers a rung. What has to hold is that there are seven of them, that
    // they only ever move forward, and that no two worlds wait the same way:
    // one shape scaled six times is what made every world build alike.
    const shapes = new Set<string>();
    for (const [genre, curve] of Object.entries(GENRE_CURVES)) {
      expect(curve.length, genre).toBe(7);
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i]!, `${genre} rung ${i}`).toBeGreaterThan(curve[i - 1]!);
      }
      // Normalised against its own last rung: this is the world's shape, with
      // its overall speed divided out.
      shapes.add(curve.map((t) => (t / curve[curve.length - 1]!).toFixed(2)).join(','));
    }
    expect(shapes.size).toBe(Object.keys(GENRE_CURVES).length);
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

describe('§47 a direction is a promise: techno can only become more techno', () => {
  function flightIn(genre: Exclude<TrackGenre, null>) {
    const store = createStore(createInitialTrackState());
    const bus = createEventBus<TrackEvents>();
    const genres: (string | null)[] = [];
    bus.on('track:new', () => genres.push(store.getState().genre));
    const builder = new TrackBuilder(store, bus);
    const music = { ...createInitialMusicState(), bpm: 128, tempoConfidence: 0.6, dynamics: 0.6 };
    const fly = (from: number, ms: number, climb: number, energy: number, region = genre) => {
      for (let t = from; t <= from + ms; t += 250) {
        builder.tick(t, music, { velocity: 12, hz: 220, energy, altitude: 12, climb }, affinityOf(region));
      }
    };
    return { store, builder, genres, fly };
  }


  it('starts the NEXT track in the region the player is still flying in', () => {
    const { store, genres, fly } = flightIn('techno');
    const deep = { unlocked: true, level: LEVEL_DEEP };
    store.setState((t) => ({
      ...t, bpm: 132,
      drums: { kick: deep, snare: deep, hats: deep },
      bass: deep, harmony: deep, melody: deep, texture: deep,
    }));
    // §87: the arc decides the form now, so a handover means flying the whole
    // thirty-two cycles and coming out the other side of DROP II.
    fly(0, 300_000, 0, 0.9);
    // Track 02 is born in the same place, so it is techno again — a different
    // techno, never an ambient one.
    expect(genres).toEqual(['techno']);
  });

  it('and keeps the grammar rather than going neutral over empty space', () => {
    const store = createStore(createInitialTrackState());
    const bus = createEventBus<TrackEvents>();
    const genres: (string | null)[] = [];
    bus.on('track:new', () => genres.push(store.getState().genre));
    const builder = new TrackBuilder(store, bus);
    const music = { ...createInitialMusicState(), bpm: 128, tempoConfidence: 0.6, dynamics: 0.6 };
    const deep = { unlocked: true, level: LEVEL_DEEP };
    store.setState((t) => ({
      ...t, bpm: 132, genre: 'techno',
      drums: { kick: deep, snare: deep, hats: deep },
      bass: deep, harmony: deep, melody: deep, texture: deep,
    }));
    // The handover happens out over the neutral void: no region to be born in.
    const fly = (from: number, ms: number, climb: number, energy: number) => {
      for (let t = from; t <= from + ms; t += 250) {
        builder.tick(t, music, { velocity: 12, hz: 220, energy, altitude: 12, climb });
      }
    };
    fly(0, 300_000, 0, 0.9);
    expect(genres).toEqual(['techno']);
  });
});

describe('§61 a section means something different in every world', () => {
  it('§92 techno builds pressure by ADDING the sub, never by removing it', () => {
    const build = sectionMix('build', genreGrammar('techno').sectionStyle);
    const drop = sectionMix('drop', genreGrammar('techno').sectionStyle);
    expect(build.bass).toBe(1);
    expect(drop.bass).toBe(1);
  });

  it('no two section styles read the same in a build', () => {
    const styles = ['driven', 'swell', 'dynamic', 'echo', 'mutant'] as const;
    const shapes = styles.map((s) => JSON.stringify(sectionMix('build', s)));
    expect(new Set(shapes).size).toBe(styles.length);
  });

});
