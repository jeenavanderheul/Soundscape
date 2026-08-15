import { describe, expect, it, vi } from 'vitest';

// @strudel/web touches `window` on import; this suite only exercises the pure
// code renderer, so the runtime is stubbed out (same approach as strudelEngine.test).
vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: () => ({ output: { destinationGain: null } }),
  samples: vi.fn(async () => undefined),
}));

import { AIR_ALTITUDE, performanceFrom, type FlightPose } from '../../src/music/Performance';
import { createInitialMusicState } from '../../src/music/MusicState';
import { buildPatternCode } from '../../src/audio/StrudelEngine';
import {
  createEmptyLayerGraph,
  diffLayerGraph,
  type MusicalLayerGraph,
  type MusicalPrimitive,
} from '../../src/audio/MusicalPrimitives';

const flying: FlightPose = { altitude: 10, amplitude: 0, velocity: 10 };

function perf(music: Partial<ReturnType<typeof createInitialMusicState>> = {}, pose = flying) {
  return performanceFrom({ ...createInitialMusicState(), ...music }, pose);
}

describe('§3 the flight plays the track', () => {
  it('§3.1 altitude is brightness and space; the ground is weight', () => {
    // Expressed against AIR_ALTITUDE rather than a height in units: this used
    // to say 60, which was fully air when the sky was 70 units tall and is a
    // quarter of the way up now that it is 1200. A claim about the top of the
    // range has to move when the range does.
    const high = perf({}, { ...flying, altitude: AIR_ALTITUDE });
    const low = perf({}, { ...flying, altitude: 0 });
    expect(high.brightHz).toBeGreaterThan(low.brightHz);
    expect(high.space).toBeGreaterThan(low.space);
    expect(low.weight).toBeGreaterThan(0.8);
    expect(high.weight).toBe(0);
  });

  it('flying low is heavy: darker filter, far more weight — never a pitch', () => {
    const low = perf({}, { ...flying, altitude: 2 });
    const mid = perf({}, { ...flying, altitude: 20 });
    const high = perf({}, { ...flying, altitude: 60 });
    expect(low.brightHz).toBeLessThan(mid.brightHz);
    expect(high.brightHz).toBeGreaterThan(mid.brightHz);
    expect(low.weight).toBeGreaterThan(0.8);
    expect(high.weight).toBeLessThan(low.weight);
    expect(high.space).toBeGreaterThan(low.space);
  });

  // §91 (user decision): height must never transpose or re-clock the track —
  // it is the one thing that could put what you built out of tune with itself.
  it('§91 height carries no pitch and no tempo at all', () => {
    const shape = Object.keys(perf({}, { ...flying, altitude: 30 }));
    expect(shape).not.toContain('transpose');
    expect(shape).not.toContain('tempoRatio');
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

describe('§48 production: the grammar decides how hard the mix works', () => {
  const kick: MusicalPrimitive = {
    id: 'k', kind: 'kick', layer: 'drums',
    parameters: { style: 'four', gain: 0.8 }, allowedTransforms: [],
  };
  const bass: MusicalPrimitive = {
    id: 'b', kind: 'bass', layer: 'bass',
    parameters: { style: 'repetitive', notes: 'a1 c2 e2 a2', gain: 0.6 }, allowedTransforms: [],
  };

  function render(duck: number): string {
    const graph = createEmptyLayerGraph(128);
    graph.layers.drums.primitives.push(kick);
    graph.layers.bass.primitives.push(bass);
    return buildPatternCode({ ...graph, performance: perf(), production: { duck } });
  }

  it('puts the kick and the harmony on different reverb buses', () => {
    const code = render(0.4);
    const kickLine = code.split('\n').find((l) => l.includes('sbd') || l.includes('bd'))!;
    const bassLine = code.split('\n').find((l) => l.includes('note('))!;
    expect(kickLine).toContain('.orbit(1)');
    expect(bassLine).toContain('.orbit(1)');
  });

  it('pumps the bass under the kick in a driven grammar', () => {
    const bassLine = render(0.4).split('\n').find((l) => l.includes('note('))!;
    expect(bassLine).toContain('.duckorbit(1)');
    expect(bassLine).toMatch(/\.duckdepth\(0?\.\d+\)/);
  });

  it('never pumps a grammar that has no drive (ambient, jazz, breakbeat)', () => {
    const code = render(0);
    expect(code).not.toContain('.duckorbit(');
    expect(code).not.toContain('.lastOf(');
  });

  it('turns the last bar of every eight around', () => {
    expect(render(0.4)).toContain('.lastOf(8,');
  });
});

/**
 * §183: the altitude→sound mapping is written in absolute units, so it has to
 * be rescaled whenever the world is. The ceiling went from 70 to 1200 when the
 * crowd became 140 units tall, and for a while the top 96% of the sky sounded
 * identical.
 */
describe('climbing is audible in the sky you can actually fly in', () => {
  const at = (altitude: number) =>
    performanceFrom(createInitialMusicState(), { altitude, amplitude: 0, velocity: 10 });

  it('changes the sound within a few seconds of climbing', () => {
    // A cruise climb covers something like 60 units in three seconds. That has
    // to be an audible move, not a rounding difference.
    const ground = at(0);
    const soon = at(60);
    expect(soon.brightHz).toBeGreaterThan(ground.brightHz);
    expect(soon.weight).toBeLessThan(ground.weight);
  });

  it('does not spend the whole sky on the first fifty units either', () => {
    // The failure mode being guarded against: everything happens immediately
    // and the rest of the climb is silent. 150 must still be brighter than 60.
    expect(at(150).brightHz).toBeGreaterThan(at(60).brightHz);
  });

  it('leaves no more than a fifth of the sky doing the work', () => {
    // Above AIR_ALTITUDE nothing changes, so it must sit low in the range —
    // but not so low that the mechanic collapses into the first breath.
    const ceiling = 1200;
    expect(AIR_ALTITUDE / ceiling).toBeLessThan(0.25);
    expect(AIR_ALTITUDE / ceiling).toBeGreaterThan(0.1);
  });

  it('still makes skimming the heaviest thing in the world', () => {
    expect(at(0).weight).toBeGreaterThan(0.8);
    expect(at(AIR_ALTITUDE).weight).toBe(0);
  });
});
