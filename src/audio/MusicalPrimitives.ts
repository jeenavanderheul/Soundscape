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
export const TEMPO_CONFIDENCE_THRESHOLD = 0.35;
/** Wind/beweging boven dit niveau wekt de wereld-hartslag (§4, §5: vliegen = muziek). */
export const HEARTBEAT_DYNAMICS_THRESHOLD = 0.12;
/** Genre-lagen verschijnen vanaf deze affiniteit (§9). */
export const GENRE_LAYER_THRESHOLD = 0.35;
export const GENRE_LAYER_STRONG = 0.6;

/** Coarsely quantized so the graph stays diff-stable while dynamics drift (§11). */
export function heartbeatBpm(dynamics: number): number {
  return 96 + Math.round(Math.min(1, Math.max(0, dynamics)) * 2) * 16;
}

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
/** The serializable slice of a structure the music needs (§17: form = voice). */
export interface StructureVoiceSource {
  id: string;
  hz: number;
  waveform: string;
  persistence: number;
}

const VOICE_SOUND: Record<string, string> = {
  sine: 'sine',
  triangle: 'triangle',
  square: 'square',
  saw: 'sawtooth',
  noise: 'sine',
};

/**
 * §17/§P5: every persistent structure the player built becomes a VOICE in the
 * track — its birth pitch is the note, its timbre the sound. Building the
 * world literally builds the composition. Bounded, deterministic, diff-stable
 * (only changes when the structure set changes).
 */
export function structureVoices(structures: readonly StructureVoiceSource[]): MusicalPrimitive[] {
  return structures
    .filter((s) => s.persistence >= 0.5)
    .slice(0, 5)
    .map((s, index) => ({
      id: `voice-${s.id}`,
      kind: 'chord' as const,
      layer: 'harmony' as const,
      parameters: {
        note: subNoteFromHz(s.hz * 2),
        sound: VOICE_SOUND[s.waveform] ?? 'sine',
        // Spread voices across the bar so they interlock instead of stacking.
        slot: index,
        gain: 0.28,
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.chord],
    }));
}

export function buildLayerGraph(
  music: MusicState,
  genre?: GenreAffinity,
  structures: readonly StructureVoiceSource[] = [],
): MusicalLayerGraph {
  const playerTempo = music.tempoConfidence >= TEMPO_CONFIDENCE_THRESHOLD && music.bpm > 0;
  const heartbeat = music.dynamics >= HEARTBEAT_DYNAMICS_THRESHOLD;
  if (!playerTempo && !heartbeat) {
    // §9.2: Ambient needs no pulse — sustained behavior alone can carry a
    // drone in the tempo-less void (at a slow default clock).
    const ambientOnly = clamp01(genre?.ambient ?? 0);
    const voices = structureVoices(structures);
    // Built form keeps sounding even without a pulse (§17): the world hums.
    if (ambientOnly < GENRE_LAYER_THRESHOLD && voices.length === 0) return createEmptyLayerGraph();
    const droneGraph = createEmptyLayerGraph(60);
    if (ambientOnly < GENRE_LAYER_THRESHOLD) {
      return {
        ...droneGraph,
        layers: { ...droneGraph.layers, harmony: { ...droneGraph.layers.harmony, primitives: voices } },
      };
    }
    return {
      ...droneGraph,
      layers: {
        ...droneGraph.layers,
        harmony: { ...droneGraph.layers.harmony, primitives: voices },
        atmosphere: {
          ...droneGraph.layers.atmosphere,
          primitives: [
            {
              id: 'ambient-drone',
              kind: 'drone',
              layer: 'atmosphere',
              parameters: {
                note: subNoteFromHz(music.pitchCenter),
                gain: ambientOnly >= GENRE_LAYER_STRONG ? 0.3 : 0.2,
              },
              allowedTransforms: [...ALLOWED_TRANSFORMS.drone],
            },
          ],
        },
      },
    };
  }
  // §4/§5: the WORLD HEARTBEAT — flying with wind alone wakes a soft pulse at
  // a movement-derived tempo. The player's own rhythm, once confident,
  // ALWAYS takes over and the world quantizes to it (§3.4).
  const bpm = playerTempo ? music.bpm : heartbeatBpm(music.dynamics);
  const pulseGain = playerTempo ? 0.8 : 0.45;
  const graph = createEmptyLayerGraph(bpm);
  const density = clamp01(music.rhythmDensity);
  const techno = clamp01(genre?.techno ?? 0);
  const pulse: MusicalPrimitive = {
    id: 'pulse',
    kind: 'pulse',
    layer: 'drums',
    // §9.1: under Techno attraction the pulse organizes toward four-on-the-floor.
    parameters: {
      steps: techno >= GENRE_LAYER_THRESHOLD ? 4 : 1 + Math.round(density * 3),
      gain: pulseGain,
    },
    allowedTransforms: [...ALLOWED_TRANSFORMS.pulse],
  };
  const ambient = clamp01(genre?.ambient ?? 0);
  const jazz = clamp01(genre?.jazz ?? 0);
  const dnb = clamp01(genre?.dnb ?? 0);
  const experimental = clamp01(genre?.experimental ?? 0);
  const drumPrimitives: MusicalPrimitive[] = [pulse];
  if (dnb >= GENRE_LAYER_THRESHOLD) {
    // §9.4: velocity mutates the break — double-time chopped drums.
    drumPrimitives.push({
      id: 'dnb-break',
      kind: 'break',
      layer: 'drums',
      parameters: { intensity: dnb >= GENRE_LAYER_STRONG ? 2 : 1, gain: 0.5 },
      allowedTransforms: [...ALLOWED_TRANSFORMS.break],
    });
  }
  if (techno >= GENRE_LAYER_THRESHOLD) {
    drumPrimitives.push({
      id: 'techno-hat',
      kind: 'hat',
      layer: 'drums',
      // Quantized bands, not a continuous value: keeps the graph diff-stable
      // while affinity drifts (§11 — no recompilation churn).
      parameters: { steps: techno >= GENRE_LAYER_STRONG ? 4 : 2, gain: 0.35 },
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
  // §9.2 Ambient tendency: a slow drone at the pitch-center root joins the
  // atmosphere layer. Quantized on/off keeps the graph diff-stable (§11).
  const atmospherePrimitives: MusicalPrimitive[] =
    ambient >= GENRE_LAYER_THRESHOLD
      ? [
          {
            id: 'ambient-drone',
            kind: 'drone',
            layer: 'atmosphere',
            parameters: { note: subNoteFromHz(music.pitchCenter), gain: ambient >= GENRE_LAYER_STRONG ? 0.3 : 0.2 },
            allowedTransforms: [...ALLOWED_TRANSFORMS.drone],
          },
        ]
      : [];
  // §9.3: the world answers — a short procedurally constrained response
  // phrase rooted on the pitch center (call-and-response, no LLM).
  const melodyPrimitives: MusicalPrimitive[] =
    jazz >= GENRE_LAYER_THRESHOLD
      ? [
          {
            id: 'jazz-response',
            kind: 'response',
            layer: 'melody',
            parameters: { root: subNoteFromHz(music.pitchCenter * 4), gain: 0.3 },
            allowedTransforms: [...ALLOWED_TRANSFORMS.response],
          },
        ]
      : [];
  // §9.5: mutation adds unstable noise texture.
  const texturePrimitives: MusicalPrimitive[] =
    experimental >= GENRE_LAYER_THRESHOLD
      ? [
          {
            id: 'experimental-texture',
            kind: 'texture',
            layer: 'texture',
            parameters: { gain: experimental >= GENRE_LAYER_STRONG ? 0.25 : 0.15 },
            allowedTransforms: [...ALLOWED_TRANSFORMS.texture],
          },
        ]
      : [];
  return {
    ...graph,
    layers: {
      ...graph.layers,
      drums: { ...graph.layers.drums, primitives: drumPrimitives, density },
      bass: { ...graph.layers.bass, primitives: [sub] },
      harmony: { ...graph.layers.harmony, primitives: structureVoices(structures) },
      melody: { ...graph.layers.melody, primitives: melodyPrimitives },
      texture: { ...graph.layers.texture, primitives: texturePrimitives },
      atmosphere: { ...graph.layers.atmosphere, primitives: atmospherePrimitives },
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
