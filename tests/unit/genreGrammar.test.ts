import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import {
  buildLayerGraph,
  energyAddsVoices,
  energyHatCycle,
  energyLooseness,
  genreGrammar,
  regionBpm,
} from '../../src/audio/MusicalPrimitives';
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
  const zero: GenreAffinity = { techno: 0, 'sub-pressure': 0, ambient: 0, jazz: 0, bass: 0, garage: 0, house: 0, trap: 0, breakbeat: 0, dub: 0, experimental: 0 };
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
  it('builds SUB PRESSURE from atmosphere to signal', () => {
    expect(GENRE_LADDERS['sub-pressure'].map((step) => step.layer)).toEqual([
      'texture', 'hats', 'kick', 'snare', 'bass', 'harmony', 'melody',
    ]);
  });

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
    expect(nextStep(track, ladderFor('bass'))?.layer).toBe('kick'); // §73
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
    // §92: a rung arrives when its PHASE opens, so these flights have to be
    // long enough for the arc to reach DISCOVERY I and II.
    expect(flyThrough('techno', 30)[0]).toBe('kick');
    const ambient = flyThrough('ambient', 40);
    expect(ambient[0]).toBe('texture');
    expect(ambient).not.toContain('kick');
  });

  it('Jazz opens with harmony and BASS with its kick', () => {
    expect(flyThrough('jazz', 30)[0]).toBe('harmony');
    expect(flyThrough('bass', 55).slice(0, 2)).toEqual(['kick', 'bass']); // §73
  });

  it('§54 a world is a track: crossing starts a new one, from the first layer', () => {
    const store = createStore(createInitialTrackState());
    const bus = createEventBus<TrackEvents>();
    const builder = new TrackBuilder(store, bus);
    const music = { ...createInitialMusicState(), bpm: 128, tempoConfidence: 0.6, dynamics: 0.5 };
    for (let ms = 0; ms <= 30_000; ms += 250) builder.tick(ms, music, ROAMING, affinityOf('techno'));
    const earned = store.getState().drums;
    expect(earned.kick.unlocked).toBe(true);
    // Flying into bass music starts a bass music track, at its own tempo,
    // with nothing carried over.
    for (let ms = 30_250; ms <= 40_000; ms += 250) {
      builder.tick(ms, music, ROAMING, affinityOf('bass'));
    }
    const after = store.getState();
    expect(after.genre).toBe('bass');
    // §58: arriving hands you that world's FIRST rung at once — for bass
    // music that is the kick, so it is unlocked and nothing else is.
    expect(after.drums.kick.unlocked).toBe(true);
    // …and it is a NEW track: the techno one is gone, not carried over.
    expect(after.harmony.unlocked).toBe(false);
    expect(after.melody.unlocked).toBe(false);
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

  it('writes Ambient harmony as a pad and Techno harmony as its rave machine', () => {
    expect(codeFor('ambient')).toContain('attack(.8)');
    // §80: techno's harmony is a dissonant rave stab with an acid pulse.
    expect(codeFor('techno')).toContain('supersaw');
    expect(codeFor('techno')).toContain('"pulse"');
    expect(codeFor('techno')).not.toContain('fmpiano');
  });

  it('gives Experimental true polymeter: 7 hats against 5 percussion against 4', () => {
    const code = codeFor('experimental');
    expect(code).toContain('hh*7');
    expect(code).toContain('rim*5');
    expect(genreGrammar('experimental').hatCycle).toBe(7);
  });

  it('gives Ambient air and BASS its foghorn as texture', () => {
    expect(codeFor('ambient')).toContain('room(.9)');
    expect(codeFor('bass')).toContain('roomsize(5)'); // §73 the foghorn
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
    expect(genreGrammar('breakbeat').chordVoice).toBe('square'); // §69: a machine, not a hall
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
    expect(at('techno')).toBe(134); // §80
    expect(at('garage')).toBe(135);
    expect(at('jazz')).toBe(110);
    expect(at('house')).toBe(124);
    expect(at('ambient')).toBe(70);
    expect(at('breakbeat')).toBe(142); // §69 breakbeat techno
    expect(at('bass')).toBe(150);
    expect(at('trap')).toBe(140);
    expect(at('experimental')).toBe(118);
    expect(at('dub')).toBe(72);
  });

  it('keeps the preset mix order: kick over bass over chords over lead', () => {
    for (const genre of ['techno', 'house', 'garage', 'trap', 'bass'] as const) {
      const g = genreGrammar(genre);
      expect(g.kickGain).toBeGreaterThanOrEqual(g.bassGain);
      // §73 bass music mixes its acid ABOVE the roll; everywhere else the
      // bass sits over the harmony.
      if (genre !== 'bass') expect(g.bassGain).toBeGreaterThan(g.harmonyGain);
      expect(g.harmonyGain).toBeGreaterThanOrEqual(g.melodyGain);
    }
    // Ambient and breakbeat invert it: the kick is the quietest thing there.
    expect(genreGrammar('ambient').kickGain).toBeLessThan(genreGrammar('ambient').bassGain);
    // §69 breakbeat is driven, not orchestral: the kick leads everything.
    expect(genreGrammar('breakbeat').kickGain).toBeGreaterThan(genreGrammar('breakbeat').bassGain);
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
      'breakbeat', 'bass', 'trap', 'dub', 'experimental',
    ] as const;
    for (const world of worlds) {
      expect(genreGrammar(world).sectionStyle).toBeTruthy();
    }
    expect(genreGrammar('dub').sectionStyle).toBe('echo');
    expect(genreGrammar('jazz').sectionStyle).toBe('dynamic');
    expect(genreGrammar('experimental').sectionStyle).toBe('mutant');
  });
});

describe('§62 speed is energy, and every world spends it its own way', () => {
  const at = (genre: Exclude<TrackGenre, null>, energy: number) =>
    energyHatCycle(genreGrammar(genre), energy);

  it('trap and garage divide the bar further; techno keeps its grid', () => {
    // Subdivision grammars change gear — that IS what they do with energy.
    expect(at('trap', 0.9)).toBeGreaterThan(at('trap', 0.2));
    expect(at('garage', 0.9)).toBeGreaterThan(at('garage', 0.2));
    // §19: a techno hat suddenly running at 32nds would stop being techno.
    expect(at('techno', 0.95)).toBe(at('techno', 0.05));
    expect(at('house', 0.95)).toBe(at('house', 0.05));
  });

  it('the grammars that spend energy on voices are not the ones that subdivide', () => {
    expect(energyAddsVoices(genreGrammar('techno'), 0.9)).toBe(true);
    expect(energyAddsVoices(genreGrammar('dub'), 0.9)).toBe(true);
    expect(energyAddsVoices(genreGrammar('techno'), 0.2)).toBe(false);
    expect(energyAddsVoices(genreGrammar('trap'), 0.9)).toBe(false);
  });

  it('only experimental lets go of the grid when pushed', () => {
    expect(energyLooseness(genreGrammar('experimental'), 1)).toBeGreaterThan(0.2);
    expect(energyLooseness(genreGrammar('techno'), 1)).toBe(0);
    expect(energyLooseness(genreGrammar('ambient'), 1)).toBe(0);
  });

  it('ambient answers energy with air, not with drums', () => {
    const track = createInitialTrackState();
    track.bpm = 70;
    track.texture = { unlocked: true, level: 1 };
    const music = { ...createInitialMusicState(), bpm: 70, tempoConfidence: 0.6 };
    const air = (energy: number) => {
      const graph = buildLayerGraph(music, affinityOf('ambient'), [], track, {}, 1, energy);
      return graph.layers.texture.primitives[0]?.parameters['gain'] as number;
    };
    expect(air(0.9)).toBeGreaterThan(air(0.1));
    // …and still no kick: ambient never buys drums with speed.
    const loud = buildLayerGraph(music, affinityOf('ambient'), [], track, {}, 1, 1);
    expect(loud.layers.drums.primitives).toHaveLength(0);
  });

  it('every grammar declares how it spends energy', () => {
    const worlds = [
      'techno', 'garage', 'jazz', 'house', 'ambient',
      'breakbeat', 'bass', 'trap', 'dub', 'experimental',
    ] as const;
    for (const world of worlds) expect(genreGrammar(world).energyStyle).toBeTruthy();
    expect(genreGrammar('bass').energyStyle).toBe('breaks');
    expect(genreGrammar('jazz').energyStyle).toBe('improv');
  });
});

describe('§66 UK garage sounds like UK garage', () => {
  it('is built from displacement, not from a four-to-the-floor', () => {
    const g = genreGrammar('garage');
    expect(g.kickStyle).toBe('twostep');   // bd ~ ~ bd ~ ~ ~ bd
    expect(g.hatStyle).toBe('shuffle');    // ~ hh ~ [hh hh] ~ hh ~ hh
    expect(g.snareStyle).toBe('clap');     // ~ ~ cp ~ ~ ~ cp ~
    expect(g.bassStyle).toBe('skip');      // all holes and offbeats
    expect(g.chordStyle).toBe('skip');     // stabs OFF the grid
    expect(g.textureStyle).toBe('dust'); // §72: the shaker moved into the percussion
    expect(g.bpmCentre).toBe(135); // §77
  });

  it('plays its chords and hook on the preset’s own voices', () => {
    const g = genreGrammar('garage');
    expect(g.bassVoice).toBe('sine');
    // §77: one 909, and the shuffle is what carries the genre.
    expect(g.chordVoice).toBe('square');
    expect(g.leadVoice).toBe('triangle');
    expect(g.drumBank).toBe('RolandTR909');
  });

  it('its chord lands off the beat and is answered an octave up (§77)', () => {
    const track = createInitialTrackState();
    track.bpm = 134;
    track.harmony = { unlocked: true, level: 1 };
    track.harmonyIntervals = [0, 3, 7];
    const music = { ...createInitialMusicState(), bpm: 134, tempoConfidence: 0.6 };
    const code = buildPatternCode(buildLayerGraph(music, affinityOf('garage'), [], track));
    // §77: offbeat stabs answered an octave up, over an opening supersaw pad.
    const chord = code.split('\n').find((line) => line.includes('supersaw'))!;
    expect(chord).toContain('struct("~ x ~ ~ x ~ ~ x")');
    expect(chord).toContain('off(.125');
  });
});
