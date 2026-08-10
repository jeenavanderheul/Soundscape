import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { buildLayerGraph } from '../../src/audio/MusicalPrimitives';
import { buildPatternCode, setSamplesLoaded, trackParts } from '../../src/audio/StrudelEngine';
import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { createInitialMusicState, type GenreAffinity } from '../../src/music/MusicState';
import { TrackBuilder, type FlightState } from '../../src/music/TrackBuilder';
import { exportTrack } from '../../src/music/TrackExport';
import {
  createInitialTrackState,
  LEVEL_DEEP,
  LEVEL_EARNED,
  TrackEvents,
  type TrackGenre,
} from '../../src/music/TrackState';

const ROAMING: FlightState = { velocity: 12, hz: 220, energy: 0.5 };

function affinityOf(genre: Exclude<TrackGenre, null>): GenreAffinity {
  const zero: GenreAffinity = { techno: 0, ambient: 0, jazz: 0, dnb: 0, garage: 0, house: 0, trap: 0, classical: 0, dub: 0, experimental: 0 };
  return { ...zero, [genre]: 0.9 };
}

function fly(genre: Exclude<TrackGenre, null>, seconds: number) {
  const store = createStore(createInitialTrackState());
  const bus = createEventBus<TrackEvents>();
  const deepened: string[] = [];
  bus.on('track:depth', ({ layer }) => deepened.push(layer));
  const builder = new TrackBuilder(store, bus);
  const music = { ...createInitialMusicState(), bpm: 140, tempoConfidence: 0.6, dynamics: 0.5 };
  for (let ms = 0; ms <= seconds * 1000; ms += 250) {
    builder.tick(ms, music, ROAMING, affinityOf(genre));
  }
  return { track: store.getState(), deepened };
}

/** A track built by a full flight, in any grammar. */
function finishedTrack(genre: Exclude<TrackGenre, null>) {
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
  };
}

function graphOf(genre: Exclude<TrackGenre, null>) {
  setSamplesLoaded(true);
  const music = { ...createInitialMusicState(), bpm: 140, tempoConfidence: 0.6, pitchCenter: 110 };
  return buildLayerGraph(music, undefined, [], finishedTrack(genre));
}

describe('§32 depth — a layer grows a second voice by staying with it', () => {
  it('earns a layer at half level and deepens it later', () => {
    const early = fly('techno', 4).track;
    expect(early.drums.kick.level).toBe(LEVEL_EARNED);
    const late = fly('techno', 40);
    expect(late.track.drums.kick.level).toBe(LEVEL_DEEP);
    expect(late.deepened.length).toBeGreaterThan(0);
  });

  it('deepens in the grammar order, oldest layer first', () => {
    expect(fly('techno', 40).deepened[0]).toBe('kick');
    expect(fly('ambient', 40).deepened[0]).toBe('texture');
  });

  it('never deepens a layer that was not earned', () => {
    const { track } = fly('ambient', 30);
    expect(track.drums.kick.unlocked).toBe(false);
    expect(track.drums.kick.level).toBe(0);
  });
});

describe('§32 a finished flight is a produced track, in every grammar', () => {
  it('stacks a body under the snare and dirt over the hats', () => {
    const code = buildPatternCode(graphOf('techno'));
    expect(code).toContain('RolandTR808');
    expect(code).toContain('late(.01)'); // the snare body, a hair behind
    expect(code).toContain('hh*32'); // high frequency dirt
  });

  it('keeps the sub under the bass instead of replacing it', () => {
    const ids = trackParts(graphOf('techno')).map((part) => part.id);
    expect(ids).toContain('track-bass');
    expect(ids).toContain('track-sub');
  });

  it('reaches at least nine voices in every genre', () => {
    for (const genre of ['techno', 'ambient', 'jazz', 'dnb', 'experimental'] as const) {
      expect(trackParts(graphOf(genre)).length, genre).toBeGreaterThanOrEqual(9);
    }
  });

  it('drives techno and dnb but leaves ambient and jazz clean', () => {
    expect(buildPatternCode(graphOf('techno'))).toContain('shape(');
    expect(buildPatternCode(graphOf('dnb'))).toContain('shape(');
    expect(buildPatternCode(graphOf('ambient'))).not.toContain('shape(');
    expect(buildPatternCode(graphOf('jazz'))).not.toContain('shape(');
  });

  it('writes the techno lead as a dark stab, not a tune', () => {
    expect(buildPatternCode(graphOf('techno'))).toContain('lpf("<500 900 650 1300>")');
  });
});

describe('§32 export — the flight handed back as source', () => {
  it('produces a numbered, commented, pasteable block', () => {
    const code = exportTrack({ graph: graphOf('techno'), genre: 'techno', flownSeconds: 154 });
    expect(code).toContain('setcpm(140/4)');
    expect(code).toContain('// 01 — KICK / FOUNDATION');
    expect(code).toContain('// 02 — HATS');
    expect(code).toContain('SUB');
    expect(code).toContain('2m34s of flight');
    expect(code.trimEnd().endsWith(')')).toBe(true);
  });

  it('names every voice rather than leaking primitive ids', () => {
    const code = exportTrack({ graph: graphOf('dnb'), genre: 'dnb', flownSeconds: 60 });
    expect(code).not.toContain('track-');
  });

  it('says so honestly when nothing was earned yet', () => {
    const music = { ...createInitialMusicState() };
    const empty = buildLayerGraph(music, undefined, [], createInitialTrackState());
    const code = exportTrack({ graph: empty, genre: null, flownSeconds: 3 });
    expect(code).toContain('Nothing was earned yet');
    expect(code).not.toContain('stack(');
  });
});
