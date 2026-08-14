import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { buildLayerGraph } from '../../src/audio/MusicalPrimitives';
import { buildPatternCode } from '../../src/audio/StrudelEngine';
import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { createInitialMusicState } from '../../src/music/MusicState';
import { zoneAffinity } from '../../src/genres/GenreZones';
import { layerUnlocked } from '../../src/music/GenreLadder';
import { TRACK_LAYERS as LAYER_NAMES } from '../../src/music/TrackForm';
import { genreGrammar, regionBpm } from '../../src/audio/MusicalPrimitives';
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
    // §100/§128: arriving in a world gives you a rung at once, so there is
    // sound from the first bar. WHICH rung is drawn per track now, so this
    // asks for the promise — exactly one, immediately — not for its name.
    tick(250);
    expect(unlocked).toHaveLength(1);
    const opener = unlocked[0]!;
    // §102: DISCOVERY I is the SECOND rung — the opener came with the world,
    // so this phase has to bring something of its own or it is a dead step.
    for (let t = 500; t <= 15_000; t += 250) tick(t);
    expect(unlocked).toHaveLength(1); // still ENTER BIOME — nothing new yet
    for (let t = 15_250; t <= 22_000; t += 250) tick(t);
    // §128: three high excitations ask for the HATS. If the draw did not put
    // them next, asking pulls them forward — deliberate play still earns the
    // layer you are playing for, which is the whole point of intent (§29.3).
    for (let i = 0; i < 3; i++) {
      builder.onAction({ atMs: 22_000 + i * 400, hz: 900, amplitude: 0.5, release: false });
    }
    tick(23_300);
    if (opener !== 'hats') expect(store.getState().drums.hats.unlocked).toBe(true);
    // A layer growing its second voice is also a thing arriving, so it takes
    // its turn in the same queue — which is why the snare waits this long.
    for (let t = 46_800; t <= 75_000; t += 500) tick(t);
    builder.onAction({ atMs: 75_000, hz: 400, amplitude: 0.8, release: true });
    builder.onAction({ atMs: 75_500, hz: 400, amplitude: 0.9, release: true });
    tick(75_600);
    // …and two hard releases ask for the SNARE, the same way.
    expect(store.getState().drums.snare.unlocked).toBe(true);
    // Nothing arrived that was not asked for or drawn: no duplicates, and the
    // opener still stands where it landed.
    expect(new Set(unlocked).size).toBe(unlocked.length);
    expect(unlocked[0]).toBe(opener);
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
    // §128: "without skipping the ladder" is now the real invariant, because
    // the ladder is drawn rather than written: whatever stands must be an
    // unbroken PREFIX of this track's order. Nothing is ever reached over.
    const track = store.getState();
    const order = builder.order;
    const standing = order.filter((layer) => layerUnlocked(track, layer));
    expect(standing).toEqual(order.slice(0, standing.length));
    expect(standing.length).toBeGreaterThan(1);
  });

  it('still offers the ladder to a player who does nothing in particular', () => {
    // Patience, not a schedule: it arrives, but later than flying for it — and
    // §46 means a slow flight develops the track more slowly.
    // §92: the arc gates it now — before DISCOVERY I opens, nobody gets a
    // kick, however patient or however deliberate.
    // §100/§128: the opening rung comes with the world itself, whichever the
    // draw chose — a patient player is never left in silence.
    const opening = flyAt(19, 2000);
    expect(LAYER_NAMES.filter((l) => layerUnlocked(opening, l))).toHaveLength(1);
    // …and by four phases in, a flight that did nothing in particular is most
    // of the way up its ladder anyway.
    const later = flyAt(19, 150_000);
    expect(LAYER_NAMES.filter((l) => layerUnlocked(later, l)).length).toBeGreaterThanOrEqual(5);
  });

  it('does not accumulate during stillness', () => {
    const { store, builder } = setup();
    const still = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0, dynamics: 0 };
    for (let t = 0; t <= 20_000; t += 100) builder.tick(t, still, STILL);
    expect(store.getState().drums.kick.unlocked).toBe(false);
  });
});

describe('§46 the region carries the tempo, the flight does not', () => {
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

  it('§126 arrives on the new world OWN tempo, because a crossing is a new track', () => {
    // This test used to assert the opposite — that a crossing GLIDES into the
    // new tempo. It passed only because the crossing fired a tick later than it
    // does now, so what it actually measured was the last tick of the old
    // track. §46 (glide) and §54 (a world is a track, at that world's tempo)
    // contradict each other on a crossing, and the timing bug hid it.
    //
    // §54 wins, on the user's hard rule: a genre switch must be HEARD within
    // two seconds, and gliding seven bpm over several seconds is the opposite
    // of arriving. Sliding still governs tempo that moves under a track that is
    // staying put; landing somewhere else is a cut, and should be.
    const { store, builder } = setup();
    const music = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0, dynamics: 0.5 };
    const techno = { ...zoneAffinity({ x: 0, y: 6, z: 0 }), techno: 1 };
    const pressure = { ...zoneAffinity({ x: 0, y: 6, z: 0 }), 'sub-pressure': 1 };
    for (let t = 0; t <= 20_000; t += 100) {
      builder.tick(t, music, { velocity: 8, hz: 220, energy: 0.4 }, techno);
    }
    const settled = store.getState().bpm;
    builder.tick(20_100, music, { velocity: 8, hz: 220, energy: 0.4 }, pressure);
    expect(store.getState().genre).toBe('sub-pressure');
    // SUB PRESSURE runs faster than techno, and you hear that on arrival.
    expect(store.getState().bpm).toBeGreaterThan(settled);
    expect(store.getState().bpm).toBe(regionBpm(genreGrammar('sub-pressure')));
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

});
