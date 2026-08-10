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
import { LEVEL_DEEP, type TrackGenre, type TrackState } from '../music/TrackState';

export type PrimitiveKind =
  | 'pulse' | 'kick' | 'snare' | 'hat' | 'perc' | 'break'
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
  perc: ['fast', 'slow', 'gain', 'degradeBy'],
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

export function speedToBpm(velocity: number, grammar?: GenreGrammar): number {
  const speed = Number.isFinite(velocity) ? Math.max(0, velocity) : 0;
  let bpm = TEMPO_BANDS[0]!.bpm;
  for (const band of TEMPO_BANDS) {
    if (speed >= band.minSpeed) bpm = band.bpm;
  }
  if (!grammar) return bpm;
  // §39: the same five speed bands, but stretched into this region's range —
  // pushing hard in Ambient reaches the top of Ambient, not the top of DnB.
  const low = TEMPO_BANDS[0]!.bpm;
  const high = TEMPO_BANDS[TEMPO_BANDS.length - 1]!.bpm;
  const position = (bpm - low) / (high - low);
  return Math.round(grammar.bpmMin + position * (grammar.bpmMax - grammar.bpmMin));
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

export type DrumStyle =
  | 'four'
  | 'break'
  | 'sparse'
  | 'swing'
  | 'irregular'
  /** §34 garage: two-step — the kick leaves the second beat empty. */
  | 'twostep'
  /** §34 trap: half-time, long 808 booms. */
  | 'halftime'
  /** §34 dub: one deep kick, then space. */
  | 'echo'
  /** §34 classical: a timpani, not a machine. */
  | 'timpani';
export type HatStyle =
  | 'offbeat'
  | 'sixteenth'
  | 'swing'
  | 'sparse'
  | 'dirt'
  /** §34 garage: skippy, shuffled sixteenths. */
  | 'shuffle'
  /** §34 trap: rolls that subdivide. */
  | 'roll';
export type SnareStyle = 'backbeat' | 'ghost' | 'break' | 'body' | 'rim' | 'clap';
export type BassStyle =
  | 'repetitive'
  | 'sub'
  | 'walking'
  | 'rolling'
  /** §34 garage: short, syncopated sub stabs. */
  | 'skip'
  /** §34 trap: the 808 that slides between notes. */
  | 'slide'
  /** §34 dub: a bass that is mostly silence and decay. */
  | 'dubwise'
  /** §34 classical: the left hand. */
  | 'arco';
/** §31: harmony behaves differently per grammar — a stab is not a pad. */
export type ChordStyle = 'stab' | 'pad' | 'jazz' | 'piano' | 'organ' | 'skank';
export type MelodyStyle =
  | 'motif'
  | 'stab'
  | 'long'
  | 'improv'
  | 'hook'
  | 'fragment'
  | 'bell'
  | 'vocal'
  | 'melodica';
export type TextureStyle = 'hats' | 'air' | 'noise' | 'metallic' | 'shaker' | 'tape';

export interface GenreGrammar {
  kickStyle: DrumStyle;
  hatStyle: HatStyle;
  snareStyle: SnareStyle;
  bassStyle: BassStyle;
  chordStyle: ChordStyle;
  melodyStyle: MelodyStyle;
  textureStyle: TextureStyle;
  /**
   * Cycle length of the hats and of the extra percussion. Anything other than
   * a power of two runs against the 4/4 grid and only realigns after many
   * bars — that is polymeter, on one clock (§31 experimental).
   */
  hatCycle: number;
  /** 0 = this grammar has no separate percussion voice. */
  percCycle: number;
  /** §32 saturation on kick, bass and stabs. 0 keeps a layer clean and dynamic. */
  drive: number;
  /**
   * §37: the drum machine this grammar is played on. A genre is not only a
   * pattern — it is the box that pattern came out of, so every region has its
   * own kit. `percBank` is the second machine, for bodies and rim work.
   */
  drumBank: string;
  percBank: string;
  /**
   * §39: the tempo range of this grammar. Flight speed still chooses WHERE in
   * the range you sit — but a region has its own natural pace, so ambient can
   * never race and drum & bass can never crawl.
   */
  bpmMin: number;
  bpmMax: number;
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
  chordStyle: 'stab',
  melodyStyle: 'stab',
  textureStyle: 'hats',
  hatCycle: 4,
  percCycle: 4,
  drive: 0.25,
  drumBank: 'RolandTR909',
  percBank: 'RolandTR808',
  bpmMin: 90,
  bpmMax: 140,
  kickGain: 0.95,
  hatGain: 0.35,
  snareGain: 0.82,
  bassGain: 0.6,
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
    chordStyle: 'stab',
    melodyStyle: 'hook',
    textureStyle: 'noise',
    hatCycle: 4,
    // Ghost percussion against the break — the near-misses in the flight.
    percCycle: 3,
    drumBank: 'EmuSP12',
    percBank: 'AkaiMPC60',
    bpmMin: 160,
    bpmMax: 180,
    drive: 0.35,
    kickGain: 0.95,
    hatGain: 0.32,
    snareGain: 0.85,
    bassGain: 0.85,
    harmonySlow: 4,
    melodySlow: 1,
    textureGain: 0.12,
  },
  ambient: {
    kickStyle: 'sparse',
    hatStyle: 'sparse',
    snareStyle: 'ghost',
    bassStyle: 'sub',
    chordStyle: 'pad',
    melodyStyle: 'long',
    textureStyle: 'air',
    hatCycle: 4,
    percCycle: 0,
    drumBank: 'KorgDDM110',
    percBank: 'LinnLM1',
    bpmMin: 60,
    bpmMax: 90,
    drive: 0,
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
    chordStyle: 'jazz',
    melodyStyle: 'improv',
    textureStyle: 'metallic',
    hatCycle: 4,
    percCycle: 3,
    drumBank: 'AlesisHR16',
    percBank: 'RolandR8',
    bpmMin: 80,
    bpmMax: 160,
    drive: 0,
    kickGain: 0.6,
    hatGain: 0.3,
    snareGain: 0.45,
    bassGain: 0.55,
    harmonySlow: 2,
    melodySlow: 1,
    textureGain: 0.12,
  },
  experimental: {
    kickStyle: 'irregular',
    hatStyle: 'sparse',
    snareStyle: 'ghost',
    bassStyle: 'rolling',
    chordStyle: 'stab',
    melodyStyle: 'fragment',
    textureStyle: 'metallic',
    // 7 against 5 against 4: the three voices only realign every 140 beats,
    // so the region never settles into a bar you can count (§31 mutation).
    hatCycle: 7,
    percCycle: 5,
    drumBank: 'SakataDPM48',
    percBank: 'OberheimDMX',
    bpmMin: 70,
    bpmMax: 170,
    drive: 0.3,
    kickGain: 0.7,
    hatGain: 0.25,
    snareGain: 0.3,
    bassGain: 0.55,
    harmonySlow: 3,
    melodySlow: 2,
    textureGain: 0.3,
  },
  // §34 UK GARAGE — displacement: the grid slides off its own centre.
  garage: {
    kickStyle: 'twostep',
    hatStyle: 'shuffle',
    snareStyle: 'clap',
    bassStyle: 'skip',
    chordStyle: 'stab',
    melodyStyle: 'vocal',
    textureStyle: 'shaker',
    hatCycle: 4,
    percCycle: 4,
    drumBank: 'AkaiMPC60',
    percBank: 'RolandTR909',
    bpmMin: 128,
    bpmMax: 138,
    drive: 0.12,
    kickGain: 0.9,
    hatGain: 0.34,
    snareGain: 0.72,
    bassGain: 0.72,
    harmonySlow: 2,
    melodySlow: 2,
    textureGain: 0.14,
  },
  // §34 HOUSE — warmth: the machine plays, the hands answer.
  house: {
    kickStyle: 'four',
    hatStyle: 'offbeat',
    snareStyle: 'clap',
    bassStyle: 'repetitive',
    chordStyle: 'piano',
    melodyStyle: 'motif',
    textureStyle: 'shaker',
    hatCycle: 4,
    percCycle: 4,
    drumBank: 'RolandTR707',
    percBank: 'LinnDrum',
    bpmMin: 118,
    bpmMax: 128,
    drive: 0,
    kickGain: 0.88,
    hatGain: 0.3,
    snareGain: 0.6,
    bassGain: 0.6,
    harmonySlow: 2,
    melodySlow: 2,
    textureGain: 0.14,
  },
  // §34 TRAP — weight: half-time, and the low end slides.
  trap: {
    kickStyle: 'halftime',
    hatStyle: 'roll',
    snareStyle: 'rim',
    bassStyle: 'slide',
    chordStyle: 'stab',
    melodyStyle: 'bell',
    textureStyle: 'noise',
    hatCycle: 4,
    percCycle: 0,
    drumBank: 'RolandTR808',
    percBank: 'RolandTR808',
    bpmMin: 130,
    bpmMax: 150,
    drive: 0.2,
    kickGain: 0.95,
    hatGain: 0.26,
    snareGain: 0.8,
    bassGain: 0.9,
    harmonySlow: 4,
    melodySlow: 2,
    textureGain: 0.1,
  },
  // §34 DUB — echo: what was played comes back, changed.
  dub: {
    kickStyle: 'echo',
    hatStyle: 'sparse',
    snareStyle: 'rim',
    bassStyle: 'dubwise',
    chordStyle: 'skank',
    melodyStyle: 'melodica',
    textureStyle: 'tape',
    hatCycle: 4,
    percCycle: 4,
    drumBank: 'RolandCompuRhythm1000',
    percBank: 'RolandCompuRhythm8000',
    bpmMin: 70,
    bpmMax: 110,
    drive: 0,
    kickGain: 0.85,
    hatGain: 0.2,
    snareGain: 0.5,
    bassGain: 0.85,
    harmonySlow: 4,
    melodySlow: 4,
    textureGain: 0.2,
  },
  // §34 CLASSICAL — orchestration: no drum machine anywhere in this region.
  classical: {
    kickStyle: 'timpani',
    hatStyle: 'sparse',
    snareStyle: 'ghost',
    bassStyle: 'arco',
    chordStyle: 'piano',
    melodyStyle: 'bell',
    textureStyle: 'tape',
    hatCycle: 4,
    percCycle: 0,
    drumBank: 'AlesisHR16',
    percBank: 'AlesisHR16',
    bpmMin: 60,
    bpmMax: 110,
    drive: 0,
    kickGain: 0.55,
    hatGain: 0.1,
    snareGain: 0.15,
    bassGain: 0.5,
    harmonySlow: 4,
    melodySlow: 4,
    textureGain: 0.18,
  },
};

/** §38: every machine any grammar asks for, for the sound-library audit. */
export const GRAMMAR_BANKS: readonly string[] = [
  ...new Set(
    Object.values(GRAMMARS).flatMap((g) => [g.drumBank, g.percBank]),
  ),
];

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
  // §32: a layer the player kept flying with has grown its second voice.
  const deep = (layer: 'kick' | 'hats' | 'snare'): boolean =>
    (track?.drums[layer].level ?? 0) >= LEVEL_DEEP;
  const deepOf = (layer: 'bass' | 'harmony' | 'melody' | 'texture'): boolean =>
    (track?.[layer].level ?? 0) >= LEVEL_DEEP;
  const rootMidi = track?.rootMidi ?? 45;

  // --- Drums (§29.2 fase 2) ---
  // §32: a flight BEGINS WITH A TONE, never with a beat. Until the kick is
  // earned the drum layer is empty — no ghost pulse, no timekeeping. The
  // player has to discover the beat, not be handed it.
  const drums: MusicalPrimitive[] = [];
  if (kickUnlocked) {
    drums.push({
      id: 'pulse',
      kind: 'pulse',
      layer: 'drums',
      parameters: {
        style: grammar.kickStyle,
        // Techno locks four-on-the-floor; everywhere else the player's own
        // density writes the pulse (§9.1 vs §3.3).
        steps: resolvedGenre === 'techno' ? 4 : 1 + Math.round(density * 3),
        drive: grammar.drive,
        bank: grammar.drumBank,
        percBank: grammar.percBank,
        gain: round2(grammar.kickGain * mix.drums),
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.pulse],
    });
  }
  if (track?.drums.hats.unlocked) {
    drums.push({
      id: 'track-hat',
      kind: 'hat',
      layer: 'drums',
      parameters: {
        style: grammar.hatStyle,
        cycle: grammar.hatCycle,
        bank: grammar.drumBank,
        gain: round2(grammar.hatGain * mix.drums),
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.hat],
    });
    // §32: the second hat voice — fine dirt right at the top of the spectrum.
    if (deep('hats')) {
      drums.push({
        id: 'track-hat-dirt',
        kind: 'hat',
        layer: 'drums',
        parameters: {
          style: 'dirt',
          cycle: grammar.hatCycle,
          bank: grammar.drumBank,
          gain: round2(grammar.hatGain * 0.35 * mix.drums),
        },
        allowedTransforms: [...ALLOWED_TRANSFORMS.hat],
      });
    }
  }
  // A percussion voice on its own cycle length: broken groove in Techno,
  // ghost hits in DnB, true polymeter in Experimental (§31). It is the
  // kick's second voice, so it arrives once the pulse has been lived with.
  if (grammar.percCycle > 0 && deep('kick')) {
    drums.push({
      id: 'track-perc',
      kind: 'perc',
      layer: 'drums',
      parameters: {
        cycle: grammar.percCycle,
        bank: grammar.percBank,
        gain: round2(grammar.hatGain * 0.7 * mix.drums),
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.perc],
    });
  }
  if (track?.drums.snare.unlocked) {
    drums.push({
      id: 'track-snare',
      kind: 'snare',
      layer: 'drums',
      parameters: {
        style: grammar.snareStyle,
        bank: grammar.drumBank,
        percBank: grammar.percBank,
        gain: round2(grammar.snareGain * mix.drums),
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.snare],
    });
    // §32: the body under the clap — a second machine, a hair late, which is
    // what makes a backbeat sound produced rather than programmed.
    if (deep('snare')) {
      drums.push({
        id: 'track-snare-body',
        kind: 'snare',
        layer: 'drums',
        parameters: {
          style: 'body',
          bank: grammar.percBank,
          percBank: grammar.percBank,
          gain: round2(grammar.snareGain * 0.5 * mix.drums),
        },
        allowedTransforms: [...ALLOWED_TRANSFORMS.snare],
      });
    }
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
        drive: grammar.drive,
        gain: round2(grammar.bassGain * mix.bass),
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.bass],
    });
    // §32: sub AND body. The sine carries the weight, the filtered voice
    // carries the movement — together they read as one big bass.
    if (deepOf('bass')) {
      bass.push({
        id: 'track-sub',
        kind: 'sub',
        layer: 'bass',
        parameters: {
          notes: [0, 0, 3, 7]
            .map((semitones) => midiToNoteName(rootMidi - 12 + semitones))
            .join(' '),
          gain: round2(grammar.bassGain * 0.9 * mix.bass),
        },
        allowedTransforms: [...ALLOWED_TRANSFORMS.sub],
      });
    }
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
        style: grammar.chordStyle,
        drive: grammar.drive,
        slow: grammar.harmonySlow,
        gain: round2(0.3 * mix.harmony),
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.chord],
    });
    // §32: a wide voice an octave up behind the chord — the air around it.
    if (deepOf('harmony')) {
      harmony.push({
        id: 'track-harmony-wide',
        kind: 'chord',
        layer: 'harmony',
        parameters: {
          notes: (track.harmonyIntervals.length > 0 ? track.harmonyIntervals : [0])
            .slice(0, 4)
            .map((semitones) => midiToNoteName(rootMidi + 24 + semitones))
            .join(','),
          sound: 'triangle',
          style: 'pad',
          slow: grammar.harmonySlow * 2,
          gain: round2(0.14 * mix.harmony),
        },
        allowedTransforms: [...ALLOWED_TRANSFORMS.chord],
      });
    }
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
        style: grammar.melodyStyle,
        drive: grammar.drive,
        slow: grammar.melodySlow,
        gain: round2(0.3 * mix.melody),
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.melody],
    });
    // §32: the same phrase an octave up, half as loud and twice as slow —
    // the counter-line every finished track has.
    if (deepOf('melody')) {
      melody.push({
        id: 'track-melody-octave',
        kind: 'melody',
        layer: 'melody',
        parameters: {
          notes: track.melodyNotes
            .slice(0, 4)
            .map((midi) => midiToNoteName(midi + 12))
            .join(' '),
          sound: 'triangle',
          style: grammar.melodyStyle,
          slow: grammar.melodySlow * 2,
          gain: round2(0.13 * mix.melody),
        },
        allowedTransforms: [...ALLOWED_TRANSFORMS.melody],
      });
    }
  }

  // §31 Jazz: the world's reply, a distinct voice answering the player.
  if (track && track.responseNotes.length > 0) {
    melody.push({
      id: 'track-response',
      kind: 'response',
      layer: 'melody',
      parameters: {
        notes: track.responseNotes
          .slice(0, 4)
          .map((midi) => midiToNoteName(midi))
          .join(' '),
        gain: round2(0.24 * mix.melody),
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.response],
    });
  }

  // --- Texture (§29.2 fase 10) + atmosphere ---
  const texture: MusicalPrimitive[] = [];
  if (track?.texture.unlocked) {
    texture.push({
      id: 'track-texture',
      kind: 'texture',
      layer: 'texture',
      parameters: {
        style: grammar.textureStyle,
        bank: grammar.drumBank,
        gain: round2(grammar.textureGain * mix.texture),
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.texture],
    });
    // §32: a slow-moving second texture, so the top end never sits still.
    if (deepOf('texture')) {
      texture.push({
        id: 'track-texture-wide',
        kind: 'texture',
        layer: 'texture',
        parameters: {
          style: grammar.textureStyle === 'air' ? 'metallic' : 'air',
          bank: grammar.drumBank,
          gain: round2(grammar.textureGain * 0.5 * mix.texture),
        },
        allowedTransforms: [...ALLOWED_TRANSFORMS.texture],
      });
    }
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
