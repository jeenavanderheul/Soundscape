import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TRANSFORMS,
  buildLayerGraph,
  createEmptyLayerGraph,
  diffLayerGraph,
  hzToMidi,
  LAYER_NAMES,
  midiToNoteName,
  subNoteFromHz,
  TEMPO_CONFIDENCE_THRESHOLD,
  type MusicalLayerGraph,
} from '../../src/audio/MusicalPrimitives';
import { createInitialMusicState } from '../../src/music/MusicState';
import type { MusicState } from '../../src/music/MusicState';

function confidentState(overrides: Partial<MusicState> = {}): MusicState {
  return {
    ...createInitialMusicState(),
    bpm: 120,
    tempoConfidence: TEMPO_CONFIDENCE_THRESHOLD + 0.1,
    rhythmDensity: 0.5,
    pitchCenter: 220,
    ...overrides,
  };
}

describe('pitch helpers', () => {
  it('converts Hz to midi', () => {
    expect(hzToMidi(440)).toBeCloseTo(69);
    expect(hzToMidi(220)).toBeCloseTo(57);
  });

  it('converts midi to note names', () => {
    expect(midiToNoteName(33)).toBe('a1');
    expect(midiToNoteName(25)).toBe('c#1');
  });

  it('octave-reduces pitch center to a low sub note', () => {
    expect(subNoteFromHz(440)).toBe('a2');
    expect(subNoteFromHz(220)).toBe('a2');
    expect(subNoteFromHz(261.63)).toBe('c2');
  });

  it('falls back to a2 for invalid input', () => {
    expect(subNoteFromHz(Number.NaN)).toBe('a2');
    expect(subNoteFromHz(0)).toBe('a2');
    expect(subNoteFromHz(-5)).toBe('a2');
  });
});

describe('buildLayerGraph', () => {
  it('returns an empty graph below the tempo confidence threshold', () => {
    const graph = buildLayerGraph(
      confidentState({ tempoConfidence: TEMPO_CONFIDENCE_THRESHOLD - 0.1 }),
    );
    for (const name of LAYER_NAMES) {
      expect(graph.layers[name].primitives).toHaveLength(0);
    }
    expect(graph.bpm).toBe(0);
  });

  it('returns an empty graph when bpm is not positive', () => {
    const graph = buildLayerGraph(confidentState({ bpm: 0 }));
    expect(graph.layers.drums.primitives).toHaveLength(0);
  });

  it('creates a pulse and a sub above the threshold', () => {
    const graph = buildLayerGraph(confidentState());
    expect(graph.bpm).toBe(120);
    expect(graph.layers.drums.primitives).toHaveLength(1);
    const pulse = graph.layers.drums.primitives[0]!;
    expect(pulse.kind).toBe('pulse');
    const sub = graph.layers.bass.primitives[0]!;
    expect(sub.kind).toBe('sub');
    expect(sub.parameters['note']).toBe('a2');
  });

  it('maps rhythmDensity to pulse steps, clamped', () => {
    const low = buildLayerGraph(confidentState({ rhythmDensity: 0 }));
    const high = buildLayerGraph(confidentState({ rhythmDensity: 5 }));
    expect(low.layers.drums.primitives[0]!.parameters['steps']).toBe(1);
    expect(high.layers.drums.primitives[0]!.parameters['steps']).toBe(4);
  });

  it('only whitelists transforms from ALLOWED_TRANSFORMS', () => {
    const graph = buildLayerGraph(confidentState());
    for (const name of LAYER_NAMES) {
      for (const p of graph.layers[name].primitives) {
        expect(p.allowedTransforms).toEqual(ALLOWED_TRANSFORMS[p.kind]);
      }
    }
  });
});

describe('diffLayerGraph', () => {
  const base = (): MusicalLayerGraph => buildLayerGraph(confidentState());

  it('returns no changes for identical graphs', () => {
    expect(diffLayerGraph(base(), base())).toHaveLength(0);
  });

  it('detects tempo changes', () => {
    const next = { ...base(), bpm: 130 };
    const changes = diffLayerGraph(base(), next);
    expect(changes).toContainEqual({ type: 'tempo', bpm: 130 });
  });

  it('detects added primitives', () => {
    const changes = diffLayerGraph(createEmptyLayerGraph(), base());
    const adds = changes.filter((c) => c.type === 'add');
    expect(adds).toHaveLength(2);
  });

  it('detects removed primitives', () => {
    const changes = diffLayerGraph(base(), createEmptyLayerGraph(120));
    const removes = changes.filter((c) => c.type === 'remove');
    expect(removes).toHaveLength(2);
  });

  it('detects layer-gain-only changes', () => {
    const next = base();
    const graph: MusicalLayerGraph = {
      ...next,
      layers: {
        ...next.layers,
        drums: { ...next.layers.drums, gain: 0.3 },
      },
    };
    const changes = diffLayerGraph(base(), graph);
    expect(changes).toContainEqual({ type: 'layer-gain', layer: 'drums', gain: 0.3 });
  });

  it('detects removed parameters', () => {
    const next = base();
    const graph: MusicalLayerGraph = {
      ...next,
      layers: {
        ...next.layers,
        drums: {
          ...next.layers.drums,
          primitives: next.layers.drums.primitives.map((p) => {
            const { gain: _gain, ...rest } = p.parameters;
            return { ...p, parameters: rest };
          }),
        },
      },
    };
    const changes = diffLayerGraph(base(), graph);
    expect(changes).toContainEqual({
      type: 'param',
      layer: 'drums',
      id: 'pulse',
      name: 'gain',
      value: undefined,
    });
  });

  it('detects parameter changes', () => {
    const next = base();
    const graph: MusicalLayerGraph = {
      ...next,
      layers: {
        ...next.layers,
        drums: {
          ...next.layers.drums,
          primitives: next.layers.drums.primitives.map((p) => ({
            ...p,
            parameters: { ...p.parameters, steps: 2 },
          })),
        },
      },
    };
    const changes = diffLayerGraph(base(), graph);
    expect(changes).toContainEqual({
      type: 'param',
      layer: 'drums',
      id: 'pulse',
      name: 'steps',
      value: 2,
    });
  });
});
