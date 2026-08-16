import { describe, expect, it } from 'vitest';

import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { SECTORS, zoneAffinity } from '../../src/genres/GenreZones';
import { curveFor } from '../../src/music/GenreLadder';
import { createInitialMusicState } from '../../src/music/MusicState';
import { TrackBuilder } from '../../src/music/TrackBuilder';
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
