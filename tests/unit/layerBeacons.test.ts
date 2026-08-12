import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { createRng } from '../../src/core/rng';
import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { beaconAt, beaconIsStale, placeBeacon, remainingLayers } from '../../src/world/LayerBeacons';
import { ladderFor, nextStep } from '../../src/music/GenreLadder';
import { TrackBuilder } from '../../src/music/TrackBuilder';
import { createInitialTrackState, type TrackEvents } from '../../src/music/TrackState';

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
    const track = { ...createInitialTrackState(), genre: 'techno' as const };
    const rng = createRng('beacons');
    const beacon = placeBeacon(track, 'techno', here, 0, rng, 1)!;
    expect(beacon.layer).toBe(ladderFor('techno')[0]!.layer);
    // Ahead: heading 0 is -z.
    expect(beacon.position.z).toBeLessThan(here.z);
    // …and off to one side, or you would collect it by not steering.
    expect(Math.abs(beacon.position.x)).toBeGreaterThan(0);
  });

  it('is nothing once every layer has been earned', () => {
    const deep = { unlocked: true, level: 1 };
    const full = {
      ...createInitialTrackState(),
      genre: 'techno' as const,
      drums: { kick: deep, snare: deep, hats: deep },
      bass: deep, harmony: deep, melody: deep, texture: deep,
    };
    expect(placeBeacon(full, 'techno', here, 0, createRng('beacons'), 1)).toBeNull();
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

  it('gives the rung the moment it is collected', () => {
    const { store, builder } = setup();
    const next = nextStep(store.getState(), ladderFor(store.getState().genre))!.layer;
    expect(builder.collectBeacon(next, 21_000)).toBe(true);
  });

  it('but never out of order — the world is still assembled by its ladder', () => {
    const { store, builder } = setup();
    const ladder = ladderFor(store.getState().genre).map((s) => s.layer);
    const outOfOrder = ladder[ladder.length - 1]!;
    expect(builder.collectBeacon(outOfOrder, 21_000)).toBe(false);
  });

  it('and never two on top of each other (§82)', () => {
    const { store, builder } = setup();
    const ladder = ladderFor(store.getState().genre);
    const first = nextStep(store.getState(), ladder)!.layer;
    expect(builder.collectBeacon(first, 21_000)).toBe(true);
    const second = nextStep(store.getState(), ladder)!.layer;
    expect(builder.collectBeacon(second, 21_100)).toBe(false);
  });
});
