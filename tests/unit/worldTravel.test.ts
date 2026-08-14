import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { genreGrammar } from '../../src/audio/MusicalPrimitives';
import { ladderFor, layerUnlocked } from '../../src/music/GenreLadder';
import { performanceFrom } from '../../src/music/Performance';
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

/**
 * §56: where the player counts as being is the direction they are FLYING —
 * the same heading the HUD's `flying:` line reads, so the two can never
 * disagree. Distance from spawn still gates it.
 */
function headingOf(direction: { x: number; z: number }): number {
  return Math.atan2(direction.x, -direction.z);
}
function regionFlying(position: { x: number; z: number }, direction: { x: number; z: number }) {
  return dominantZone(zoneAffinity({ ...position, y: 6 }, headingOf(direction)), 0.4);
}

/** Ten readable compass labels mapped onto two world halves. */
const STEP = (Math.PI * 2) / 10;
const dirAt = (index: number) => ({ x: Math.sin(STEP * index), z: -Math.cos(STEP * index) });
const COMPASS = {
  N: dirAt(0),
  NNE: dirAt(1),
  ENE: dirAt(2),
  ESE: dirAt(3),
  SSE: dirAt(4),
  S: dirAt(5),
  SSW: dirAt(6),
  WSW: dirAt(7),
  WNW: dirAt(8),
  NNW: dirAt(9),
} as const;

const EXPECTED = {
  N: 'techno',
  NNE: 'techno',
  ENE: 'techno',
  ESE: 'sub-pressure',
  SSE: 'sub-pressure',
  S: 'sub-pressure',
  SSW: 'sub-pressure',
  WSW: 'sub-pressure',
  WNW: 'techno',
  NNW: 'techno',
} as const;

describe('the journey: neutral start → a direction → that world', () => {
  it('starts in the void: no direction has been chosen yet', () => {
    expect(dominantZone(zoneAffinity({ x: 0, y: 6, z: 0 }), 0.4)).toBeNull();
    expect(placeName(null)).toBe('the void');
  });

  it('every compass direction leads to one of the two world halves', () => {
    for (const [point, direction] of Object.entries(COMPASS)) {
      // Far enough out of the neutral middle that a direction counts (§34).
      const region = regionFlying({ x: 0, z: 70 }, direction);
      expect(`${point}:${region}`).toBe(`${point}:${EXPECTED[point as keyof typeof EXPECTED]}`);
    }
  });

  it('turning from one world towards another arrives in the new one', () => {
    const deepInTechno = { x: 0, z: -120 };
    expect(regionFlying(deepInTechno, COMPASS.N)).toBe('techno');
    expect(regionFlying(deepInTechno, COMPASS.NNW)).toBe('techno');
    expect(regionFlying(deepInTechno, COMPASS.NNE)).toBe('techno');
    expect(regionFlying(deepInTechno, COMPASS.S)).toBe('sub-pressure');
  });

  it('§56 what the HUD says you are flying into is what you are in', () => {
    const inSouth = { x: -200, z: 200 };
    expect(regionFlying(inSouth, COMPASS.S)).toBe('sub-pressure');
    expect(regionFlying(inSouth, COMPASS.N)).toBe('techno');
  });

  it('blends softly at the east/west border and never activates dormant genres', () => {
    const border = zoneAffinity({ x: 120, y: 6, z: 0 }, Math.PI / 2);
    expect(border.techno).toBeGreaterThan(0);
    expect(border['sub-pressure']).toBeGreaterThan(0);
    expect(border.ambient).toBe(0);
    expect(border.bass).toBe(0);
  });
});

describe('arriving somewhere new starts a track in that world', () => {
  function fly(region: 'techno' | 'sub-pressure', seconds: number, builder: TrackBuilder, from: number) {
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

    t = fly('sub-pressure', 8, builder, t + 250);
    expect(born).toEqual(['sub-pressure']);
    const pressureTrack = store.getState();
    expect(pressureTrack.genre).toBe('sub-pressure');
    expect(pressureTrack.bpm).toBe(Math.round(genreGrammar('sub-pressure').bpmCentre));
    expect(builder.trackNumber).toBe(2);
    // §58: you land on 1/7 of the new world, never on nothing — its first
    // rung is given the moment you arrive, so the crossing announces itself.
    const first = ladderFor('sub-pressure')[0]!.layer;
    expect(layerUnlocked(pressureTrack, first)).toBe(true);
  });

  it('§91 height is colour, not a tape: the track stays in tune and in time', () => {
    const music = createInitialMusicState();
    const high = performanceFrom(music, { altitude: 60, amplitude: 0, velocity: 20 });
    const low = performanceFrom(music, { altitude: 1, amplitude: 0, velocity: 20 });
    // Open and airy up there, dark and heavy down by the ground…
    expect(high.brightHz).toBeGreaterThan(low.brightHz);
    expect(low.weight).toBeGreaterThan(high.weight);
    // …and not one semitone or one beat of difference between them.
    expect(Object.keys(high)).not.toContain('transpose');
    expect(Object.keys(high)).not.toContain('tempoRatio');
  });

  it('and the sounds of that world come with it', () => {
    const pressure = genreGrammar('sub-pressure');
    const techno = genreGrammar('techno');
    expect(pressure.drumBank).not.toBe(techno.drumBank);
    expect(pressure.bpmCentre).not.toBe(techno.bpmCentre);
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
