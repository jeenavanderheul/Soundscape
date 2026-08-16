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
import {
  fixedFormFor,
  isPlayableOrder,
  STAGE_MAX_RUNGS,
  STAGE_MIN_RUNGS,
  stageRungs,
  TRACK_LAYERS,
} from '../../src/music/TrackForm';
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
  states: TrackState[];
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
  /** Keep every frame's full state — only worth the memory when asserted on. */
  keep?: boolean;
}): Run {
  const { world, velocity, seconds = 200, crossTo, crossAtSeconds = 0 } = options;
  const config = options.config ?? TRACK_BUILDER_CONFIG;
  const store = createStore<TrackState>(createInitialTrackState());
  const bus = createEventBus<TrackEvents>();
  const run: Run = {
    layers: [], states: [], forms: [], genres: [], newTracks: 0, order: [], secondsToFull: null,
  };
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
    if (options.keep === true) run.states.push(state);
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

  it('walks onto a stage that is already playing, never back to 1/7', () => {
    // The desktop rule is that a world IS a track (§53/§54), so arriving
    // somewhere else puts you back at 1/7 and starts the climb again. On a
    // phone that was most of what a player ever heard.
    const run = fly({
      world: 'locked-groove',
      crossTo: 'sub-pressure',
      crossAtSeconds: 25,
      velocity: 66,
      config: MOBILE_TRACK_PACING,
    });
    expect(run.newTracks).toBe(0);
    const after = run.layers.slice(Math.floor(25 * 30));
    // §208: the set you joined is somewhere in its middle — never at its start,
    // never already over.
    expect(Math.min(...after)).toBeGreaterThanOrEqual(STAGE_MIN_RUNGS);
    expect(run.genres[run.genres.length - 1]).toBe('sub-pressure');
    // …and from there it still builds to the end.
    expect(run.layers[run.layers.length - 1]).toBe(7);
  });

  it('makes the stage decide, even when you were further along', () => {
    // §208 (user decision): 6/7 walking into a stage at 4/7 hears 4/7. A set
    // that is always at least as far as your last one is not a set — it is your
    // own progress wearing six costumes.
    const seen = new Set<number>();
    for (const [i, at] of [20, 30, 40, 50, 60, 75, 90, 110, 140, 170].entries()) {
      const run = fly({
        world: 'locked-groove',
        crossTo: 'percussion-riot',
        crossAtSeconds: at,
        velocity: 66,
        config: MOBILE_TRACK_PACING,
        // §212: the draw is per (journey, crossing). Ten runs of the SAME
        // journey each make one crossing, so they must all land on the same
        // stage — that is the reproducibility, not a bug. Different journeys
        // are where the variety lives.
        seed: `reis-${i}`,
      });
      const arrived = run.layers[Math.floor(at * 30) + 2]!;
      seen.add(arrived);
      expect(arrived, `crossing at ${at}s`).toBeGreaterThanOrEqual(STAGE_MIN_RUNGS);
      expect(arrived, `crossing at ${at}s`).toBeLessThanOrEqual(STAGE_MAX_RUNGS);
      // Crossing at 170 s means you were long since at 7/7 — and you still
      // arrive on whatever THAT stage is playing, which is usually fewer.
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('draws every stage fresh, 3 through 7', () => {
    // §212 (user decision). §208 grew the number with the session, and in play
    // that read as no variation at all — the first minute is always 3, so every
    // world opened on three rungs and the festival was one tent six times.
    const seen = new Set<number>();
    for (let crossing = 1; crossing <= 60; crossing += 1) {
      const n = stageRungs('een-reis', crossing);
      expect(n).toBeGreaterThanOrEqual(STAGE_MIN_RUNGS);
      expect(n).toBeLessThanOrEqual(STAGE_MAX_RUNGS);
      seen.add(n);
    }
    // Every one of the five is reachable — including a set that is already whole.
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it('flies the same night twice from the same journey code', () => {
    // §128: the journey seed decides everything the journey draws, so a flight
    // that was good can be found again.
    const a = Array.from({ length: 20 }, (_, i) => stageRungs('reis-a', i + 1));
    const again = Array.from({ length: 20 }, (_, i) => stageRungs('reis-a', i + 1));
    expect(again).toEqual(a);
    const b = Array.from({ length: 20 }, (_, i) => stageRungs('reis-b', i + 1));
    expect(b).not.toEqual(a);
  });

  it('does not lean on any one number', () => {
    // Purely drawn (user decision) — two the same in a row is allowed, but the
    // spread has to be a spread, not a favourite with exceptions.
    const counts = new Map<number, number>();
    for (let i = 1; i <= 500; i += 1) {
      const n = stageRungs('spreiding', i);
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    for (const n of [3, 4, 5, 6, 7]) {
      // 100 expected out of 500; anything between half and double is a draw,
      // not a bias.
      expect(counts.get(n) ?? 0, `${n}/7 came up ${counts.get(n) ?? 0} times`).toBeGreaterThan(50);
      expect(counts.get(n) ?? 0, `${n}/7 came up ${counts.get(n) ?? 0} times`).toBeLessThan(200);
    }
  });

  it('drops what the new stage is not playing, and stands what it is', () => {
    // Arriving is not additive: you hear that stage's opening N rungs, whatever
    // you were carrying. Otherwise crossing would be a way to collect layers.
    const run = fly({
      world: 'sub-pressure',
      crossTo: 'percussion-riot',
      crossAtSeconds: 120,
      velocity: 66,
      config: MOBILE_TRACK_PACING,
      keep: true,
    });
    const arrived = run.states[Math.floor(120 * 30) + 2]!;
    const standing = new Set(
      (['kick', 'snare', 'hats'] as const).filter((k) => arrived.drums[k].unlocked) as string[],
    );
    for (const k of ['bass', 'harmony', 'melody', 'texture'] as const) {
      if (arrived[k].unlocked) standing.add(k);
    }
    const written = fixedFormFor('percussion-riot').order;
    expect([...standing].sort()).toEqual([...written.slice(0, standing.size)].sort());
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
