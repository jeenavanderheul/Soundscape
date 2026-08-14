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
import { zoneAffinity } from '../../src/genres/GenreZones';
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
    // §91: the WORLD owns the clock, so a track only exists while you are
    // flying somewhere. Standing still no longer borrows a tempo from a
    // rhythm you tapped, which is what this test used to lean on.
    const region = { ...zoneAffinity({ x: 0, y: 6, z: 0 }), techno: 1 };
    const tick = (t: number) =>
      builder.tick(t, music, { velocity: 10, hz: 220, energy: 0.4 }, region);
    // §100: arriving in a world gives you its first rung at once — techno
    // opens on the kick, so there is a beat from the first bar.
    tick(250);
    expect(store.getState().drums.kick.unlocked).toBe(true);
    expect(unlocked).toEqual(['kick']);
    // §102: DISCOVERY I is the SECOND rung — the opener came with the world,
    // so this phase has to bring something of its own or it is a dead step.
    for (let t = 500; t <= 15_000; t += 250) tick(t);
    expect(store.getState().drums.hats.unlocked).toBe(false); // still ENTER BIOME
    for (let t = 15_250; t <= 22_000; t += 250) tick(t);
    for (let i = 0; i < 3; i++) {
      builder.onAction({ atMs: 22_000 + i * 400, hz: 900, amplitude: 0.5, release: false });
    }
    tick(23_300);
    expect(store.getState().drums.hats.unlocked).toBe(true);
    // A layer growing its second voice is also a thing arriving, so it takes
    // its turn in the same queue — which is why the snare waits this long.
    for (let t = 46_800; t <= 75_000; t += 500) tick(t);
    builder.onAction({ atMs: 75_000, hz: 400, amplitude: 0.8, release: true });
    builder.onAction({ atMs: 75_500, hz: 400, amplitude: 0.9, release: true });
    tick(75_600);
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
  // A track needs a WORLD: the clock, the ladder and the opening rung all
  // come from the region you are flying in (§46, §100).
  const TECHNO = { ...zoneAffinity({ x: 0, y: 6, z: 0 }), techno: 1 };
  function flyAt(altitude: number, ms: number) {
    const { store, builder } = setup();
    for (let t = 0; t <= ms; t += 100) {
      builder.tick(t, roamingMusic, { ...ROAMING, altitude }, TECHNO);
    }
    return store.getState();
  }

  it('§3.1 skimming the ground earns the BASS — that is where the mass is', () => {
    // §100 gave the kick away with the world, so what flying low still buys
    // you outright is the low register itself.
    expect(flyAt(3, 120_000).bass.unlocked).toBe(true);
  });

  it('§3.1 climbing into the air earns the hats, without skipping the ladder', () => {
    const { store, builder } = setup();
    // Down first for the kick, then up: the ladder still cannot be skipped.
    for (let t = 0; t <= 25_000; t += 100) builder.tick(t, roamingMusic, { ...ROAMING, altitude: 3 });
    for (let t = 25_100; t <= 70_000; t += 100) {
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
    // §92: the arc gates it now — before DISCOVERY I opens, nobody gets a
    // kick, however patient or however deliberate.
    // §100: the opening rung comes with the world itself.
    expect(flyAt(19, 2000).drums.kick.unlocked).toBe(true);
    // …and the sub is PRESSURE's, four phases in.
    expect(flyAt(19, 150_000).bass.unlocked).toBe(true);
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

  it('§91 nothing but the world moves the clock', () => {
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
    expect(fast).toBe(slow); // the place's own tempo, whatever the speed

    // …and a confident tapped rhythm no longer takes it over either. The same
    // world always plays at the same tempo, so the record you built stays the
    // record you built (user decision).
    const tapped = { ...createInitialMusicState(), bpm: 124, tempoConfidence: 0.95, dynamics: 0.5 };
    for (let t = 62_000; t <= 120_000; t += 100) {
      builder.tick(t, tapped, { velocity: 20, hz: 220, energy: 0.5 });
    }
    expect(store.getState().bpm).toBe(slow);
  });

  it('slides to a new tempo instead of jumping when a world changes it', () => {
    const { store, builder } = setup();
    const music = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0, dynamics: 0.5 };
    const techno = { ...zoneAffinity({ x: 0, y: 6, z: 0 }), techno: 1 };
    const pressure = { ...zoneAffinity({ x: 0, y: 6, z: 0 }), 'sub-pressure': 1 };
    for (let t = 0; t <= 20_000; t += 100) {
      builder.tick(t, music, { velocity: 8, hz: 220, energy: 0.4 }, techno);
    }
    const settled = store.getState().bpm;
    // SUB PRESSURE sits seven bpm higher; crossing must glide, never cut.
    builder.tick(20_100, music, { velocity: 8, hz: 220, energy: 0.4 }, pressure);
    expect(store.getState().bpm).toBeGreaterThanOrEqual(settled);
    expect(store.getState().bpm).toBeLessThan(settled + 5);
  });

  it('§46 flying faster develops the track faster', () => {
    const { builder } = setup();
    // §87 repaced this: a whole 32-cycle arc is ~90s of flight at full speed
    // and ~3 minutes at a crawl, so the RATIO is what matters, not the number.
    expect(builder.pace(66)).toBeGreaterThan(builder.pace(0) * 2);
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
