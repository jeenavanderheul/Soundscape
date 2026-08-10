import { describe, expect, it, vi } from 'vitest';

// @strudel/web touches `window` on import; this suite only exercises the pure
// code renderer, so the runtime is stubbed out (same approach as strudelEngine.test).
vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: () => ({ output: { destinationGain: null } }),
  samples: vi.fn(async () => undefined),
}));

import { performanceFrom, type FlightPose } from '../../src/music/Performance';
import { createInitialMusicState } from '../../src/music/MusicState';
import { buildPatternCode } from '../../src/audio/StrudelEngine';
import {
  createEmptyLayerGraph,
  diffLayerGraph,
  type MusicalLayerGraph,
  throwStyleFor,
  type MusicalPrimitive,
} from '../../src/audio/MusicalPrimitives';

const flying: FlightPose = { altitude: 10, amplitude: 0, velocity: 10 };

function perf(music: Partial<ReturnType<typeof createInitialMusicState>> = {}, pose = flying) {
  return performanceFrom({ ...createInitialMusicState(), ...music }, pose);
}

describe('§3 the flight plays the track', () => {
  it('§3.1 altitude is brightness and space; the ground is weight', () => {
    const high = perf({}, { ...flying, altitude: 60 });
    const low = perf({}, { ...flying, altitude: 0 });
    expect(high.brightHz).toBeGreaterThan(low.brightHz);
    expect(high.space).toBeGreaterThan(low.space);
    expect(low.weight).toBe(1);
    expect(high.weight).toBe(0);
  });

  it('§3.2 the wind you hold is the force of the whole track', () => {
    expect(perf({}, { ...flying, amplitude: 1 }).push).toBeGreaterThan(
      perf({}, { ...flying, amplitude: 0 }).push,
    );
  });

  it('§3.8 holding a sound lengthens the notes', () => {
    expect(perf({ durationAverage: 1 }).length).toBeGreaterThan(perf({ durationAverage: 0 }).length);
  });

  it('§3.6 dissonance becomes edge, not an error', () => {
    expect(perf({ dissonance: 1 }).grit).toBeGreaterThan(0);
    expect(perf({ dissonance: 0, timbreNoise: 0 }).grit).toBe(0);
  });

  it('§11 stays diff-stable: a tiny drift must not rewrite the pattern', () => {
    const a = perf({ dynamics: 0.5 }, { ...flying, altitude: 10 });
    const b = perf({ dynamics: 0.505 }, { ...flying, altitude: 10.1 });
    expect(b).toEqual(a);
    // ...but a real change in how you fly does reach the graph.
    const graph = createEmptyLayerGraph(120);
    expect(
      diffLayerGraph({ ...graph, performance: a }, { ...graph, performance: perf({}, { ...flying, altitude: 60 }) }),
    ).toContainEqual({ type: 'performance' });
  });
});

describe('§3 performance reaches the rendered pattern', () => {
  const kick: MusicalPrimitive = {
    id: 'kick',
    kind: 'kick',
    layer: 'drums',
    parameters: { style: 'four', gain: 0.8 },
    allowedTransforms: [],
  };
  const bass: MusicalPrimitive = {
    id: 'bass',
    kind: 'bass',
    layer: 'bass',
    parameters: { style: 'repetitive', notes: 'a1 c2 e2 a2', gain: 0.6 },
    allowedTransforms: [],
  };

  function graphWith(...primitives: MusicalPrimitive[]): MusicalLayerGraph {
    const graph = createEmptyLayerGraph(128);
    for (const primitive of primitives) {
      graph.layers[primitive.layer].primitives.push(primitive);
    }
    return graph;
  }

  it('adds the flight to every voice, and note length only where a note is held', () => {
    const graph = { ...graphWith(kick, bass), performance: perf() };
    const code = buildPatternCode(graph);
    expect(code).toContain('.postgain(');
    expect(code).toContain('.lpf(');
    const lines = code.split('\n');
    const kickLine = lines.find((l) => l.includes('bd') || l.includes('sbd'))!;
    const bassLine = lines.find((l) => l.includes('note('))!;
    expect(kickLine).not.toContain('.clip(');
    expect(bassLine).toContain('.clip(');
  });

  it('never overrides what a template chose for itself', () => {
    // Strudel single-use controls: a chained lpf would replace the template's.
    const filtered: MusicalPrimitive = {
      ...bass,
      id: 'dubby',
      parameters: { style: 'sub', notes: 'a1 c2 e2 a2', gain: 0.6 },
    };
    const template = buildPatternCode(graphWith(filtered));
    const played = buildPatternCode({ ...graphWith(filtered), performance: perf() });
    for (const control of ['.lpf(', '.room(']) {
      if (template.includes(control)) {
        expect(count(played, control)).toBe(count(template, control));
      }
    }
    expect(played).toContain('.postgain(');
  });

  it('leaves the pattern untouched when there is no performance', () => {
    expect(buildPatternCode(graphWith(kick))).not.toContain('.postgain(');
  });
});

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('§33 a turn throws one gesture, in the grammar you are in', () => {
  it('left and right differ, and each grammar has its own pair', () => {
    expect(throwStyleFor('techno', 'left')).not.toBe(throwStyleFor('techno', 'right'));
    // A region built on echo throws echo; a drumless one throws a bell.
    expect(throwStyleFor('dub', 'left')).toBe('echo');
    expect(throwStyleFor('classical', 'left')).toBe('bell');
    expect(throwStyleFor(null, 'left')).toBeTruthy();
  });

  it('renders to a real one-shot voice for every style', () => {
    for (const genre of ['techno', 'dub', 'classical', 'dnb', null] as const) {
      for (const side of ['left', 'right'] as const) {
        const code = buildPatternCode(createEmptyLayerGraph(120), [
          { kind: 'throw', gain: 0.5, style: throwStyleFor(genre, side) },
        ]);
        expect(code).toContain('gain(');
        expect(code.length).toBeGreaterThan(20);
      }
    }
  });
});
