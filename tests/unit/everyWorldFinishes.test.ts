import { describe, expect, it } from 'vitest';

import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { SECTORS, zoneAffinity } from '../../src/genres/GenreZones';
import { curveFor } from '../../src/music/GenreLadder';
import { createInitialMusicState } from '../../src/music/MusicState';
import { TrackBuilder } from '../../src/music/TrackBuilder';
import { formFor } from '../../src/music/TrackForm';
import {
  createInitialTrackState,
  type TrackEvents,
  type TrackState,
} from '../../src/music/TrackState';

/**
 * §185: EVERY WORLD HAS TO FINISH A TRACK.
 *
 * Measured before this: a cruising player in the void reached 6 of 7 layers
 * after four minutes and never heard a track complete — its curve was the one
 * every world shared and `WORLD_PACE` then stretched it half again. A world may
 * be unhurried; it may not be unfinishable, or a third of its voices are
 * content nobody ever hears.
 *
 * The order and the pace are both drawn from the journey seed, so this asks the
 * question with several seeds rather than the one that happens to pass.
 */

const SEEDS = ['a', 'b', 'c', 'd'];
/** A cruise is the honest case: full throttle finishes everything much sooner. */
const CRUISE = 13;

function secondsToFullTrack(world: string, seed: string, velocity: number): number | null {
  const store = createStore<TrackState>(createInitialTrackState());
  const bus = createEventBus<TrackEvents>();
  const arrivals: number[] = [];
  let now = 0;
  let handedOver = false;
  bus.on('track:layer', () => {
    if (!handedOver) arrivals.push(now / 1000);
  });
  bus.on('track:new', () => {
    handedOver = true;
  });
  const builder = new TrackBuilder(store, bus, undefined, seed);
  const music = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0 };
  const region = { ...zoneAffinity({ x: 0, y: 20, z: 0 }), [world]: 1 };
  while (now < 300_000) {
    now += 1000 / 30;
    builder.tick(now, music, { velocity, hz: 220, energy: 0.5, altitude: 60 } as never, region as never);
  }
  return arrivals.length >= 7 ? arrivals[6]! : null;
}

describe('every world finishes a track, at a cruise, on any seed', () => {
  for (const world of SECTORS) {
    it(`${world} completes its seven layers`, () => {
      for (const seed of SEEDS) {
        const at = secondsToFullTrack(world, seed, CRUISE);
        expect(at, `${world} seed ${seed}`).not.toBeNull();
        // Two and a half minutes of cruising is the outer edge of "a track".
        expect(at!, `${world} seed ${seed}`).toBeLessThan(150);
      }
    });
  }

  it('keeps every world within reach of the others', () => {
    // Not identical — the shapes differ on purpose — but no world may take
    // twice as long as another to say what it has to say.
    const times = SECTORS.map((w) => secondsToFullTrack(w, 'a', CRUISE)!);
    expect(Math.max(...times) / Math.min(...times)).toBeLessThan(2);
  });

  it('gives each world its own shape, not one shape at six speeds', () => {
    // The curves were identical numbers for three of the six worlds; the only
    // thing that differed was how far WORLD_PACE stretched them.
    const shapes = SECTORS.map((w) => {
      const curve = curveFor(w);
      return curve.map((t) => (t / curve[curve.length - 1]!).toFixed(2)).join(',');
    });
    expect(new Set(shapes).size).toBe(SECTORS.length);
  });
});

describe('staying somewhere goes deeper, not around in a circle', () => {
  it('keeps the genre and moves the key from track to track', () => {
    // §187: the related key a finished track hands over used to survive exactly
    // one tick — the player's resting 220 Hz stamped the root back to A every
    // tick, so a whole journey sat in one key. A steady tone is not a choice.
    const store = createStore<TrackState>(createInitialTrackState());
    const bus = createEventBus<TrackEvents>();
    const roots: number[] = [];
    const genres: (string | null)[] = [];
    bus.on('track:new', () => {
      roots.push(store.getState().rootMidi);
      genres.push(store.getState().genre);
    });
    const builder = new TrackBuilder(store, bus, undefined, 'sleutelreis');
    const music = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0 };
    const region = { ...zoneAffinity({ x: 0, y: 20, z: 0 }), 'locked-groove': 1 };
    let now = 0;
    while (now < 300_000 && roots.length < 2) {
      now += 1000 / 30;
      builder.tick(now, music, { velocity: 60, hz: 220, energy: 0.5, altitude: 60 } as never, region as never);
    }
    expect(roots.length).toBeGreaterThanOrEqual(2);
    expect(genres.every((g) => g === 'locked-groove')).toBe(true);
    expect(roots[1]).not.toBe(roots[0]);
    // …and the second key survives being HELD, not just being announced: a
    // hundred more ticks at the same steady tone must not stamp it back.
    const held = store.getState().rootMidi;
    for (let i = 0; i < 100; i++) {
      now += 1000 / 30;
      builder.tick(now, music, { velocity: 60, hz: 220, energy: 0.5, altitude: 60 } as never, region as never);
    }
    expect(store.getState().rootMidi).toBe(held);
  });
});

describe('§188 the machine world leads with its pulse', () => {
  it('never makes you wait past the second rung for the kick, on any journey', () => {
    // The draw is free everywhere else; here the grammar binds it. Measured
    // before: 8 of 40 journeys put the kick third or fourth — most of a minute
    // of the machine world with no machine at a cruise.
    for (let i = 0; i < 60; i++) {
      for (let track = 1; track <= 4; track++) {
        const form = formFor(`journey-${i}`, 'locked-groove', track);
        expect(form.order.indexOf('kick'), `journey-${i} track ${track}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('still varies the rest of the order from track to track', () => {
    // The rule must not collapse the draw into one fixed opening.
    const orders = new Set<string>();
    for (let track = 1; track <= 8; track++) {
      orders.add(formFor('journey-vast', 'locked-groove', track).order.join('>'));
    }
    expect(orders.size).toBeGreaterThan(4);
  });
});
