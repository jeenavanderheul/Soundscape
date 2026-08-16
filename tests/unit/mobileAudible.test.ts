import { describe, expect, it } from 'vitest';

import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { SECTORS, zoneAffinity } from '../../src/genres/GenreZones';
import { createInitialMusicState } from '../../src/music/MusicState';
import { buildWorldLayerGraph } from '../../src/audio/WorldLayerGraph';
import {
  MOBILE_TRACK_PACING,
  TrackBuilder,
  TRACK_BUILDER_CONFIG,
} from '../../src/music/TrackBuilder';
import { fixedFormFor } from '../../src/music/TrackForm';
import {
  createInitialTrackState,
  LEVEL_EARNED,
  type TrackEvents,
  type TrackState,
} from '../../src/music/TrackState';

/**
 * §209: WHAT THE SCREEN SAYS YOU HAVE, YOU HEAR.
 *
 * Reported: 4/7 on a phone in locked groove with no kick and no melody, which
 * the desktop and the demo both play. Two causes, and the second one was mine.
 *
 * 1. LOCKED GROOVE ARRANGES ITSELF over 32 cycles (§110) — a voice sounds when
 *    the ladder has given it to you AND its own mask says this is its place.
 *    `signal` (the melody) is `<0!22 1!10>`: silent for the first 22 cycles. A
 *    phone's whole track is 46 s ≈ 26 cycles, and §205 shortened the ladder
 *    without shortening the document, so the melody was EARNED at cycle 13 and
 *    not due to sound for another nine. The five worlds with no masks never had
 *    this; the one world the report named is the one world that has them.
 *
 * 2. TWO CLOCKS DECIDED A RUNG. The ladder said the fourth was due; the arc
 *    (§92) had not reached the phase that allows a fourth. Measured: 3/7 at 0 s,
 *    then twenty-nine seconds of nothing, then four rungs in seventeen. §56 has
 *    one rule about this — one authority, never two.
 *
 * On a phone the ladder is now the whole arrangement, and it steps evenly.
 */

const busOf = (layer: string): string =>
  layer === 'kick' || layer === 'snare' || layer === 'hats' ? 'drums' : layer;

/** The seconds at which each of the seven rungs landed. */
function arrivals(world: string, config = MOBILE_TRACK_PACING, velocity = 66): number[] {
  const store = createStore<TrackState>(createInitialTrackState());
  const bus = createEventBus<TrackEvents>();
  const at: number[] = [];
  let now = 0;
  let handedOver = false;
  bus.on('track:new', () => {
    handedOver = true;
  });
  bus.on('track:layer', () => {
    if (!handedOver) at.push(now / 1000);
  });
  const builder = new TrackBuilder(store, bus, config, 'meting');
  const music = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0 };
  const region = { ...zoneAffinity({ x: 0, y: 20, z: 0 }), [world]: 1 };
  while (now < 240_000 && at.length < 7) {
    now += 1000 / 30;
    builder.tick(now, music, { velocity, hz: 220, energy: 0.5, altitude: 60 } as never, region as never);
  }
  return at;
}

/** A phone's track with the first `n` rungs of that world standing. */
function trackWith(world: string, n: number): TrackState {
  const order = fixedFormFor(world as 'locked-groove').order.slice(0, n);
  const standing = new Set<string>(order);
  const on = (yes: boolean) => ({ unlocked: yes, level: yes ? LEVEL_EARNED : 0 });
  return {
    ...createInitialTrackState(),
    bpm: 134,
    genre: world as 'locked-groove',
    form: 'build',
    drums: { kick: on(standing.has('kick')), snare: on(standing.has('snare')), hats: on(standing.has('hats')) },
    bass: on(standing.has('bass')),
    harmony: on(standing.has('harmony')),
    melody: on(standing.has('melody')),
    texture: on(standing.has('texture')),
  };
}

function graphFor(world: string, n: number, masks: boolean) {
  return buildWorldLayerGraph({
    music: { ...createInitialMusicState(), bpm: 134 },
    track: trackWith(world, n),
    motion: 1,
    energy: 0.5,
    masks,
  });
}

describe('§209 every step lands, and every landed step sounds', () => {
  for (const world of SECTORS) {
    it(`${world} reaches all seven, evenly spaced`, () => {
      const at = arrivals(world);
      expect(at.length, world).toBe(7);
      const gaps = at.slice(1).map((t, i) => t - at[i]!);
      const widest = Math.max(...gaps);
      const narrowest = Math.min(...gaps);
      // Even means even: no step may be twice another. Before this, locked
      // groove had a 29-second gap next to a 4-second one.
      expect(widest / narrowest, `${world} gaps ${gaps.map((g) => g.toFixed(1)).join(', ')}`)
        .toBeLessThan(1.5);
      expect(at[6]!, world).toBeLessThan(60);
    });
  }

  it('gives locked groove every voice it has earned, at every count', () => {
    // The heart of the report: 4/7 has to be four voices, not two.
    for (let n = 1; n <= 7; n += 1) {
      const graph = graphFor('locked-groove', n, false);
      const order = fixedFormFor('locked-groove').order.slice(0, n);
      for (const layer of order) {
        const bus = busOf(layer);
        const voices = graph.layers[bus as 'drums']?.primitives ?? [];
        expect(voices.length, `${n}/7 wants ${layer} on ${bus}`).toBeGreaterThan(0);
      }
    }
  });

  it('leaves no mask behind on a phone, and every one of them on a desk', () => {
    const phone = JSON.stringify(graphFor('locked-groove', 7, false));
    expect(phone).not.toContain('.mask(');
    const desk = JSON.stringify(graphFor('locked-groove', 7, true));
    expect(desk).toContain('.mask(');
    // Nothing else may differ: same voices, same count, only the arrangement.
    const count = (g: ReturnType<typeof graphFor>) =>
      Object.values(g.layers).reduce((n, l) => n + l.primitives.length, 0);
    expect(count(graphFor('locked-groove', 7, false))).toBe(count(graphFor('locked-groove', 7, true)));
  });

  it('never silences a layer the other five worlds have earned either', () => {
    // These never had masks — asserted so the fix cannot be undone by giving
    // one of them an arrangement of its own later.
    for (const world of SECTORS.filter((w) => w !== 'locked-groove')) {
      for (let n = 1; n <= 7; n += 1) {
        const graph = graphFor(world, n, false);
        for (const layer of fixedFormFor(world as 'sub-pressure').order.slice(0, n)) {
          const voices = graph.layers[busOf(layer) as 'drums']?.primitives ?? [];
          expect(voices.length, `${world} ${n}/7 wants ${layer}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('still runs slower standing still than flying', () => {
    const flown = arrivals('locked-groove', MOBILE_TRACK_PACING, 66);
    const still = arrivals('locked-groove', MOBILE_TRACK_PACING, 0);
    expect(still.length).toBe(7);
    expect(flown[6]!).toBeLessThan(still[6]!);
  });

  it('leaves the desktop with both its clocks and its document', () => {
    expect(TRACK_BUILDER_CONFIG.rungIntervalMs).toBe(0);
    expect(TRACK_BUILDER_CONFIG.arcGatesRungs).toBe(true);
    // The desktop build is deliberately UNEVEN — the curve's shape is what
    // makes a world feel like itself, and that is the thing a phone gives up.
    const at = arrivals('locked-groove', TRACK_BUILDER_CONFIG);
    const gaps = at.slice(1).map((t, i) => t - at[i]!);
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(1.5);
  });
});
