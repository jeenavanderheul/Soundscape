import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { buildLayerGraph, regionBpm, genreGrammar } from '../../src/audio/MusicalPrimitives';
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
    // §82: intent still earns the layer, but a rung has to be HEARD before the
    // next one lands — otherwise a run of actions arrives as one lump.
    for (let i = 0; i < 3; i++) {
      builder.onAction({ atMs: 2000 + i * 400, hz: 900, amplitude: 0.5, release: false });
    }
    builder.tick(3300, music, STILL);
    expect(store.getState().drums.hats.unlocked).toBe(false);
    for (let t = 3800; t <= 14_000; t += 500) builder.tick(t, music, STILL);
    for (let i = 0; i < 3; i++) {
      builder.onAction({ atMs: 14_000 + i * 400, hz: 900, amplitude: 0.5, release: false });
    }
    builder.tick(15_300, music, STILL);
    expect(store.getState().drums.hats.unlocked).toBe(true);
    // A layer growing its second voice is also a thing arriving, so it takes
    // its turn in the same queue — which is why the snare waits this long.
    for (let t = 15_800; t <= 33_000; t += 500) builder.tick(t, music, STILL);
    builder.onAction({ atMs: 33_000, hz: 400, amplitude: 0.8, release: true });
    builder.onAction({ atMs: 33_500, hz: 400, amplitude: 0.9, release: true });
    builder.tick(33_600, music, STILL);
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

describe('the flight earns the layers; time is only patience (§29.3, §31.2)', () => {
  const roamingMusic = { ...createInitialMusicState(), bpm: 112, dynamics: 0.5 };

  /** Fly for `ms` at a fixed height above the ground. */
  function flyAt(altitude: number, ms: number) {
    const { store, builder } = setup();
    for (let t = 0; t <= ms; t += 100) {
      builder.tick(t, roamingMusic, { ...ROAMING, altitude });
    }
    return store.getState();
  }

  it('§3.1 skimming the ground earns the kick — that is where the mass is', () => {
    expect(flyAt(3, 4000).drums.kick.unlocked).toBe(true);
    // Same four seconds at a neutral height earns nothing yet.
    expect(flyAt(19, 4000).drums.kick.unlocked).toBe(false);
  });

  it('§3.1 climbing into the air earns the hats, without skipping the ladder', () => {
    const { store, builder } = setup();
    // Down first for the kick, then up: the ladder still cannot be skipped.
    for (let t = 0; t <= 4000; t += 100) builder.tick(t, roamingMusic, { ...ROAMING, altitude: 3 });
    for (let t = 4100; t <= 30_000; t += 100) {
      builder.tick(t, roamingMusic, { ...ROAMING, altitude: 50 });
    }
    const track = store.getState();
    expect(track.drums.hats.unlocked).toBe(true);
    // Texture is the last rung: flying high cannot jump the queue (§31.2).
    expect(track.texture.unlocked).toBe(false);
  });

  it('still offers the ladder to a player who does nothing in particular', () => {
    // Patience, not a schedule: it arrives, but later than flying for it — and
    // §46 means a slow flight develops the track more slowly.
    expect(flyAt(19, 4000).drums.kick.unlocked).toBe(false);
    expect(flyAt(19, 9000).drums.kick.unlocked).toBe(true);
    expect(flyAt(19, 45_000).bass.unlocked).toBe(true);
  });

  it('does not accumulate during stillness', () => {
    const { store, builder } = setup();
    const still = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0, dynamics: 0 };
    for (let t = 0; t <= 20_000; t += 100) builder.tick(t, still, STILL);
    expect(store.getState().drums.kick.unlocked).toBe(false);
  });
});

describe('§46 the region carries the tempo, the flight does not', () => {
  it('every grammar sits in the middle of its own range', () => {
    expect(regionBpm(genreGrammar('techno'))).toBeGreaterThanOrEqual(115);
    expect(regionBpm(genreGrammar('ambient'))).toBeLessThan(100);
    expect(regionBpm(genreGrammar('bass'))).toBeGreaterThan(140);
  });

  it('flying faster does not move the clock, and your own rhythm still wins', () => {
    const { store, builder } = setup();
    const noRhythm = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0, dynamics: 0.5 };
    const settle = (velocity: number, from: number) => {
      for (let t = from; t <= from + 30_000; t += 100) {
        builder.tick(t, noRhythm, { velocity, hz: 220, energy: 0.5 });
      }
      return store.getState().bpm;
    };
    const slow = settle(6, 0);
    const fast = settle(66, 31_000);
    expect(fast).toBe(slow); // the void's own tempo, whatever the speed

    const tapped = { ...createInitialMusicState(), bpm: 124, tempoConfidence: 0.9, dynamics: 0.5 };
    for (let t = 62_000; t <= 90_000; t += 100) {
      builder.tick(t, tapped, { velocity: 66, hz: 220, energy: 0.8 });
    }
    expect(store.getState().bpm).toBe(124);
  });

  it('slides to a new tempo instead of jumping (user decision)', () => {
    const { store, builder } = setup();
    const music = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0, dynamics: 0.5 };
    for (let t = 0; t <= 6000; t += 100) builder.tick(t, music, { velocity: 8, hz: 220, energy: 0.4 });
    const settled = store.getState().bpm;
    const tapped = { ...music, bpm: settled + 40, tempoConfidence: 0.9 };
    builder.tick(6100, tapped, { velocity: 8, hz: 220, energy: 0.4 });
    // One tick later it is on its way, not there.
    expect(store.getState().bpm).toBeGreaterThan(settled);
    expect(store.getState().bpm).toBeLessThan(settled + 5);
  });

  it('§46 flying faster develops the track faster', () => {
    const { builder } = setup();
    expect(builder.pace(66)).toBeGreaterThan(builder.pace(0) * 3);
  });
});

describe('graph from TrackState (§29.3 ghost → kick → clap)', () => {
  const music = { ...createInitialMusicState(), bpm: 128, tempoConfidence: 0.6, rhythmDensity: 1 };

  // §32: a flight begins with a tone. Not a quiet beat — no beat at all.
  it('has no drums whatsoever before the kick is earned', () => {
    const graph = buildLayerGraph(music, undefined, [], createInitialTrackState());
    expect(graph.layers.drums.primitives).toHaveLength(0);
  });

  // §42: movement is the music — standing still silences the world, but the
  // track itself is never lost.
  it('goes silent when the orb stops, and keeps every earned layer', () => {
    const track = createInitialTrackState();
    track.bpm = 128;
    track.drums.kick = { unlocked: true, level: 1 };
    track.bass = { unlocked: true, level: 1 };
    const flying = buildLayerGraph(music, undefined, [], track, {}, 1);
    const still = buildLayerGraph(music, undefined, [], track, {}, 0);
    expect(flying.layers.drums.gain).toBe(1);
    expect(still.layers.drums.gain).toBe(0);
    expect(still.layers.bass.gain).toBe(0);
    // The layers are still THERE — they are just not sounding.
    expect(still.layers.drums.primitives.length).toBe(flying.layers.drums.primitives.length);
    expect(track.drums.kick.unlocked).toBe(true);
    // Starting to move fades the world back in rather than switching it on.
    expect(buildLayerGraph(music, undefined, [], track, {}, 0.5).layers.drums.gain).toBeCloseTo(0.5);
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
    expect(buildPatternCode(graph)).toContain('~ ~ white ~ ~ ~ white ~'); // §66b clap on 3 and 7
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
