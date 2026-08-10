import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { buildLayerGraph, speedToBpm } from '../../src/audio/MusicalPrimitives';
import { buildPatternCode } from '../../src/audio/StrudelEngine';
import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { createInitialMusicState } from '../../src/music/MusicState';
import { TrackBuilder, type FlightState } from '../../src/music/TrackBuilder';
import { createInitialTrackState, TrackEvents } from '../../src/music/TrackState';

const STILL: FlightState = { velocity: 0, hz: 220, energy: 0 };
const ROAMING: FlightState = { velocity: 12, hz: 220, energy: 0.5 };

function setup() {
  const store = createStore(createInitialTrackState());
  const bus = createEventBus<TrackEvents>();
  const unlocked: string[] = [];
  bus.on('track:layer', ({ layer }) => unlocked.push(layer));
  const builder = new TrackBuilder(store, bus);
  const music = { ...createInitialMusicState(), bpm: 128, tempoConfidence: 0.6 };
  return { store, builder, unlocked, music };
}

describe('TrackBuilder (§29.3, lenient: intent counts)', () => {
  it('unlocks KICK after three low-register actions, then HAT, then SNARE', () => {
    const { store, builder, unlocked, music } = setup();
    for (let i = 0; i < 3; i++) {
      builder.onAction({ atMs: i * 500, hz: 110, amplitude: 0.6, release: false });
    }
    builder.tick(1600, music, STILL);
    expect(store.getState().drums.kick.unlocked).toBe(true);
    expect(unlocked).toEqual(['kick']);
    for (let i = 0; i < 3; i++) {
      builder.onAction({ atMs: 2000 + i * 400, hz: 900, amplitude: 0.5, release: false });
    }
    builder.tick(3300, music, STILL);
    expect(store.getState().drums.hats.unlocked).toBe(true);
    builder.onAction({ atMs: 4000, hz: 400, amplitude: 0.8, release: true });
    builder.onAction({ atMs: 4500, hz: 400, amplitude: 0.9, release: true });
    builder.tick(4600, music, STILL);
    expect(store.getState().drums.snare.unlocked).toBe(true);
    expect(unlocked.slice(0, 3)).toEqual(['kick', 'hats', 'snare']);
  });

  it('does not unlock hats or snare before the kick (ladder order §29.2)', () => {
    const { store, builder, music } = setup();
    for (let i = 0; i < 4; i++) {
      builder.onAction({ atMs: i * 300, hz: 900, amplitude: 0.9, release: true });
    }
    builder.tick(1500, music, STILL);
    expect(store.getState().drums.hats.unlocked).toBe(false);
    expect(store.getState().drums.snare.unlocked).toBe(false);
  });

  it('forgets stale intent outside the window', () => {
    const { store, builder, music } = setup();
    builder.onAction({ atMs: 0, hz: 100, amplitude: 0.5, release: false });
    builder.onAction({ atMs: 200, hz: 100, amplitude: 0.5, release: false });
    // A long gap with no activity: intent expires and no time accumulates.
    builder.tick(20_000, { ...music, bpm: 0, tempoConfidence: 0 }, STILL);
    builder.onAction({ atMs: 20_100, hz: 100, amplitude: 0.5, release: false });
    builder.tick(20_200, { ...music, bpm: 0, tempoConfidence: 0 }, STILL);
    expect(store.getState().drums.kick.unlocked).toBe(false);
  });
});

describe('auto-ladder: roaming alone builds the whole track (§29.2, §29.3)', () => {
  it('stages kick → hats → snare → bass → harmony → melody while flying', () => {
    const { store, builder } = setup();
    const roamingMusic = { ...createInitialMusicState(), bpm: 112, dynamics: 0.5 };
    const at = (ms: number) => {
      for (let t = 0; t <= ms; t += 100) builder.tick(t, roamingMusic, ROAMING);
      return store.getState();
    };
    expect(at(3200).drums.kick.unlocked).toBe(true);
    expect(at(7300).drums.hats.unlocked).toBe(true);
    expect(at(11_400).drums.snare.unlocked).toBe(true);
    expect(at(16_400).bass.unlocked).toBe(true);
    expect(at(23_400).harmony.unlocked).toBe(true);
    expect(at(31_400).melody.unlocked).toBe(true);
  });

  it('does not accumulate during stillness', () => {
    const { store, builder } = setup();
    const still = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0, dynamics: 0 };
    for (let t = 0; t <= 20_000; t += 100) builder.tick(t, still, STILL);
    expect(store.getState().drums.kick.unlocked).toBe(false);
  });
});

describe('tempo follows flight speed (§29, user decision)', () => {
  it('maps speed into stable bands', () => {
    expect(speedToBpm(0)).toBe(90);
    expect(speedToBpm(5)).toBe(110);
    expect(speedToBpm(12)).toBe(128);
    expect(speedToBpm(17)).toBe(145);
    expect(speedToBpm(23)).toBe(170);
    // Inside a band the tempo does not wobble.
    expect(speedToBpm(9.5)).toBe(speedToBpm(14.9));
  });

  it('writes the flight tempo into the track, and the player rhythm overrides it', () => {
    const { store, builder } = setup();
    const noRhythm = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0, dynamics: 0.5 };
    builder.tick(0, noRhythm, { velocity: 22, hz: 220, energy: 0.8 });
    builder.tick(100, noRhythm, { velocity: 22, hz: 220, energy: 0.8 });
    // §39: full speed in the neutral void tops out at the void's own range.
    expect(store.getState().bpm).toBe(140);
    const tapped = { ...createInitialMusicState(), bpm: 124, tempoConfidence: 0.9, dynamics: 0.5 };
    builder.tick(200, tapped, { velocity: 22, hz: 220, energy: 0.8 });
    expect(store.getState().bpm).toBe(124);
  });
});

describe('graph from TrackState (§29.3 ghost → kick → clap)', () => {
  const music = { ...createInitialMusicState(), bpm: 128, tempoConfidence: 0.6, rhythmDensity: 1 };

  // §32: a flight begins with a tone. Not a quiet beat — no beat at all.
  it('has no drums whatsoever before the kick is earned', () => {
    const graph = buildLayerGraph(music, undefined, [], createInitialTrackState());
    expect(graph.layers.drums.primitives).toHaveLength(0);
  });

  it('earned layers STAY in the track through stillness (§29, user decision)', () => {
    const still = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0, dynamics: 0 };
    const track = createInitialTrackState();
    track.bpm = 128;
    track.drums.kick = { unlocked: true, level: 1 };
    track.drums.snare = { unlocked: true, level: 1 };
    track.drums.hats = { unlocked: true, level: 1 };
    const graph = buildLayerGraph(still, undefined, [], track);
    expect(graph.bpm).toBe(128);
    const kinds = graph.layers.drums.primitives.map((p) => p.kind);
    expect(kinds).toContain('pulse');
    expect(kinds).toContain('snare');
    expect(kinds).toContain('hat');
  });

  it('brings the kick in at full weight once unlocked, and adds the backbeat clap', () => {
    const track = createInitialTrackState();
    track.drums.kick = { unlocked: true, level: 1 };
    track.drums.snare = { unlocked: true, level: 1 };
    const graph = buildLayerGraph(music, undefined, [], track);
    const pulse = graph.layers.drums.primitives.find((p) => p.id === 'pulse')!;
    expect(pulse.parameters['gain']).toBeGreaterThanOrEqual(0.8);
    expect(buildPatternCode(graph)).toContain('[~ white ~ white]');
  });

  it('renders bass, harmony and melody once they are earned (§29.2 fase 3-5)', () => {
    const track = createInitialTrackState();
    track.bpm = 128;
    track.drums.kick = { unlocked: true, level: 1 };
    track.bass = { unlocked: true, level: 1 };
    track.harmony = { unlocked: true, level: 1 };
    track.melody = { unlocked: true, level: 1 };
    track.harmonyIntervals = [0, 7];
    track.melodyNotes = [69, 72, 76, 72];
    const graph = buildLayerGraph(music, undefined, [], track);
    expect(graph.layers.bass.primitives[0]!.kind).toBe('bass');
    expect(graph.layers.harmony.primitives[0]!.id).toBe('track-harmony');
    expect(graph.layers.melody.primitives[0]!.kind).toBe('melody');
    const code = buildPatternCode(graph);
    expect(code).toContain('sawtooth'); // bassline
    expect(code).toMatch(/note\("\[[a-g#0-9,]+\]"\)/); // stacked chord
    expect(code).toContain('a4'); // melody note from midi 69
  });
});
