import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { createRng } from '../../src/core/rng';
import { zoneAffinity } from '../../src/genres/GenreZones';
import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { beaconAt, beaconIsStale, placeBeacon, remainingLayers } from '../../src/world/LayerBeacons';
import { ladderFor } from '../../src/music/GenreLadder';
import { TrackBuilder } from '../../src/music/TrackBuilder';
import { createInitialMusicState } from '../../src/music/MusicState';
import {
  createInitialTrackState,
  type TrackEvents,
  type TrackLayerName,
} from '../../src/music/TrackState';

/**
 * §86: the seven layers standing in the world. The ladder keeps deciding the
 * ORDER; the beacon decides the MOMENT — and the moment is yours.
 */
describe('a beacon is the next rung, standing somewhere you have to fly to', () => {
  const here = { x: 0, y: 10, z: 0 };

  it('offers the ladder in order, and nothing that is already earned', () => {
    const track = { ...createInitialTrackState(), genre: 'techno' as const };
    expect(remainingLayers(track, 'techno')).toEqual(ladderFor('techno').map((s) => s.layer));
    track.drums.kick = { unlocked: true, level: 0.5 };
    expect(remainingLayers(track, 'techno')).not.toContain('kick');
  });

  it('stands ahead of the flight but never straight ahead', () => {
    const rng = createRng('beacons');
    const beacon = placeBeacon(ladderFor('techno')[0]!.layer, here, 0, rng, 1)!;
    expect(beacon.layer).toBe(ladderFor('techno')[0]!.layer);
    // Ahead: heading 0 is -z.
    expect(beacon.position.z).toBeLessThan(here.z);
    // …and off to one side, or you would collect it by not steering.
    expect(Math.abs(beacon.position.x)).toBeGreaterThan(0);
  });

  it('is nothing once every layer has been earned', () => {
    // §98: nothing is offered, so nothing stands out there.
    expect(placeBeacon(null, here, 0, createRng('beacons'), 1)).toBeNull();
  });

  it('is flown through, not walked past', () => {
    const beacon = { id: 'b', layer: 'kick' as const, position: { x: 0, y: 10, z: -50 }, radius: 9 };
    expect(beaconAt([beacon], { x: 0, y: 10, z: -45 })).toBe(beacon);
    expect(beaconAt([beacon], { x: 0, y: 10, z: -20 })).toBeNull();
  });

  it('and is gone once the flight has left it far behind', () => {
    const beacon = { id: 'b', layer: 'kick' as const, position: { x: 0, y: 10, z: -50 }, radius: 9 };
    expect(beaconIsStale(beacon, { x: 0, y: 10, z: -60 })).toBe(false);
    expect(beaconIsStale(beacon, { x: 0, y: 10, z: 900 })).toBe(true);
  });
});

describe('flying through one earns that layer, there and then', () => {
  function setup() {
    const store = createStore(createInitialTrackState());
    const bus = createEventBus<TrackEvents>();
    const earned: string[] = [];
    bus.on('track:layer', ({ layer }) => earned.push(layer));
    const builder = new TrackBuilder(store, bus);
    // Nothing has landed yet, so the first rung is not made to wait (§82).
    return { store, builder, earned };
  }

  it('gives the rung the moment it is collected — once the arc has opened it', () => {
    const { builder } = setup();
    // §98: before its phase, the world offers nothing and there is no beacon.
    expect(builder.offeredLayer()).toBeNull();
    // §100: the opening rung is given on arrival, so what a beacon offers is
    // the SECOND rung onwards — reached once DISCOVERY II opens.
    const music = { ...createInitialMusicState(), bpm: 132, tempoConfidence: 0.6, dynamics: 0.5 };
    const region = { ...zoneAffinity({ x: 0, y: 6, z: 0 }), techno: 1 };
    for (let t = 0; t <= 46_000; t += 250) {
      builder.tick(t, music, { velocity: 12, hz: 220, energy: 0.4 }, region);
    }
    const offered = builder.offeredLayer();
    expect(offered).not.toBeNull();
    expect(builder.collectBeacon(offered!, 46_500)).toBe(true);
  });

  it('but never out of order — the world is still assembled by its ladder', () => {
    const { store, builder } = setup();
    const ladder = ladderFor(store.getState().genre).map((s) => s.layer);
    const outOfOrder = ladder[ladder.length - 1]!;
    expect(builder.collectBeacon(outOfOrder, 21_000)).toBe(false);
  });

  it('and never two on top of each other (§82)', () => {
    const { builder } = setup();
    const music = { ...createInitialMusicState(), bpm: 132, tempoConfidence: 0.6, dynamics: 0.5 };
    const region = { ...zoneAffinity({ x: 0, y: 6, z: 0 }), techno: 1 };
    for (let t = 0; t <= 46_000; t += 250) {
      builder.tick(t, music, { velocity: 12, hz: 220, energy: 0.4 }, region);
    }
    const first = builder.offeredLayer();
    if (first !== null) expect(builder.collectBeacon(first, 46_500)).toBe(true);
    const second = builder.offeredLayer();
    if (second !== null) expect(builder.collectBeacon(second, 46_600)).toBe(false);
  });
});

describe('§99 height is the mechanic, and you can see it', () => {
  const here = { x: 0, y: 20, z: 0 };
  const heightOf = (layer: TrackLayerName) =>
    placeBeacon(layer, here, 0, createRng(`h-${layer}`), 1)!.position.y;

  it('puts the mass on the deck and the detail in the open air', () => {
    // The register a layer occupies IS where you have to fly to get it.
    expect(heightOf('kick')).toBeLessThan(heightOf('snare'));
    expect(heightOf('bass')).toBeLessThan(heightOf('harmony'));
    expect(heightOf('harmony')).toBeLessThan(heightOf('hats'));
    expect(heightOf('hats')).toBeLessThan(heightOf('texture'));
  });

  it('spreads them far enough apart that climbing is a journey', () => {
    // Two rungs at opposite ends of the column, not a nudge on the stick.
    expect(heightOf('texture') - heightOf('kick')).toBeGreaterThan(45);
  });
});
