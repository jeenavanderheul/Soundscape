/**
 * Typed musical primitives and the layer graph (spec §11).
 *
 * Everything here is pure, serializable data: no Strudel imports, no audio
 * nodes. `StrudelEngine.ts` turns this graph into whitelisted pattern
 * templates. Primitives are declarative — never executable user data.
 */
import type { GenreAffinity, MusicState } from '../music/MusicState';

export type PrimitiveKind =
  | 'pulse' | 'kick' | 'snare' | 'hat' | 'break'
  | 'sub' | 'bass' | 'drone' | 'chord' | 'melody'
  | 'noise' | 'texture' | 'accent' | 'response' | 'atmosphere';

export type LayerName =
  | 'drums' | 'bass' | 'harmony' | 'melody' | 'texture' | 'atmosphere' | 'events';

export const LAYER_NAMES: readonly LayerName[] = [
  'drums', 'bass', 'harmony', 'melody', 'texture', 'atmosphere', 'events',
];

export interface MusicalPrimitive {
  id: string;
  kind: PrimitiveKind;
  layer: LayerName;
  parameters: Record<string, number | string | boolean>;
  allowedTransforms: string[];
}

export interface MusicalLayer {
  primitives: MusicalPrimitive[];
  gain: number;
  density: number;
}

export interface MusicalLayerGraph {
  bpm: number;
  layers: Record<LayerName, MusicalLayer>;
}

/** Whitelisted transform names per primitive kind (spec §11, rule §25.9). */
export const ALLOWED_TRANSFORMS: Record<PrimitiveKind, readonly string[]> = {
  pulse: ['fast', 'slow', 'gain'],
  kick: ['fast', 'slow', 'gain'],
  snare: ['fast', 'slow', 'gain'],
  hat: ['fast', 'slow', 'gain', 'degradeBy'],
  break: ['fast', 'slow', 'gain'],
  sub: ['gain', 'slow'],
  bass: ['gain', 'slow', 'fast'],
  drone: ['gain', 'slow'],
  chord: ['gain', 'slow'],
  melody: ['gain', 'fast', 'slow'],
  noise: ['gain'],
  texture: ['gain', 'slow'],
  accent: ['gain'],
  response: ['gain'],
  atmosphere: ['gain', 'slow'],
};

/** Tempo confidence required before Strudel contributes any layer (spec §3.4). */
export const TEMPO_CONFIDENCE_THRESHOLD = 0.6;

export type MusicParameter = 'bpm' | 'gain';

/** One-shot musical event routed through the port (spec §11 schedule()). */
export interface MusicalAction {
  kind: 'accent' | 'response';
  gain: number;
}

export type GraphChange =
  | { type: 'tempo'; bpm: number }
  | { type: 'layer-gain'; layer: LayerName; gain: number }
  | { type: 'add'; layer: LayerName; primitive: MusicalPrimitive }
  | { type: 'remove'; layer: LayerName; id: string }
  /** `value` is undefined when the parameter was removed (template default applies). */
  | {
      type: 'param';
      layer: LayerName;
      id: string;
      name: string;
      value: number | string | boolean | undefined;
    };

function emptyLayer(): MusicalLayer {
  return { primitives: [], gain: 1, density: 0 };
}

export function createEmptyLayerGraph(bpm = 0): MusicalLayerGraph {
  return {
    bpm,
    layers: {
      drums: emptyLayer(),
      bass: emptyLayer(),
      harmony: emptyLayer(),
      melody: emptyLayer(),
      texture: emptyLayer(),
      atmosphere: emptyLayer(),
      events: emptyLayer(),
    },
  };
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'] as const;

export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${octave}`;
}

/** Octave-reduce a frequency to a low sub root note (C1–B1). */
export function subNoteFromHz(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return 'a1';
  const pitchClass = ((Math.round(hzToMidi(hz)) % 12) + 12) % 12;
  return midiToNoteName(24 + pitchClass);
}

/**
 * Pure MusicState → layer graph mapping for M4.
 * Below the tempo confidence threshold Strudel stays silent — the player
 * tone still sounds. Above it: a pulse at the detected BPM whose density
 * follows rhythmDensity, plus a soft sub on the octave-reduced pitch root.
 */
export function buildLayerGraph(music: MusicState, genre?: GenreAffinity): MusicalLayerGraph {
  if (music.tempoConfidence < TEMPO_CONFIDENCE_THRESHOLD || music.bpm <= 0) {
    return createEmptyLayerGraph();
  }
  const graph = createEmptyLayerGraph(music.bpm);
  const density = clamp01(music.rhythmDensity);
  const techno = clamp01(genre?.techno ?? 0);
  const pulse: MusicalPrimitive = {
    id: 'pulse',
    kind: 'pulse',
    layer: 'drums',
    // §9.1: under Techno attraction the pulse organizes toward four-on-the-floor.
    parameters: {
      steps: techno >= 0.5 ? 4 : 1 + Math.round(density * 3),
      gain: 0.8,
    },
    allowedTransforms: [...ALLOWED_TRANSFORMS.pulse],
  };
  const drumPrimitives: MusicalPrimitive[] = [pulse];
  if (techno >= 0.5) {
    drumPrimitives.push({
      id: 'techno-hat',
      kind: 'hat',
      layer: 'drums',
      // Quantized bands, not a continuous value: keeps the graph diff-stable
      // while affinity drifts (§11 — no recompilation churn).
      parameters: { steps: techno >= 0.75 ? 4 : 2, gain: 0.35 },
      allowedTransforms: [...ALLOWED_TRANSFORMS.hat],
    });
  }
  const sub: MusicalPrimitive = {
    id: 'sub',
    kind: 'sub',
    layer: 'bass',
    parameters: { note: subNoteFromHz(music.pitchCenter), gain: 0.45 },
    allowedTransforms: [...ALLOWED_TRANSFORMS.sub],
  };
  return {
    ...graph,
    layers: {
      ...graph.layers,
      drums: { ...graph.layers.drums, primitives: drumPrimitives, density },
      bass: { ...graph.layers.bass, primitives: [sub] },
    },
  };
}

/**
 * Pure structural diff between two layer graphs so the engine can apply
 * changes instead of restarting (spec §11). Primitives are matched by id.
 */
export function diffLayerGraph(prev: MusicalLayerGraph, next: MusicalLayerGraph): GraphChange[] {
  const changes: GraphChange[] = [];
  if (prev.bpm !== next.bpm) {
    changes.push({ type: 'tempo', bpm: next.bpm });
  }
  for (const layer of LAYER_NAMES) {
    const prevLayer = prev.layers[layer];
    const nextLayer = next.layers[layer];
    // layer.gain is multiplied into every rendered primitive gain, so a
    // layer-gain-only change is audible and must dirty the diff.
    if (prevLayer.gain !== nextLayer.gain) {
      changes.push({ type: 'layer-gain', layer, gain: nextLayer.gain });
    }
    const prevById = new Map(prevLayer.primitives.map((p) => [p.id, p]));
    const nextById = new Map(nextLayer.primitives.map((p) => [p.id, p]));
    for (const [id, primitive] of nextById) {
      const before = prevById.get(id);
      if (!before) {
        changes.push({ type: 'add', layer, primitive });
        continue;
      }
      // Union of keys so removed parameters (template default kicks back in)
      // also register as changes.
      const names = new Set([
        ...Object.keys(before.parameters),
        ...Object.keys(primitive.parameters),
      ]);
      for (const name of names) {
        if (before.parameters[name] !== primitive.parameters[name]) {
          changes.push({ type: 'param', layer, id, name, value: primitive.parameters[name] });
        }
      }
    }
    for (const id of prevById.keys()) {
      if (!nextById.has(id)) {
        changes.push({ type: 'remove', layer, id });
      }
    }
  }
  return changes;
}
