import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { createInitialMusicState } from '../../src/music/MusicState';
import { TrackBuilder } from '../../src/music/TrackBuilder';
import { createInitialTrackState, type TrackEvents } from '../../src/music/TrackState';
import { zoneAffinity } from '../../src/genres/GenreZones';
import { GenreAffinityEngine } from '../../src/genres/GenreAffinityEngine';

/**
 * §125: flying through worlds at speed felt like nothing was happening. Two
 * reasons, and the first is the one you notice: a track born by TRAVELLING
 * only emitted `track:new`, so the world never announced its name. You saw
 * TRACK 02 and were never told where you had arrived.
 */
const WORLDS = ['techno', 'heavy-signal', 'broken-machine', 'sub-pressure', 'void-crusher', 'percussion-riot'];
const affinityFor = (genre: string) => ({ ...zoneAffinity({ x: 0, y: 6, z: 0 }), [genre]: 1 }) as never;

function sweep(holdMs: number, seconds = 60) {
  const store = createStore(createInitialTrackState());
  const bus = createEventBus<TrackEvents>();
  const announced: string[] = [];
  bus.on('track:genre', ({ genre }) => { if (genre) announced.push(genre); });
  const builder = new TrackBuilder(store, bus);
  const music = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0, dynamics: 0.5 };
  const worlds: string[] = [];
  let last = '';
  for (let t = 0; t <= seconds * 1000; t += 250) {
    builder.tick(t, music, { velocity: 132, hz: 220, energy: 0.6, altitude: 19 },
      affinityFor(WORLDS[Math.floor(t / holdMs) % WORLDS.length]!));
    const genre = store.getState().genre ?? '';
    if (genre !== last) { worlds.push(genre); last = genre; }
  }
  return { worlds, announced };
}

describe('arriving in a world says so', () => {
  it('announces every crossing, not just the first', () => {
    const { worlds, announced } = sweep(5000);
    expect(worlds.length).toBeGreaterThan(5);
    // Every world the land moved to was also named.
    expect(announced).toEqual(worlds);
  });

  it('a deliberate turn lands in about a second, even at full throttle', () => {
    // 3200 paced was 3.3s at speed, and below that a crossing did nothing —
    // sweeping felt broken rather than protected.
    const { worlds } = sweep(2000);
    expect(worlds.length).toBeGreaterThan(20);
  });

  it('but a twitch still cannot wipe a track', () => {
    const { worlds } = sweep(250, 20);
    expect(worlds.length).toBeLessThan(20);
  });
});

describe('§126 a crossing is heard inside two seconds — at every speed', () => {
  // The hard rule, measured through the chain the GAME uses: heading →
  // zoneAffinity → GenreAffinityEngine (smoothed) → TrackBuilder. Measuring the
  // builder alone hid this bug twice, because the bug was never in the builder.
  const SECT = (i: number) => ((Math.PI * 2) / 6) * i;
  const STEP = 16;
  const POS = { x: 0, y: 10, z: -400 };

  /** Fly a settled track through all five other worlds, one after another. */
  const sweep = (velocity: number): number[] => {
    const store = createStore(createInitialTrackState());
    const builder = new TrackBuilder(store, createEventBus<TrackEvents>());
    const engine = new GenreAffinityEngine(createEventBus());
    const music = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0, dynamics: 0.5 };
    const feed = (t: number, heading: number) => {
      engine.update(t, music, zoneAffinity(POS, heading));
      builder.tick(t, music, { velocity, hz: 220, energy: 0.6, altitude: 19 },
        engine.current?.affinity);
    };
    let t = 0;
    for (; t <= 25_000; t += STEP) feed(t, SECT(0));
    const lags: number[] = [];
    for (let sector = 1; sector <= 5; sector += 1) {
      const previous = store.getState().genre;
      const turned = t;
      let lag = Infinity;
      for (; t <= turned + 15_000; t += STEP) {
        feed(t, SECT(sector));
        const genre = store.getState().genre;
        if (genre !== previous && genre !== null) { lag = (t - turned) / 1000; break; }
      }
      lags.push(lag);
    }
    return lags;
  };

  // Hovering is the worst case and full throttle the best, because the guard
  // used to be counted on the PACED clock: 1200 paced is 4.0s of real life at
  // rest and 1.2s at full speed. Same wall-clock now, whatever the throttle.
  it.each([['hovering', 0], ['cruise', 13], ['half throttle', 66], ['full throttle', 132]])(
    'lands every one of the five crossings within two seconds — %s',
    (_label, velocity) => {
      for (const lag of sweep(velocity as number)) expect(lag).toBeLessThanOrEqual(2);
    },
  );

  it('takes the same real time at rest as at full speed', () => {
    // The regression itself: if either guard drifts back onto the paced clock,
    // hovering slows down by 1/paceAtRest and this fails first.
    const [, secondAtRest] = sweep(0);
    const [, secondAtSpeed] = sweep(132);
    expect(Math.abs(secondAtRest! - secondAtSpeed!)).toBeLessThan(0.2);
  });
});
