import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { buildPatternCode, setSamplesLoaded } from '../../src/audio/StrudelEngine';
import { createEmptyLayerGraph, type MusicalPrimitive } from '../../src/audio/MusicalPrimitives';
import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { createInitialMusicState } from '../../src/music/MusicState';
import { TrackBuilder, type FlightState } from '../../src/music/TrackBuilder';
import {
  LEVEL_DEEP,
  createInitialTrackState,
  type TrackEvents,
  type TrackState,
} from '../../src/music/TrackState';
import { nextRootMidi, rotateVariations, VARIED_LAYERS } from '../../src/music/Variation';

const FLYING: FlightState = { velocity: 12, hz: 220, energy: 0.5, altitude: 12 };

function setup() {
  const store = createStore(createInitialTrackState());
  const bus = createEventBus<TrackEvents>();
  const tracks: number[] = [];
  bus.on('track:new', ({ number }) => tracks.push(number));
  const builder = new TrackBuilder(store, bus, undefined, 'journey-seed');
  return { store, bus, builder, tracks };
}

/** Force a finished track: everything earned and grown deep. */
function complete(track: TrackState): TrackState {
  const deep = { unlocked: true, level: LEVEL_DEEP };
  return {
    ...track,
    bpm: 128,
    drums: { kick: deep, snare: deep, hats: deep },
    bass: deep,
    harmony: deep,
    melody: deep,
    texture: deep,
    melodyNotes: [45, 48, 52],
  };
}

/**
 * §58: the form is energy and time. Push hard for long enough and the track
 * builds and drops; ease off and it breaks down — which is when a finished
 * track hands over.
 */
function flyThroughADrop(builder: TrackBuilder, fromMs: number): number {
  const music = { ...createInitialMusicState(), bpm: 128, tempoConfidence: 0.6, dynamics: 0.6 };
  let t = fromMs;
  // §64: a peak has to be earned — a minute of track before a build is even
  // possible, so the flight that reaches a drop is not a short one.
  // §87: the arc decides the form, not energy — so this simply flies far
  // enough to walk the whole thirty-two cycles and come out the other side of
  // DROP II, which is where a finished track now hands over.
  for (; t < fromMs + 260_000; t += 250) builder.tick(t, music, { ...FLYING, energy: 0.9 });
  return t;
}

describe('the endless journey (user decision)', () => {
  it('hands over to the next track only when everything is earned AND deep', () => {
    const { store, builder, tracks } = setup();
    // A half-built track never hands over on its own — but with the world
    // patient enough it fills up, so start from a track that cannot complete:
    // §64 needs the bass AND four layers AND a minute before a peak exists.
    for (let t = 0; t <= 20_000; t += 250) {
      builder.tick(t, { ...createInitialMusicState(), bpm: 128, tempoConfidence: 0.6, dynamics: 0.6 }, { ...FLYING, energy: 0.1 });
    }
    expect(tracks).toEqual([]);

    store.setState(complete);
    flyThroughADrop(builder, 60_000);
    expect(tracks).toEqual([2]);
  });

  it('starts the next track empty, in a related key, carrying one motif', () => {
    const { store, bus, builder } = setup();
    store.setState(complete);
    const before = store.getState();
    // The motif that carries over is whatever the track was playing when it
    // finished, so watch the state right up to the handover.
    let lastBefore = before;
    let after = before;
    const unsubscribe = store.subscribe((state) => {
      if (state.melody.unlocked) lastBefore = state;
    });
    bus.on('track:new', () => {
      after = store.getState();
    });
    flyThroughADrop(builder, 0);
    unsubscribe();

    // §100/§128: every track opens on its first rung at once, so the next
    // track starts with sound rather than silence. WHICH rung that is is drawn
    // per track now, so the invariant is "exactly one, immediately".
    expect(unlockedLayers(after)).toHaveLength(1);
    expect(after.rootMidi).not.toBe(before.rootMidi); // a related key, not the same
    // §91: the clock belongs to the WORLD, so the next track inherits the one
    // the last track was actually running on — not the tempo the player had
    // tapped, which no longer moves it at all.
    expect(after.bpm).toBe(lastBefore.bpm);
    const shift = after.rootMidi - before.rootMidi;
    expect(after.melodyNotes.length).toBeGreaterThan(0);
    expect(after.melodyNotes).toEqual(lastBefore.melodyNotes.map((n) => n + shift));
    expect(builder.trackNumber).toBe(2);
  });

  it('is deterministic: the same journey writes the same tracks (§25.16)', () => {
    const roots = [0, 1].map(() => {
      const { store, builder } = setup();
      store.setState(complete);
      flyThroughADrop(builder, 0);
      return { root: store.getState().rootMidi, variations: builder.variations };
    });
    expect(roots[0]).toEqual(roots[1]);
  });

  it('keeps the key related and inside the bass register, track after track', () => {
    let root = 45;
    for (let track = 2; track < 40; track++) {
      const next = nextRootMidi(root, track);
      expect(next).not.toBe(root);
      expect(next).toBeGreaterThanOrEqual(36);
      expect(next).toBeLessThanOrEqual(48);
      root = next;
    }
  });
});

describe('variation keeps a finished track moving', () => {
  it('rewrites one layer per turn, and never a no-op', () => {
    let variations = {};
    const touched = new Set<string>();
    for (let turn = 1; turn <= VARIED_LAYERS.length; turn++) {
      const next = rotateVariations(variations, turn, 1, 'seed');
      const changed = VARIED_LAYERS.filter((l) => next[l] !== (variations as never)[l]);
      expect(changed).toHaveLength(1);
      touched.add(changed[0]!);
      variations = next;
    }
    // A full rotation touches every layer that carries a part.
    expect(touched.size).toBe(VARIED_LAYERS.length);
  });

  it('reaches the rendered pattern as a real transform of the same part', () => {
    setSamplesLoaded(false);
    const kick: MusicalPrimitive = {
      id: 'k', kind: 'kick', layer: 'drums',
      parameters: { style: 'four', gain: 0.8 }, allowedTransforms: [],
    };
    const graph = createEmptyLayerGraph(128);
    graph.layers.drums.primitives.push(kick);
    const plain = buildPatternCode(graph);
    const varied = buildPatternCode({ ...graph, variations: { drums: 1 } });
    expect(varied).not.toBe(plain);
    expect(varied).toContain('sbd'); // still the player's kick
  });
});

/** §128: which layers stand — the opening rung is drawn, so never name one. */
function unlockedLayers(track: { drums: Record<string, { unlocked: boolean }> } & Record<string, unknown>): string[] {
  const names = ['kick', 'snare', 'hats', 'bass', 'harmony', 'melody', 'texture'];
  return names.filter((n) =>
    n === 'kick' || n === 'snare' || n === 'hats'
      ? track.drums[n]!.unlocked
      : (track[n] as { unlocked: boolean }).unlocked);
}
