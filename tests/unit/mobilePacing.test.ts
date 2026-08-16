import { describe, expect, it } from 'vitest';

import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { SECTORS, zoneAffinity } from '../../src/genres/GenreZones';
import { createInitialMusicState } from '../../src/music/MusicState';
import { MOBILE_TRACK_PACING, TrackBuilder, TRACK_BUILDER_CONFIG } from '../../src/music/TrackBuilder';
import { formFor } from '../../src/music/TrackForm';
import { ACTIVE_WORLD_GENRES } from '../../src/genres/ActiveWorlds';
import {
  createInitialTrackState,
  type TrackEvents,
  type TrackState,
} from '../../src/music/TrackState';

/**
 * §205: A PHONE HAS TO HEAR A WHOLE TRACK.
 *
 * Measured before this: seven layers of locked groove took 85 seconds of
 * uninterrupted full throttle and up to 155 on the slowest draw — fine with a
 * keyboard and a mouse, unreachable with one thumb that has to steer and let
 * go. Two things held it: the written ladder, and the ARC, which does not open
 * the seventh rung until phase `deep` at cycle 20 (§92). Shortening one
 * without the other changes nothing, so touch gets both written shorter.
 *
 * Nothing about the composition moves — same seven layers, same drawn order,
 * same grammar. Only how wide it is written.
 */

const SEEDS = ['a', 'b', 'c', 'd'];
/** One thumb on the flight zone IS full throttle — touch has no half-open W. */
const THUMB_DOWN = 66;
/** The unfair case: the thumb keeps coming off to steer and the speed decays. */
const THUMB_RESTLESS = 13;

function secondsToFullTrack(
  world: string,
  seed: string,
  velocity: number,
  config = TRACK_BUILDER_CONFIG,
): number | null {
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
  const builder = new TrackBuilder(store, bus, config, seed);
  const music = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0 };
  const region = { ...zoneAffinity({ x: 0, y: 20, z: 0 }), [world]: 1 };
  while (now < 300_000) {
    now += 1000 / 30;
    builder.tick(now, music, { velocity, hz: 220, energy: 0.5, altitude: 60 } as never, region as never);
  }
  return arrivals.length >= 7 ? arrivals[6]! : null;
}

describe('§205 a whole track fits in a phone-sized flight', () => {
  for (const world of SECTORS) {
    it(`${world} plays out complete inside a minute`, () => {
      for (const seed of SEEDS) {
        const at = secondsToFullTrack(world, seed, THUMB_DOWN, MOBILE_TRACK_PACING);
        expect(at, `${world} seed ${seed}`).not.toBeNull();
        expect(at!, `${world} seed ${seed}`).toBeLessThan(60);
      }
    });
  }

  it('still finishes when the thumb keeps coming off to steer', () => {
    // The honest worst case: speed decays every time you reposition, so the
    // paced clock spends most of the flight near its floor.
    for (const world of SECTORS) {
      const at = secondsToFullTrack(world, 'a', THUMB_RESTLESS, MOBILE_TRACK_PACING);
      expect(at, world).not.toBeNull();
      expect(at!, world).toBeLessThan(100);
    }
  });

  it('is meaningfully faster than the desktop writing, not a rounding change', () => {
    for (const world of SECTORS) {
      const phone = secondsToFullTrack(world, 'a', THUMB_DOWN, MOBILE_TRACK_PACING)!;
      const desk = secondsToFullTrack(world, 'a', THUMB_DOWN, TRACK_BUILDER_CONFIG)!;
      expect(phone, world).toBeLessThan(desk * 0.8);
    }
  });

  it('leaves the desktop writing exactly where it was', () => {
    // This is a phone affordance, not a retune of the game. If this fails,
    // something changed for everybody.
    expect(TRACK_BUILDER_CONFIG.curveScale).toBe(1);
    expect(TRACK_BUILDER_CONFIG.maxPaceScale).toBe(Infinity);
    expect(TRACK_BUILDER_CONFIG.cyclesPerPhase).toBe(4);
    for (const world of SECTORS) {
      const at = secondsToFullTrack(world, 'a', 13, TRACK_BUILDER_CONFIG);
      expect(at, world).not.toBeNull();
      expect(at!, world).toBeLessThan(150);
    }
  });

  it('never draws a slow burn on a phone', () => {
    // The draw is ±35% on top of the world's own patience, and the top of that
    // range is exactly the reading a phone never gets to the end of.
    for (let i = 0; i < 80; i += 1) {
      for (const genre of ACTIVE_WORLD_GENRES) {
        for (let track = 1; track <= 4; track += 1) {
          const form = formFor(`j${i}`, genre, track, MOBILE_TRACK_PACING.maxPaceScale);
          expect(form.paceScale, `${genre} ${track}`).toBeLessThanOrEqual(
            MOBILE_TRACK_PACING.maxPaceScale,
          );
        }
      }
    }
  });

  it('keeps the drawn order — a phone hears the same composition', () => {
    // Only the WIDTH is allowed to differ. If the order moved, a phone and a
    // laptop on the same journey code would be playing different tracks.
    for (let i = 0; i < 40; i += 1) {
      for (const genre of ACTIVE_WORLD_GENRES) {
        const desk = formFor(`j${i}`, genre, 1);
        const phone = formFor(`j${i}`, genre, 1, MOBILE_TRACK_PACING.maxPaceScale);
        expect(phone.order).toEqual(desk.order);
      }
    }
  });
});
