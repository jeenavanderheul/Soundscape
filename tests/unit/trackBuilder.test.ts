import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
}));

import { buildLayerGraph } from '../../src/audio/MusicalPrimitives';
import { buildPatternCode } from '../../src/audio/StrudelEngine';
import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { createInitialMusicState } from '../../src/music/MusicState';
import { TrackBuilder } from '../../src/music/TrackBuilder';
import { createInitialTrackState, TrackEvents } from '../../src/music/TrackState';

function setup() {
  const store = createStore(createInitialTrackState());
  const bus = createEventBus<TrackEvents>();
  const unlocked: string[] = [];
  bus.on('track:layer', ({ layer }) => unlocked.push(layer));
  const builder = new TrackBuilder(store, bus);
  const music = { ...createInitialMusicState(), bpm: 128, tempoConfidence: 0.6 };
  return { store, builder, unlocked, music };
}

describe('TrackBuilder (§29.3, lenient: intent counts)', () => {
  it('unlocks KICK after three low-register actions, then HAT, then SNARE', () => {
    const { store, builder, unlocked, music } = setup();
    // three low pulses within the window
    for (let i = 0; i < 3; i++) builder.onAction({ atMs: i * 500, hz: 110, amplitude: 0.6, release: false });
    builder.tick(1600, music);
    expect(store.getState().drums.kick.unlocked).toBe(true);
    expect(unlocked).toEqual(['kick']);
    // hats need the kick first — high actions
    for (let i = 0; i < 3; i++) builder.onAction({ atMs: 2000 + i * 400, hz: 900, amplitude: 0.5, release: false });
    builder.tick(3300, music);
    expect(store.getState().drums.hats.unlocked).toBe(true);
    // snare: two strong wind releases
    builder.onAction({ atMs: 4000, hz: 400, amplitude: 0.8, release: true });
    builder.onAction({ atMs: 4500, hz: 400, amplitude: 0.9, release: true });
    builder.tick(4600, music);
    expect(store.getState().drums.snare.unlocked).toBe(true);
    expect(unlocked).toEqual(['kick', 'hats', 'snare']);
  });

  it('does not unlock hats or snare before the kick (ladder order §29.2)', () => {
    const { store, builder, music } = setup();
    for (let i = 0; i < 4; i++) builder.onAction({ atMs: i * 300, hz: 900, amplitude: 0.9, release: true });
    builder.tick(1500, music);
    expect(store.getState().drums.hats.unlocked).toBe(false);
    expect(store.getState().drums.snare.unlocked).toBe(false);
  });

  it('forgets stale intent outside the window', () => {
    const { store, builder, music } = setup();
    builder.onAction({ atMs: 0, hz: 100, amplitude: 0.5, release: false });
    builder.onAction({ atMs: 200, hz: 100, amplitude: 0.5, release: false });
    builder.tick(20_000, music); // window passed, only future actions count
    builder.onAction({ atMs: 20_100, hz: 100, amplitude: 0.5, release: false });
    builder.tick(20_200, music);
    expect(store.getState().drums.kick.unlocked).toBe(false);
  });
});

describe('graph from TrackState (§29.3 ghost → kick → clap)', () => {
  const music = { ...createInitialMusicState(), bpm: 128, tempoConfidence: 0.6, rhythmDensity: 1 };

  it('keeps the pulse a ghost before the kick unlocks', () => {
    const track = createInitialTrackState();
    const graph = buildLayerGraph(music, undefined, [], track);
    const pulse = graph.layers.drums.primitives.find((p) => p.id === 'pulse')!;
    expect(pulse.parameters['gain']).toBeLessThanOrEqual(0.25);
  });

  it('brings the kick in at full weight once unlocked, and adds the backbeat clap', () => {
    const track = createInitialTrackState();
    track.drums.kick = { unlocked: true, level: 1 };
    track.drums.snare = { unlocked: true, level: 1 };
    const graph = buildLayerGraph(music, undefined, [], track);
    const pulse = graph.layers.drums.primitives.find((p) => p.id === 'pulse')!;
    expect(pulse.parameters['gain']).toBeGreaterThanOrEqual(0.8);
    const code = buildPatternCode(graph);
    expect(code).toContain('[~ cp ~ cp]');
  });
});
