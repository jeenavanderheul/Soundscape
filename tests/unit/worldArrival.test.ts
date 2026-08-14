import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { createInitialMusicState } from '../../src/music/MusicState';
import { TrackBuilder } from '../../src/music/TrackBuilder';
import { createInitialTrackState, type TrackEvents } from '../../src/music/TrackState';
import { zoneAffinity } from '../../src/genres/GenreZones';

/**
 * §125: flying through worlds at speed felt like nothing was happening. Two
 * reasons, and the first is the one you notice: a track born by TRAVELLING
 * only emitted `track:new`, so the world never announced its name. You saw
 * TRACK 02 and were never told where you had arrived.
 */
const WORLDS = ['techno', 'heavy-signal', 'broken-machine', 'sub-pressure', 'void-crusher', 'percussion-riot'];
const affinityFor = (genre: string) => ({ ...zoneAffinity({ x: 0, y: 6, z: 0 }), [genre]: 1 }) as never;

function sweep(holdMs: number, seconds = 60) {
  const store = createStore(createInitialTrackState());
  const bus = createEventBus<TrackEvents>();
  const announced: string[] = [];
  bus.on('track:genre', ({ genre }) => { if (genre) announced.push(genre); });
  const builder = new TrackBuilder(store, bus);
  const music = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0, dynamics: 0.5 };
  const worlds: string[] = [];
  let last = '';
  for (let t = 0; t <= seconds * 1000; t += 250) {
    builder.tick(t, music, { velocity: 132, hz: 220, energy: 0.6, altitude: 19 },
      affinityFor(WORLDS[Math.floor(t / holdMs) % WORLDS.length]!));
    const genre = store.getState().genre ?? '';
    if (genre !== last) { worlds.push(genre); last = genre; }
  }
  return { worlds, announced };
}

describe('arriving in a world says so', () => {
  it('announces every crossing, not just the first', () => {
    const { worlds, announced } = sweep(5000);
    expect(worlds.length).toBeGreaterThan(5);
    // Every world the land moved to was also named.
    expect(announced).toEqual(worlds);
  });

  it('a deliberate turn lands in about a second, even at full throttle', () => {
    // 3200 paced was 3.3s at speed, and below that a crossing did nothing —
    // sweeping felt broken rather than protected.
    const { worlds } = sweep(2000);
    expect(worlds.length).toBeGreaterThan(20);
  });

  it('but a twitch still cannot wipe a track', () => {
    const { worlds } = sweep(250, 20);
    expect(worlds.length).toBeLessThan(20);
  });
});
