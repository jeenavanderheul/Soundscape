import { describe, expect, it } from 'vitest';
import { buildLayerGraph } from '../../src/audio/MusicalPrimitives';
import { scoreAmbient } from '../../src/genres/AmbientProfile';
import { scoreTechno } from '../../src/genres/TechnoProfile';
import { createInitialMusicState, GenreAffinity, MusicState } from '../../src/music/MusicState';

function ambientState(): MusicState {
  return {
    ...createInitialMusicState(),
    durationAverage: 0.9,
    spatiality: 0.9,
    dynamics: 0.6,
    transientDensity: 0.05,
    repetition: 0.05,
    timbreBrightness: 0.1,
    bpm: 0,
    tempoConfidence: 0,
  };
}

const affinity = (ambient: number, techno = 0): GenreAffinity => ({
  techno,
  ambient,
  jazz: 0,
  dnb: 0,
  experimental: 0,
});

describe('scoreAmbient (§9.2)', () => {
  it('scores high for sustained, slow, soft, transient-free sound', () => {
    expect(scoreAmbient(ambientState())).toBeGreaterThan(0.5);
  });

  it('scores a techno-like state low, and the two attractors oppose', () => {
    const techno: MusicState = {
      ...createInitialMusicState(),
      bpm: 130,
      tempoConfidence: 0.9,
      rhythmicRegularity: 0.95,
      repetition: 0.9,
      lowEndEnergy: 0.7,
      timbreBrightness: 0.6,
      transientDensity: 0.6,
      durationAverage: 0.1,
      spatiality: 0.2,
    };
    expect(scoreAmbient(techno)).toBeLessThan(0.25);
    expect(scoreTechno(techno)).toBeGreaterThan(scoreAmbient(techno));
    const ambient = ambientState();
    expect(scoreAmbient(ambient)).toBeGreaterThan(scoreTechno(ambient));
  });

  it('gates on duration: silence scores ~0 even when still and soft', () => {
    const silent = { ...ambientState(), durationAverage: 0, dynamics: 0 };
    expect(scoreAmbient(silent)).toBeLessThan(0.05);
  });
});

describe('buildLayerGraph ambient drone (§9.2, §11)', () => {
  it('adds a tempo-less drone at high ambient affinity', () => {
    // dynamics below the heartbeat threshold: this is the truly still path
    const graph = buildLayerGraph({ ...ambientState(), dynamics: 0.1 }, affinity(0.8));
    const atmosphere = graph.layers.atmosphere.primitives;
    expect(atmosphere).toHaveLength(1);
    expect(atmosphere[0]!.kind).toBe('drone');
    expect(graph.bpm).toBe(60);
  });

  it('stays silent without ambient affinity, tempo or movement', () => {
    const graph = buildLayerGraph({ ...ambientState(), dynamics: 0.1 }, affinity(0.2));
    expect(Object.values(graph.layers).every((layer) => layer.primitives.length === 0)).toBe(true);
  });

  it('keeps the drone alongside a confident techno pulse (genres overlap, §9)', () => {
    const state: MusicState = { ...ambientState(), bpm: 126, tempoConfidence: 0.9, rhythmDensity: 1 };
    const graph = buildLayerGraph(state, affinity(0.6, 0.6));
    expect(graph.layers.atmosphere.primitives).toHaveLength(1);
    expect(graph.layers.drums.primitives.length).toBeGreaterThan(0);
  });
});
