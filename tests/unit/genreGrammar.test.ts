import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { buildLayerGraph, genreGrammar, regionBpm } from '../../src/audio/MusicalPrimitives';
import { buildPatternCode, setSamplesLoaded } from '../../src/audio/StrudelEngine';
import { sectionMix } from '../../src/music/ArrangementEngine';
import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { CallResponse, respondTo } from '../../src/music/CallResponse';
import { GENRE_LADDERS, ladderFor, nextStep } from '../../src/music/GenreLadder';
import { createInitialMusicState, type GenreAffinity } from '../../src/music/MusicState';
import { TrackBuilder, type FlightState } from '../../src/music/TrackBuilder';
import { LEVEL_DEEP, createInitialTrackState, TrackEvents, type TrackGenre } from '../../src/music/TrackState';

const ROAMING: FlightState = { velocity: 12, hz: 220, energy: 0.5 };

function affinityOf(genre: Exclude<TrackGenre, null>): GenreAffinity {
  const zero: GenreAffinity = { techno: 0, ambient: 0, jazz: 0, dnb: 0, garage: 0, house: 0, trap: 0, classical: 0, dub: 0, experimental: 0 };
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
    expect(flyThrough('jazz', 12)[0]).toBe('harmony');
    expect(flyThrough('dnb', 20).slice(0, 2)).toEqual(['bass', 'snare']);
  });

  it('§54 a world is a track: crossing starts a new one, from the first layer', () => {
    const store = createStore(createInitialTrackState());
    const bus = createEventBus<TrackEvents>();
    const builder = new TrackBuilder(store, bus);
    const music = { ...createInitialMusicState(), bpm: 128, tempoConfidence: 0.6, dynamics: 0.5 };
    for (let ms = 0; ms <= 12_000; ms += 250) builder.tick(ms, music, ROAMING, affinityOf('techno'));
    const earned = store.getState().drums;
    expect(earned.kick.unlocked).toBe(true);
    // Flying into Drum & Bass starts a Drum & Bass track, at its own tempo,
    // with nothing carried over.
    for (let ms = 12_250; ms <= 18_000; ms += 250) {
      builder.tick(ms, music, ROAMING, affinityOf('dnb'));
    }
    const after = store.getState();
    expect(after.genre).toBe('dnb');
    expect(after.drums.kick.unlocked).toBe(false);
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

describe('§49 every world has its own voices', () => {
  it('gives each grammar its own bass, chords and lead', () => {
    const jazz = genreGrammar('jazz');
    const techno = genreGrammar('techno');
    expect(jazz.leadVoice).toBe('sax');
    expect(jazz.chordVoice).toBe('piano');
    expect(techno.chordVoice).not.toBe(jazz.chordVoice);
    // Acoustic where the genre is acoustic, synthetic where it is synthetic.
    expect(['sine', 'square', 'sawtooth', 'triangle']).toContain(techno.bassVoice);
    expect(genreGrammar('classical').chordVoice).toBe('piano');
    expect(genreGrammar('dub').leadVoice).toBe('harmonica');
  });

  it('plays the same figure on the instruments of the region it is in', () => {
    const track = createInitialTrackState();
    track.bpm = 128;
    track.harmony = { unlocked: true, level: 1 };
    track.harmonyIntervals = [0, 3, 7];
    const music = { ...createInitialMusicState(), bpm: 128, tempoConfidence: 0.6 };
    const code = (genre: Exclude<TrackGenre, null>) =>
      buildPatternCode(buildLayerGraph(music, affinityOf(genre), [], track));
    expect(code('jazz')).toContain('"piano"');
    expect(code('house')).toContain('"piano"');
    expect(code('techno')).not.toContain('"piano"');
  });
});

describe('§50 the reference presets are the tempo and the mix', () => {
  it('every region sits at the tempo its preset was written at', () => {
    const at = (genre: Exclude<TrackGenre, null>) => regionBpm(genreGrammar(genre));
    expect(at('techno')).toBe(132);
    expect(at('garage')).toBe(134);
    expect(at('jazz')).toBe(110);
    expect(at('house')).toBe(124);
    expect(at('ambient')).toBe(70);
    expect(at('classical')).toBe(82);
    expect(at('dnb')).toBe(174);
    expect(at('trap')).toBe(140);
    expect(at('experimental')).toBe(118);
    expect(at('dub')).toBe(72);
  });

  it('keeps the preset mix order: kick over bass over chords over lead', () => {
    for (const genre of ['techno', 'house', 'garage', 'trap', 'dnb'] as const) {
      const g = genreGrammar(genre);
      expect(g.kickGain).toBeGreaterThanOrEqual(g.bassGain);
      expect(g.bassGain).toBeGreaterThan(g.harmonyGain);
      expect(g.harmonyGain).toBeGreaterThanOrEqual(g.melodyGain);
    }
    // Ambient and classical invert it: the kick is the quietest thing there.
    expect(genreGrammar('ambient').kickGain).toBeLessThan(genreGrammar('ambient').bassGain);
    expect(genreGrammar('classical').kickGain).toBeLessThan(genreGrammar('classical').harmonyGain * 2);
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

  it('never changes the grammar of a track that is already playing', () => {
    const { store, fly } = flightIn('techno');
    fly(0, 12_000, 0, 0.6);
    expect(store.getState().genre).toBe('techno');
    // Arriving elsewhere starts a NEW track (§54); this one never turns into
    // ambient — it ends, and an ambient one begins from its first layer.
    fly(12_250, 6000, 0, 0.6, 'ambient');
    expect(store.getState().genre).toBe('ambient');
    expect(store.getState().drums.kick.unlocked).toBe(false);
  });

  it('§54 gives a young track eight seconds to exist before it can be wiped', () => {
    const { store, genres, fly } = flightIn('techno');
    fly(0, 12_000, 0, 0.6);
    fly(12_250, 3000, 0, 0.6, 'ambient');
    expect(store.getState().genre).toBe('ambient');
    // Turning straight back must not wipe the newborn track.
    fly(15_500, 3000, 0, 0.6, 'techno');
    expect(store.getState().genre).toBe('ambient');
    expect(genres).toEqual(['ambient']);
    // Once it has had its eight seconds, travelling counts again.
    fly(18_750, 12_000, 0, 0.6, 'techno');
    expect(store.getState().genre).toBe('techno');
  });


  it('starts the NEXT track in the region the player is still flying in', () => {
    const { store, genres, fly } = flightIn('techno');
    const deep = { unlocked: true, level: LEVEL_DEEP };
    store.setState((t) => ({
      ...t, bpm: 132,
      drums: { kick: deep, snare: deep, hats: deep },
      bass: deep, harmony: deep, melody: deep, texture: deep,
    }));
    fly(0, 40_000, 0, 0.9);      // push: groove → build → drop
    fly(40_250, 30_000, 0, 0.1); // ease off: break, and the handover
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
    fly(0, 40_000, 0, 0.9);
    fly(40_250, 30_000, 0, 0.1);
    expect(genres).toEqual(['techno']);
  });
});

describe('§61 a section means something different in every world', () => {
  it('techno drops by slamming the floor back in', () => {
    const build = sectionMix('build', genreGrammar('techno').sectionStyle);
    const drop = sectionMix('drop', genreGrammar('techno').sectionStyle);
    expect(build.bass).toBeLessThan(0.4);
    expect(drop.bass).toBe(1);
  });

  it('ambient has no floor to slam: it opens up instead', () => {
    const style = genreGrammar('ambient').sectionStyle;
    expect(style).toBe('swell');
    const build = sectionMix('build', style);
    const drop = sectionMix('drop', style);
    // The bass never disappears, and the drums never take over.
    expect(build.bass).toBeGreaterThan(0.6);
    expect(drop.drums).toBeLessThan(0.8);
    expect(drop.harmony).toBe(1);
  });

  it('no two section styles read the same in a build', () => {
    const styles = ['driven', 'swell', 'dynamic', 'echo', 'mutant'] as const;
    const shapes = styles.map((s) => JSON.stringify(sectionMix('build', s)));
    expect(new Set(shapes).size).toBe(styles.length);
  });

  it('every grammar declares how it means its sections', () => {
    const worlds = [
      'techno', 'garage', 'jazz', 'house', 'ambient',
      'classical', 'dnb', 'trap', 'dub', 'experimental',
    ] as const;
    for (const world of worlds) {
      expect(genreGrammar(world).sectionStyle).toBeTruthy();
    }
    expect(genreGrammar('dub').sectionStyle).toBe('echo');
    expect(genreGrammar('jazz').sectionStyle).toBe('dynamic');
    expect(genreGrammar('experimental').sectionStyle).toBe('mutant');
  });
});
