import { describe, expect, it } from 'vitest';
import { buildLayerGraph } from '../../src/audio/MusicalPrimitives';
import { bassTempoTendency, scoreBass } from '../../src/genres/BassProfile';
import { affinityConflict, scoreExperimental } from '../../src/genres/ExperimentalProfile';
import { scoreJazz } from '../../src/genres/JazzProfile';
import { createInitialMusicState, GenreAffinity, MusicState } from '../../src/music/MusicState';
import {
  createInitialProgression,
  isComposerUnlocked,
  recordGenre,
  recordResonance,
  recordStructure,
} from '../../src/progression/ProgressionState';
import { createResonanceEvent } from '../../src/resonance/ResonanceEvent';

const affinity = (partial: Partial<GenreAffinity>): GenreAffinity => ({
  techno: 0,
  'sub-pressure': 0,
  ambient: 0,
  jazz: 0,
  garage: 0,
  house: 0,
  trap: 0,
  breakbeat: 0,
  dub: 0,
  bass: 0,
  experimental: 0,
  ...partial,
});

describe('scoreJazz (§9.3)', () => {
  it('rewards syncopated, varied, melodic playing with a pulse', () => {
    const state: MusicState = {
      ...createInitialMusicState(),
      tempoConfidence: 0.8,
      syncopation: 0.7,
      variation: 0.6,
      melodicActivity: 0.5,
      repetition: 0.3,
    };
    expect(scoreJazz(state)).toBeGreaterThan(0.4);
  });

  it('scores a rigid techno grid low (no syncopation, high repetition)', () => {
    const state: MusicState = {
      ...createInitialMusicState(),
      tempoConfidence: 0.95,
      syncopation: 0.02,
      variation: 0.05,
      repetition: 0.95,
    };
    expect(scoreJazz(state)).toBeLessThan(0.1);
  });
});

describe('scoreBass (§9.4)', () => {
  it('rewards fast movement, transients, sub energy at ~172 BPM', () => {
    const state: MusicState = {
      ...createInitialMusicState(),
      spatiality: 0.1,
      transientDensity: 0.7,
      lowEndEnergy: 0.7,
      bpm: 170,
      tempoConfidence: 0.8,
    };
    expect(scoreBass(state)).toBeGreaterThan(0.5);
  });

  it('gates on velocity: a still player never drifts into DnB', () => {
    const state: MusicState = {
      ...createInitialMusicState(),
      spatiality: 1,
      transientDensity: 0.8,
      lowEndEnergy: 0.8,
      bpm: 172,
      tempoConfidence: 0.9,
    };
    expect(scoreBass(state)).toBe(0);
  });

  it('tempo tendency peaks near 172 and honors octave folding', () => {
    expect(bassTempoTendency(172)).toBeGreaterThan(bassTempoTendency(130));
    expect(bassTempoTendency(86)).toBeGreaterThan(0);
    expect(bassTempoTendency(0)).toBe(0);
  });
});

describe('scoreExperimental (§9.5)', () => {
  it('feeds on conflict between other attractors plus dissonance', () => {
    const state: MusicState = {
      ...createInitialMusicState(),
      dissonance: 0.7,
      variation: 0.5,
      timbreNoise: 0.4,
      dynamics: 0.5,
    };
    const conflicted = { techno: 0.5, ambient: 0.48, jazz: 0.1, bass: 0.1 };
    const clean = { techno: 0.9, ambient: 0.05, jazz: 0.02, bass: 0.02 };
    expect(scoreExperimental(state, conflicted)).toBeGreaterThan(
      scoreExperimental(state, clean),
    );
    expect(affinityConflict(conflicted)).toBeGreaterThan(affinityConflict(clean));
  });
});

describe('buildLayerGraph M7 layers', () => {
  const pulsed: MusicState = {
    ...createInitialMusicState(),
    bpm: 170,
    tempoConfidence: 0.9,
    rhythmDensity: 1,
    pitchCenter: 220,
  };

  it('rewrites the SAME kick per genre grammar (§29.5)', () => {
    const style = (a: Parameters<typeof buildLayerGraph>[1]) =>
      buildLayerGraph(pulsed, a).layers.drums.primitives.find((p) => p.id === 'pulse')!
        .parameters['style'];
    expect(style(affinity({ bass: 0.8 }))).toBe('hardgroove'); // §73
    expect(style(affinity({ jazz: 0.8 }))).toBe('swing');
    expect(style(affinity({ ambient: 0.8 }))).toBe('sparse');
    expect(style(affinity({ experimental: 0.8 }))).toBe('irregular');
    expect(style(affinity({ techno: 0.8 }))).toBe('machine') // §80;
  });

  it('stays neutral below the attractor threshold', () => {
    const graph = buildLayerGraph(pulsed, affinity({ bass: 0.3, jazz: 0.3, experimental: 0.3 }));
    expect(graph.layers.drums.primitives.find((p) => p.id === 'pulse')!.parameters['style']).toBe(
      'four',
    );
    expect(graph.layers.melody.primitives).toHaveLength(0);
    expect(graph.layers.texture.primitives).toHaveLength(0);
  });
});

describe('progression and composer reveal (§17)', () => {
  const event = (classification: 'harmonic' | 'dissonant' | 'amplification') =>
    createResonanceEvent({
      atMs: 0,
      sourceId: 'player',
      targetId: 'r1',
      sourceHz: 220,
      targetHz: 330,
      ratio: 1.5,
      consonance: 0.9,
      dissonance: 0.1,
      amplitude: 0.5,
      velocity: 0,
      phaseDifference: 0,
      sourceWaveform: 'sine',
      targetWaveform: 'sine',
      strength: 0.5,
      persistence: 0.2,
      classification,
    }, () => `e-${classification}`);

  it('unlocks only after 3 resonance classes, a structure and a genre', () => {
    let s = createInitialProgression();
    expect(isComposerUnlocked(s)).toBe(false);
    s = recordResonance(s, event('harmonic'));
    s = recordResonance(s, event('harmonic')); // duplicate class ignored
    s = recordResonance(s, event('dissonant'));
    s = recordResonance(s, event('amplification'));
    expect(isComposerUnlocked(s)).toBe(false);
    s = recordStructure(s, 1);
    expect(isComposerUnlocked(s)).toBe(false);
    s = recordGenre(s, 'techno');
    expect(isComposerUnlocked(s)).toBe(true);
    expect(s.resonanceClassesSeen).toHaveLength(3);
    expect(s.permanentStructures).toBe(1);
  });
});
