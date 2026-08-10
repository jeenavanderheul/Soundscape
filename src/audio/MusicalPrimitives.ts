/**
 * Typed musical primitives and the layer graph (spec §11, §29).
 *
 * Everything here is pure, serializable data: no Strudel imports, no audio
 * nodes. `StrudelEngine.ts` turns this graph into whitelisted pattern
 * templates. Primitives are declarative — never executable user data.
 *
 * §29.5: the genre grammar lives here. Affinities do not switch a genre "on";
 * they hand the Track Builder rules for HOW the player's layers are written.
 * The same earned kick becomes four-on-the-floor in Techno, a break in DnB
 * and a distant heartbeat in Ambient.
 */
import { sectionMix } from '../music/ArrangementEngine';
import type { GenreAffinity, MusicState } from '../music/MusicState';
import type { TrackGenre, TrackState } from '../music/TrackState';

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

/** Tempo confidence at which the player's own rhythm takes over (§3.4). */
export const TEMPO_CONFIDENCE_THRESHOLD = 0.35;
/** Wind/movement above this wakes the world heartbeat (§4, §5). */
export const HEARTBEAT_DYNAMICS_THRESHOLD = 0.12;
/** Genre layers appear from this affinity (§9). */
export const GENRE_LAYER_THRESHOLD = 0.35;
export const GENRE_LAYER_STRONG = 0.6;

/** Coarsely quantized so the graph stays diff-stable while dynamics drift (§11). */
export function heartbeatBpm(dynamics: number): number {
  return 96 + Math.round(Math.min(1, Math.max(0, dynamics)) * 2) * 16;
}

/**
 * §29 (user decision): FLIGHT SPEED IS THE TEMPO. Speed falls into bands so
 * the groove stays stable while flying, and shifts musically when the player
 * genuinely accelerates — tap W and the whole world speeds up.
 */
export const TEMPO_BANDS: ReadonlyArray<{ minSpeed: number; bpm: number }> = [
  { minSpeed: 0, bpm: 90 },
  { minSpeed: 4, bpm: 110 },
  { minSpeed: 9, bpm: 128 },
  { minSpeed: 15, bpm: 145 },
  { minSpeed: 20, bpm: 170 },
];

export function speedToBpm(velocity: number): number {
  const speed = Number.isFinite(velocity) ? Math.max(0, velocity) : 0;
  let bpm = TEMPO_BANDS[0]!.bpm;
  for (const band of TEMPO_BANDS) {
    if (speed >= band.minSpeed) bpm = band.bpm;
  }
  return bpm;
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
const round2 = (v: number): number => Math.round(clamp01(v) * 100) / 100;

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'] as const;

export function midiToNoteName(midi: number): string {
  const rounded = Math.min(107, Math.max(12, Math.round(midi)));
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${octave}`;
}

/** Octave-reduce a frequency to a low sub root note (C2–B2 — §21: the low
 * register must stay perceptible on ordinary speakers, not only subwoofers). */
export function subNoteFromHz(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return 'a2';
  const pitchClass = ((Math.round(hzToMidi(hz)) % 12) + 12) % 12;
  return midiToNoteName(36 + pitchClass);
}

// ---------------------------------------------------------------------------
// §29.5 Genre grammar
// ---------------------------------------------------------------------------

export type DrumStyle = 'four' | 'break' | 'sparse' | 'swing' | 'irregular';
export type HatStyle = 'offbeat' | 'sixteenth' | 'swing' | 'sparse';
export type SnareStyle = 'backbeat' | 'ghost' | 'break';
export type BassStyle = 'repetitive' | 'sub' | 'walking' | 'rolling';

export interface GenreGrammar {
  kickStyle: DrumStyle;
  hatStyle: HatStyle;
  snareStyle: SnareStyle;
  bassStyle: BassStyle;
  kickGain: number;
  hatGain: number;
  snareGain: number;
  bassGain: number;
  /** Bars a chord is held (higher = more spacious). */
  harmonySlow: number;
  /** Bars the melodic phrase spans. */
  melodySlow: number;
  textureGain: number;
}

const NEUTRAL_GRAMMAR: GenreGrammar = {
  kickStyle: 'four',
  hatStyle: 'offbeat',
  snareStyle: 'backbeat',
  bassStyle: 'repetitive',
  kickGain: 0.85,
  hatGain: 0.35,
  snareGain: 0.5,
  bassGain: 0.5,
  harmonySlow: 4,
  melodySlow: 2,
  textureGain: 0.15,
};

const GRAMMARS: Record<Exclude<TrackGenre, null>, GenreGrammar> = {
  techno: { ...NEUTRAL_GRAMMAR },
  dnb: {
    kickStyle: 'break',
    hatStyle: 'sixteenth',
    snareStyle: 'break',
    bassStyle: 'sub',
    kickGain: 0.85,
    hatGain: 0.3,
    snareGain: 0.55,
    bassGain: 0.7,
    harmonySlow: 4,
    melodySlow: 1,
    textureGain: 0.12,
  },
  ambient: {
    kickStyle: 'sparse',
    hatStyle: 'sparse',
    snareStyle: 'ghost',
    bassStyle: 'sub',
    kickGain: 0.3,
    hatGain: 0.12,
    snareGain: 0.12,
    bassGain: 0.4,
    harmonySlow: 8,
    melodySlow: 4,
    textureGain: 0.25,
  },
  jazz: {
    kickStyle: 'swing',
    hatStyle: 'swing',
    snareStyle: 'ghost',
    bassStyle: 'walking',
    kickGain: 0.6,
    hatGain: 0.3,
    snareGain: 0.3,
    bassGain: 0.5,
    harmonySlow: 2,
    melodySlow: 1,
    textureGain: 0.12,
  },
  experimental: {
    kickStyle: 'irregular',
    hatStyle: 'sparse',
    snareStyle: 'ghost',
    bassStyle: 'rolling',
    kickGain: 0.6,
    hatGain: 0.25,
    snareGain: 0.3,
    bassGain: 0.55,
    harmonySlow: 3,
    melodySlow: 2,
    textureGain: 0.3,
  },
};

export function genreGrammar(genre: TrackGenre): GenreGrammar {
  return genre === null ? NEUTRAL_GRAMMAR : GRAMMARS[genre];
}

/** Strongest genre in an affinity map, or null while nothing dominates. */
export function dominantGenre(
  affinity: GenreAffinity | undefined,
  threshold = GENRE_LAYER_THRESHOLD,
): TrackGenre {
  if (!affinity) return null;
  let best: TrackGenre = null;
  let bestValue = threshold;
  for (const [genre, value] of Object.entries(affinity) as [
    Exclude<TrackGenre, null>,
    number,
  ][]) {
    if (value > bestValue) {
      best = genre;
      bestValue = value;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Structures as voices (§17)
// ---------------------------------------------------------------------------

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
 * track — its birth pitch is the note, its timbre the sound.
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
        slot: index,
        gain: 0.28,
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.chord],
    }));
}

// ---------------------------------------------------------------------------
// The graph
// ---------------------------------------------------------------------------

function ambientOnlyGraph(
  music: MusicState,
  ambient: number,
  voices: MusicalPrimitive[],
): MusicalLayerGraph {
  const graph = createEmptyLayerGraph(60);
  const layers = { ...graph.layers, harmony: { ...graph.layers.harmony, primitives: voices } };
  if (ambient < GENRE_LAYER_THRESHOLD) return { ...graph, layers };
  return {
    ...graph,
    layers: {
      ...layers,
      atmosphere: {
        ...graph.layers.atmosphere,
        primitives: [
          {
            id: 'ambient-drone',
            kind: 'drone',
            layer: 'atmosphere',
            parameters: {
              note: subNoteFromHz(music.pitchCenter),
              gain: ambient >= GENRE_LAYER_STRONG ? 0.3 : 0.2,
            },
            allowedTransforms: [...ALLOWED_TRANSFORMS.drone],
          },
        ],
      },
    },
  };
}

/**
 * The full §29 pipeline as pure data: tempo → drums → bass → harmony →
 * melody → texture → arrangement, written through the genre grammar.
 */
/** §30: guarded Strudel source the world's author (or the AI) supplied. */
export type LayerPatterns = Partial<Record<LayerName, string>>;

export function buildLayerGraph(
  music: MusicState,
  genre?: GenreAffinity,
  structures: readonly StructureVoiceSource[] = [],
  track?: TrackState,
  patterns: LayerPatterns = {},
): MusicalLayerGraph {
  const playerTempo = music.tempoConfidence >= TEMPO_CONFIDENCE_THRESHOLD && music.bpm > 0;
  const trackClock = track && track.bpm > 0;
  const heartbeat = music.dynamics >= HEARTBEAT_DYNAMICS_THRESHOLD;
  const voices = structureVoices(structures);
  const ambientAffinity = clamp01(genre?.ambient ?? 0);

  if (!playerTempo && !trackClock && !heartbeat) {
    if (ambientAffinity < GENRE_LAYER_THRESHOLD && voices.length === 0) {
      return createEmptyLayerGraph();
    }
    return ambientOnlyGraph(music, ambientAffinity, voices);
  }

  // Clock priority: the player's own rhythm → the earned track clock (speed
  // driven) → the movement heartbeat (§29 fase 1).
  const bpm = playerTempo
    ? music.bpm
    : trackClock
      ? track!.bpm
      : heartbeatBpm(music.dynamics);

  // The grammar follows the track's region; without a track state the
  // behavioural affinity still decides how the drums are written (§29.5).
  const resolvedGenre = track?.genre ?? dominantGenre(genre);
  const grammar = genreGrammar(resolvedGenre);
  const mix = sectionMix(track?.form ?? 'none');
  const graph = createEmptyLayerGraph(bpm);
  const density = clamp01(music.rhythmDensity);
  const kickUnlocked = track ? track.drums.kick.unlocked : true;
  const rootMidi = track?.rootMidi ?? 45;

  // --- Drums (§29.2 fase 2) ---
  const drums: MusicalPrimitive[] = [
    {
      id: 'pulse',
      kind: 'pulse',
      layer: 'drums',
      parameters: {
        // Before the kick is earned the pulse is a GHOST: audible timekeeping,
        // deliberately thin, so the unlock lands as a reward (§29.3).
        style: kickUnlocked ? grammar.kickStyle : 'four',
        // Techno locks four-on-the-floor; everywhere else the player's own
        // density writes the pulse (§9.1 vs §3.3).
        steps: resolvedGenre === 'techno' ? 4 : 1 + Math.round(density * 3),
        gain: round2(kickUnlocked ? grammar.kickGain * mix.drums : 0.2),
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.pulse],
    },
  ];
  if (track?.drums.hats.unlocked) {
    drums.push({
      id: 'track-hat',
      kind: 'hat',
      layer: 'drums',
      parameters: { style: grammar.hatStyle, gain: round2(grammar.hatGain * mix.drums) },
      allowedTransforms: [...ALLOWED_TRANSFORMS.hat],
    });
  }
  if (track?.drums.snare.unlocked) {
    drums.push({
      id: 'track-snare',
      kind: 'snare',
      layer: 'drums',
      parameters: { style: grammar.snareStyle, gain: round2(grammar.snareGain * mix.drums) },
      allowedTransforms: [...ALLOWED_TRANSFORMS.snare],
    });
  }

  // --- Bass (§29.2 fase 3) ---
  const bass: MusicalPrimitive[] = [];
  if (track?.bass.unlocked) {
    const intervals = track.harmonyIntervals.length > 0 ? track.harmonyIntervals : [0];
    bass.push({
      id: 'track-bass',
      kind: 'bass',
      layer: 'bass',
      parameters: {
        style: grammar.bassStyle,
        // Walking bass borrows the chord the player built; the others move
        // root → root → minor third → fifth, the classic four-step figure.
        notes:
          grammar.bassStyle === 'walking'
            ? intervals
                .slice(0, 4)
                .map((semitones) => midiToNoteName(rootMidi + semitones))
                .join(' ')
            : [0, 0, 3, 7].map((semitones) => midiToNoteName(rootMidi + semitones)).join(' '),
        gain: round2(grammar.bassGain * mix.bass),
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.bass],
    });
  } else {
    // Pre-unlock the sub still anchors the heartbeat, quietly (§29 fase 1).
    bass.push({
      id: 'sub',
      kind: 'sub',
      layer: 'bass',
      parameters: { note: subNoteFromHz(music.pitchCenter), gain: round2(0.45 * mix.bass) },
      allowedTransforms: [...ALLOWED_TRANSFORMS.sub],
    });
  }

  // --- Harmony (§29.2 fase 4): the chord the player's resonances built ---
  const harmony: MusicalPrimitive[] = [...voices];
  if (track?.harmony.unlocked) {
    harmony.unshift({
      id: 'track-harmony',
      kind: 'chord',
      layer: 'harmony',
      parameters: {
        notes: (track.harmonyIntervals.length > 0 ? track.harmonyIntervals : [0])
          .slice(0, 4)
          .map((semitones) => midiToNoteName(rootMidi + 12 + semitones))
          .join(','),
        sound: 'triangle',
        slow: grammar.harmonySlow,
        gain: round2(0.3 * mix.harmony),
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.chord],
    });
  }

  // --- Melody (§29.2 fase 5): the phrase traced through pitch space ---
  const melody: MusicalPrimitive[] = [];
  if (track?.melody.unlocked && track.melodyNotes.length > 0) {
    melody.push({
      id: 'track-melody',
      kind: 'melody',
      layer: 'melody',
      parameters: {
        notes: track.melodyNotes
          .slice(0, 8)
          .map((midi) => midiToNoteName(midi))
          .join(' '),
        sound: 'triangle',
        slow: grammar.melodySlow,
        gain: round2(0.3 * mix.melody),
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.melody],
    });
  }

  // --- Texture (§29.2 fase 10) + atmosphere ---
  const texture: MusicalPrimitive[] = [];
  if (track?.texture.unlocked) {
    texture.push({
      id: 'track-texture',
      kind: 'texture',
      layer: 'texture',
      parameters: { gain: round2(grammar.textureGain * mix.texture) },
      allowedTransforms: [...ALLOWED_TRANSFORMS.texture],
    });
  }
  const atmosphere: MusicalPrimitive[] =
    ambientAffinity >= GENRE_LAYER_THRESHOLD
      ? [
          {
            id: 'ambient-drone',
            kind: 'drone',
            layer: 'atmosphere',
            parameters: {
              note: subNoteFromHz(music.pitchCenter),
              gain: round2((ambientAffinity >= GENRE_LAYER_STRONG ? 0.3 : 0.2) * mix.atmosphere),
            },
            allowedTransforms: [...ALLOWED_TRANSFORMS.drone],
          },
        ]
      : [];

  // §30: an authored pattern replaces the template for its layer; the ladder
  // still decides WHEN the layer is audible.
  const authored = (layer: LayerName, fallback: MusicalPrimitive[]): MusicalPrimitive[] => {
    const code = patterns[layer];
    if (typeof code !== 'string' || fallback.length === 0) return fallback;
    return [
      {
        id: `world-${layer}`,
        kind: 'texture',
        layer,
        parameters: { code },
        allowedTransforms: [],
      },
    ];
  };

  return {
    ...graph,
    layers: {
      ...graph.layers,
      drums: { ...graph.layers.drums, primitives: authored('drums', drums), density },
      bass: { ...graph.layers.bass, primitives: authored('bass', bass) },
      harmony: { ...graph.layers.harmony, primitives: authored('harmony', harmony) },
      melody: { ...graph.layers.melody, primitives: authored('melody', melody) },
      texture: { ...graph.layers.texture, primitives: authored('texture', texture) },
      atmosphere: { ...graph.layers.atmosphere, primitives: authored('atmosphere', atmosphere) },
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
