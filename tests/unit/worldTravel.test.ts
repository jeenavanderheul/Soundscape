import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { genreGrammar } from '../../src/audio/MusicalPrimitives';
import { dominantZone, zoneAffinity } from '../../src/genres/GenreZones';
import { placeName } from '../../src/genres/ZonePalette';
import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { createInitialMusicState } from '../../src/music/MusicState';
import { TrackBuilder } from '../../src/music/TrackBuilder';
import { createInitialTrackState, type TrackEvents } from '../../src/music/TrackState';

/**
 * The journey the game promises: start nowhere, choose a direction, arrive in
 * that world, and hear it. This is an end-to-end check of §34, §47 and §53
 * together, because each of them was correct on its own while the journey was
 * broken.
 */

/** Where the player counts as being — a little ahead while moving (§53). */
const LOOKAHEAD = 400;
function here(position: { x: number; z: number }, direction: { x: number; z: number }, speed = 13) {
  const reach = Math.min(1, speed / 8) * LOOKAHEAD;
  return {
    x: position.x + direction.x * reach,
    y: 6,
    z: position.z + direction.z * reach,
  };
}

const COMPASS = {
  N: { x: 0, z: -1 },
  NE: { x: Math.SQRT1_2, z: -Math.SQRT1_2 },
  E: { x: 1, z: 0 },
  SE: { x: Math.SQRT1_2, z: Math.SQRT1_2 },
  S: { x: 0, z: 1 },
  SW: { x: -Math.SQRT1_2, z: Math.SQRT1_2 },
  W: { x: -1, z: 0 },
  NW: { x: -Math.SQRT1_2, z: -Math.SQRT1_2 },
} as const;

const EXPECTED = {
  N: 'techno',
  NE: 'garage',
  E: 'jazz',
  SE: 'house',
  S: 'ambient',
  SW: 'classical',
  W: 'dnb',
  NW: 'trap',
} as const;

describe('the journey: neutral start → a direction → that world', () => {
  it('starts in the void: no direction has been chosen yet', () => {
    expect(dominantZone(zoneAffinity({ x: 0, y: 6, z: 0 }), 0.4)).toBeNull();
    expect(placeName(null)).toBe('the void');
  });

  it('every compass direction leads to its own world', () => {
    for (const [point, direction] of Object.entries(COMPASS)) {
      const region = dominantZone(zoneAffinity(here({ x: 0, z: 0 }, direction)), 0.4);
      expect(`${point}:${region}`).toBe(`${point}:${EXPECTED[point as keyof typeof EXPECTED]}`);
    }
  });

  it('turning from one world towards another arrives in the new one', () => {
    const deepInTechno = { x: 0, z: -120 };
    expect(dominantZone(zoneAffinity({ ...deepInTechno, y: 6 }), 0.4)).toBe('techno');
    expect(dominantZone(zoneAffinity(here(deepInTechno, COMPASS.NW)), 0.4)).toBe('trap');
    expect(dominantZone(zoneAffinity(here(deepInTechno, COMPASS.NE)), 0.4)).toBe('garage');
  });
});

describe('arriving somewhere new starts a track in that world', () => {
  function fly(region: 'techno' | 'trap', seconds: number, builder: TrackBuilder, from: number) {
    // No tapped rhythm: the region decides the tempo (§46). With a confident
    // player tempo the player would win, which is the whole point of §3.4.
    const music = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0, dynamics: 0.6 };
    const affinity = { ...zoneAffinity({ x: 0, y: 6, z: 0 }), [region]: 1 };
    for (let t = from; t <= from + seconds * 1000; t += 250) {
      builder.tick(t, music, { velocity: 13, hz: 220, energy: 0.5, altitude: 8 }, affinity);
    }
    return from + seconds * 1000;
  }

  it('flying into another world ends the old track and starts one there', () => {
    const store = createStore(createInitialTrackState());
    const bus = createEventBus<TrackEvents>();
    const born: (string | null)[] = [];
    bus.on('track:new', () => born.push(store.getState().genre));
    const builder = new TrackBuilder(store, bus);

    let t = fly('techno', 20, builder, 0);
    expect(store.getState().genre).toBe('techno');
    const technoTrack = store.getState();
    expect(technoTrack.drums.kick.unlocked).toBe(true);

    // Head north-west and stay: within a couple of seconds this is a trap
    // track, carrying what was already earned.
    t = fly('trap', 8, builder, t + 250);
    expect(born).toEqual(['trap']);
    const trapTrack = store.getState();
    expect(trapTrack.genre).toBe('trap');
    // Earned from nothing again, in trap's own order and at trap's own tempo.
    expect(trapTrack.bpm).toBe(genreGrammar('trap').bpmCentre);
    expect(builder.trackNumber).toBe(2);
    // You hear the new world at once: the kick you earned is now a trap kick.
    expect(trapTrack.drums.kick.unlocked).toBe(true);
  });

  it('and the sounds of that world come with it', () => {
    const trap = genreGrammar('trap');
    const techno = genreGrammar('techno');
    expect(trap.drumBank).not.toBe(techno.drumBank);
    expect(trap.kickStyle).not.toBe(techno.kickStyle);
    expect(trap.leadVoice).not.toBe(techno.leadVoice);
    expect(trap.bpmCentre).not.toBe(techno.bpmCentre);
  });
});

describe('staying is the trip: deeper into one world, endlessly', () => {
  it('deepens, varies and hands over to another track of the SAME world', () => {
    const store = createStore(createInitialTrackState());
    const bus = createEventBus<TrackEvents>();
    const born: (string | null)[] = [];
    const deepened: string[] = [];
    bus.on('track:new', () => born.push(store.getState().genre));
    bus.on('track:depth', ({ layer }) => deepened.push(layer));
    const builder = new TrackBuilder(store, bus);
    const music = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0, dynamics: 0.6 };
    const techno = { ...zoneAffinity({ x: 0, y: 6, z: 0 }), techno: 1 };

    const variations: string[] = [];
    // Six minutes in one world: climb, dive, climb, dive — the flight keeps
    // making form, and the world keeps answering with more of itself.
    for (let t = 0; t <= 360_000; t += 250) {
      const phase = Math.floor(t / 20_000) % 2 === 0 ? 6 : -6;
      builder.tick(
        t,
        music,
        { velocity: 30, hz: 220, energy: 0.7, altitude: 20, climb: phase },
        techno,
      );
      const shape = JSON.stringify(builder.variations);
      if (variations[variations.length - 1] !== shape) variations.push(shape);
    }

    // It never leaves the world…
    expect(born.length).toBeGreaterThan(0);
    expect(new Set(born)).toEqual(new Set(['techno']));
    expect(store.getState().genre).toBe('techno');
    // …it grows depth…
    expect(deepened.length).toBeGreaterThan(3);
    // …and it keeps rewriting its own parts, so it is never the same loop.
    expect(variations.length).toBeGreaterThan(6);
  });
});
