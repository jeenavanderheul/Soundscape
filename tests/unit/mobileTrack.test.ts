import { describe, expect, it } from 'vitest';

import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { SECTORS, zoneAffinity } from '../../src/genres/GenreZones';
import { ACTIVE_WORLD_GENRES } from '../../src/genres/ActiveWorlds';
import { createInitialMusicState } from '../../src/music/MusicState';
import { sectionMix } from '../../src/music/ArrangementEngine';
import {
  MOBILE_TRACK_PACING,
  TrackBuilder,
  TRACK_BUILDER_CONFIG,
} from '../../src/music/TrackBuilder';
import { fixedFormFor, isPlayableOrder, TRACK_LAYERS } from '../../src/music/TrackForm';
import {
  createInitialTrackState,
  type TrackEvents,
  type TrackState,
} from '../../src/music/TrackState';

/**
 * §207 (user decision): ON A PHONE THE MECHANICS GET OUT OF THE WAY.
 *
 * One build, 1/7 to 7/7, in the world's own fixed order, that never restarts
 * and never loses what it has earned. Four desktop rules are overruled and each
 * one is asserted here, because every one of them is load-bearing on a desk:
 *
 *   §128 a fresh order per track      -> one fixed order per world
 *   §42  the build stops at rest      -> the clock always runs, speed sets how fast
 *   §53  a world is a track           -> crossing recolours, never resets
 *   §95  the arc breathes after DEEP  -> at 7/7 nothing is taken away again
 *
 * The desktop keeps all four, and that is asserted too.
 */

const layersOf = (t: Readonly<TrackState>): number =>
  (['kick', 'snare', 'hats'] as const).filter((k) => t.drums[k].unlocked).length
  + (['bass', 'harmony', 'melody', 'texture'] as const).filter((k) => t[k].unlocked).length;

interface Run {
  layers: number[];
  forms: string[];
  genres: (string | null)[];
  newTracks: number;
  order: string[];
  secondsToFull: number | null;
}

function fly(options: {
  world: string;
  velocity: number;
  seconds?: number;
  crossTo?: string;
  crossAtSeconds?: number;
  config?: typeof TRACK_BUILDER_CONFIG;
  seed?: string;
}): Run {
  const { world, velocity, seconds = 200, crossTo, crossAtSeconds = 0 } = options;
  const config = options.config ?? TRACK_BUILDER_CONFIG;
  const store = createStore<TrackState>(createInitialTrackState());
  const bus = createEventBus<TrackEvents>();
  const run: Run = { layers: [], forms: [], genres: [], newTracks: 0, order: [], secondsToFull: null };
  bus.on('track:new', () => {
    run.newTracks += 1;
  });
  bus.on('track:layer', ({ layer }) => run.order.push(layer));
  const builder = new TrackBuilder(store, bus, config, options.seed ?? 'telefoon');
  const music = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0 };
  const at = (w: string) => ({ ...zoneAffinity({ x: 0, y: 20, z: 0 }), [w]: 1 }) as never;
  let now = 0;
  while (now < seconds * 1000) {
    now += 1000 / 30;
    const here = crossTo !== undefined && now >= crossAtSeconds * 1000 ? crossTo : world;
    builder.tick(now, music, { velocity, hz: 220, energy: 0.5, altitude: 60 } as never, at(here));
    const state = store.getState();
    run.layers.push(layersOf(state));
    run.forms.push(state.form);
    run.genres.push(state.genre);
    if (run.secondsToFull === null && layersOf(state) === 7) run.secondsToFull = now / 1000;
  }
  return run;
}

describe('§207 one build, seven layers, in the order the world is written', () => {
  it('gives every world a fixed order that the grammar accepts', () => {
    for (const genre of ACTIVE_WORLD_GENRES) {
      const form = fixedFormFor(genre);
      expect(isPlayableOrder(form.order, genre), genre).toBe(true);
      expect([...form.order].sort(), genre).toEqual([...TRACK_LAYERS].sort());
    }
  });

  it('plays that order and no other, on every journey', () => {
    // The point of a fixed order is that it is the SAME every time — a player
    // on a phone gets two minutes, and has to be able to learn the world.
    for (const world of SECTORS) {
      const written = fixedFormFor(world).order.join('>');
      for (const seed of ['reis-1', 'reis-2', 'heel-anders']) {
        const run = fly({ world, velocity: 66, config: MOBILE_TRACK_PACING, seed });
        expect(run.order.slice(0, 7).join('>'), `${world} ${seed}`).toBe(written);
      }
    }
  });

  it('reaches 7/7 in every world and never counts backwards', () => {
    for (const world of SECTORS) {
      const run = fly({ world, velocity: 66, config: MOBILE_TRACK_PACING });
      expect(run.secondsToFull, world).not.toBeNull();
      for (let i = 1; i < run.layers.length; i += 1) {
        expect(run.layers[i]!, `${world} at ${i}`).toBeGreaterThanOrEqual(run.layers[i - 1]!);
      }
    }
  });

  it('keeps building while the thumb is off the screen', () => {
    // §42 stops the build at rest, which on a phone is most of a session. It
    // still has to be SLOWER standing still than flying — speed decides how
    // fast, not whether.
    const still = fly({ world: 'locked-groove', velocity: 0, config: MOBILE_TRACK_PACING });
    const flown = fly({ world: 'locked-groove', velocity: 66, config: MOBILE_TRACK_PACING });
    expect(still.secondsToFull).not.toBeNull();
    expect(flown.secondsToFull!).toBeLessThan(still.secondsToFull!);
  });

  it('recolours on a crossing instead of starting over', () => {
    // The desktop rule is that a world IS a track (§53/§54), so arriving
    // somewhere else puts you back at 1/7. On a phone that was most of what a
    // player ever heard.
    const run = fly({
      world: 'locked-groove',
      crossTo: 'sub-pressure',
      crossAtSeconds: 25,
      velocity: 66,
      config: MOBILE_TRACK_PACING,
    });
    expect(run.newTracks).toBe(0);
    const atCross = run.layers[Math.floor(25 * 30)]!;
    expect(atCross).toBeGreaterThan(0);
    expect(Math.min(...run.layers.slice(Math.floor(25 * 30)))).toBeGreaterThanOrEqual(atCross);
    expect(run.genres[run.genres.length - 1]).toBe('sub-pressure');
    expect(run.layers[run.layers.length - 1]).toBe(7);
  });

  it('takes nothing away once all seven are standing', () => {
    // The phase after the seventh rung lands is `break`: drums to 0.4, bass to
    // 0.35 — the bottom leaving exactly when the track is finally whole.
    const run = fly({ world: 'locked-groove', velocity: 66, config: MOBILE_TRACK_PACING });
    const completeAt = run.layers.indexOf(7);
    expect(completeAt).toBeGreaterThan(0);
    // The requirement is not that the phase has a particular NAME — it is that
    // no phase reached after 7/7 turns any earned layer down. (The completing
    // tick still reads `deep`, because the count is taken before the rung
    // lands; `deep` also holds all four at full, so nothing is lost there.)
    for (const form of new Set(run.forms.slice(completeAt))) {
      const mix = sectionMix(form as 'return', 'driven');
      expect(mix.drums, form).toBe(1);
      expect(mix.bass, form).toBe(1);
      expect(mix.harmony, form).toBe(1);
      expect(mix.melody, form).toBe(1);
    }
    // …and the phase it must never reach is the one that thins the bottom out.
    expect(run.forms.slice(completeAt)).not.toContain('break');
    expect(sectionMix('break', 'driven').bass).toBeLessThan(0.5);
  });

  it('never hands the track over — what you built keeps playing', () => {
    const run = fly({ world: 'locked-groove', velocity: 66, seconds: 300, config: MOBILE_TRACK_PACING });
    expect(run.newTracks).toBe(0);
    expect(run.layers[run.layers.length - 1]).toBe(7);
  });

  it('leaves every one of those four rules standing on the desktop', () => {
    expect(TRACK_BUILDER_CONFIG.fixedOrderPerWorld).toBe(false);
    expect(TRACK_BUILDER_CONFIG.clockRunsAtRest).toBe(false);
    expect(TRACK_BUILDER_CONFIG.keepsTrackAcrossWorlds).toBe(false);
    expect(TRACK_BUILDER_CONFIG.holdsFullMixWhenComplete).toBe(false);
    // Crossing still ends the track a desktop player was building…
    const crossed = fly({
      world: 'locked-groove',
      crossTo: 'sub-pressure',
      crossAtSeconds: 25,
      velocity: 66,
    });
    expect(crossed.newTracks).toBeGreaterThan(0);
    // …and the arc still breathes rather than parking at full.
    const long = fly({ world: 'locked-groove', velocity: 66, seconds: 300 });
    expect(new Set(long.forms).size).toBeGreaterThan(3);
  });
});
