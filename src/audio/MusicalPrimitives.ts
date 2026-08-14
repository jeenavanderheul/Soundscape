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
import { isFinale, sectionMix, type SectionStyle } from '../music/ArrangementEngine';
import type { GenreAffinity, MusicState } from '../music/MusicState';
import type { Performance } from '../music/Performance';
import type { LayerVariations } from '../music/Variation';
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
  /**
   * §3: how the flight itself is playing the track right now — brightness,
   * space, push, note length, grit, weight. Absent means "no performance
   * shaping", which is what the tests and the empty graph use.
   */
  performance?: Performance;
  /** Which variation of its part each layer is currently playing (endless journey). */
  variations?: LayerVariations;
  /**
   * §48 production: how hard this grammar's mix pumps and moves. Derived from
   * the grammar's own `drive`, so techno and drum & bass breathe with the kick
   * while ambient, jazz and breakbeat stay clean and dynamic (user decision).
   */
  production?: { duck: number };
  /**
   * §116: scrub position, in cycles. A document arranges itself with masks
   * that read the CYCLE NUMBER, so hearing cycle 20 means shifting the whole
   * stack twenty cycles earlier — there is no other way to reach a phase
   * without waiting for it. The game never sets this; the bench does.
   */
  cycleOffset?: number;
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
 * §46 (user decision, supersedes §29's "flight speed is the tempo"): the REGION
 * carries the tempo. Each grammar sits at the middle of its own range, so a
 * place always sounds like itself, and the player's own rhythm still takes over
 * the moment they play one (§3.4).
 */
export function regionBpm(grammar?: GenreGrammar): number {
  if (!grammar) return 120;
  return Math.round(Math.min(grammar.bpmMax, Math.max(grammar.bpmMin, grammar.bpmCentre)));
}

export type MusicParameter = 'bpm' | 'gain';

/**
 * §33 turns: a hard bank left or right throws ONE gesture into the track
 * (user decision) — it fires and decays on its own, it is not a held effect.
 * Which gesture depends on the grammar, so a turn always sounds like the music
 * it is in.
 */
export type ThrowStyle = 'echo' | 'riser' | 'sweep' | 'bell' | 'impact';

/** §62: how a grammar turns movement energy into music. */
export type EnergyStyle =
  | 'layers'      // techno, house: more voices, more fills
  | 'subdivision' // trap, garage: the hats divide the bar further
  | 'breaks'      // bass: the break gets busier, ghosts appear
  | 'texture'     // ambient, breakbeat: more air, more harmonic layers
  | 'improv'      // jazz: more interplay, busier ride
  | 'echo'        // dub: more skank and more delay
  | 'mutation';   // experimental: more probability, more irregularity

/** One-shot musical event routed through the port (spec §11 schedule()). */
export interface MusicalAction {
  kind: 'accent' | 'response' | 'throw';
  gain: number;
  style?: ThrowStyle;
}

/** Left and right throw for each grammar, in that grammar's own palette. */
const THROWS: Record<Exclude<TrackGenre, null> | 'void', readonly [ThrowStyle, ThrowStyle]> = {
  techno: ['echo', 'riser'],
  'sub-pressure': ['riser', 'impact'],
  'heavy-signal': ['impact', 'riser'],
  'broken-machine': ['sweep', 'riser'],
  'percussion-riot': ['bell', 'impact'],
  'void-crusher': ['echo', 'sweep'],
  void: ['sweep', 'riser'],
};

export function throwStyleFor(genre: TrackGenre, direction: 'left' | 'right'): ThrowStyle {
  const pair = THROWS[genre ?? 'void'];
  return direction === 'left' ? pair[0] : pair[1];
}

export type GraphChange =
  | { type: 'tempo'; bpm: number }
  /** §3: the flight is playing the track differently (brightness, space, push…). */
  | { type: 'performance' }
  /** A layer is playing a different variation of the same part (endless journey). */
  | { type: 'variation'; layer: LayerName }
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

/**
 * §97: the role each voice plays, in the words of the presets these grammars
 * are written from — one banner per group in the on-screen score.
 */
const VOICE_LABELS: Record<string, string> = {
  'sub-pressure-atmosphere': 'ATMOSPHERE', 'sub-pressure-rise': 'ATMOSPHERE',
  'sub-pressure-hats': 'HATS', 'sub-pressure-hats-deep': 'HATS',
  'sub-pressure-kick': 'KICK', 'sub-pressure-kick-deep': 'KICK',
  'sub-pressure-snare': 'CLAP / SNARE', 'sub-pressure-snare-deep': 'CLAP / SNARE',
  'sub-pressure-sub': 'SUB', sub: 'SUB', 'sub-pressure-body': 'ROLLING BASS',
  'sub-pressure-reese': 'ROLLING BASS', 'sub-pressure-stab': 'RAVE STAB',
  'sub-pressure-signal': 'MACHINE SIGNAL', 'sub-pressure-texture': 'TEXTURE',
  // §110 the MACHINE PRESSURE document's own voices.
  atmosphere: 'ATMOSPHERE', 'machine-air': 'ATMOSPHERE',
  hats: 'HATS', 'hats-deep': 'HATS',
  kick: 'KICK', 'kick-deep': 'KICK',
  clap: 'CLAP / SNARE', 'snare-body': 'CLAP / SNARE',
  'rolling-bass': 'ROLLING BASS', reese: 'ROLLING BASS',
  'rave-stab': 'RAVE STAB', acid: 'ACID MACHINE',
  'machine-signal': 'MACHINE SIGNAL',
  'texture-deep': 'TEXTURE',
  'transition-pressure': 'ATMOSPHERE', 'climax-bass': 'CLIMAX',
  'track-kick': 'KICK', 'track-pulse': 'KICK', 'pulse': 'KICK',
  'track-hats': 'HATS', 'track-hats-deep': 'HATS',
  'track-snare': 'CLAP / SNARE', 'track-snare-deep': 'CLAP / SNARE',
  'track-perc': 'PERCUSSION',
  'track-sub': 'SUB', 'track-sub-deep': 'SUB',
  'track-bass': 'ROLLING BASS',
  'track-harmony': 'RAVE STAB', 'track-harmony-deep': 'RAVE STAB',
  'track-melody': 'MACHINE SIGNAL', 'track-melody-octave': 'MACHINE SIGNAL',
  'track-texture': 'TEXTURE', texture: 'TEXTURE', 'track-texture-wide': 'TEXTURE',
  'tension-pulse': 'TENSION ENGINE', 'tension-drone': 'TENSION ENGINE',
  'tension-air': 'TENSION ENGINE',
  'climax-toms': 'CLIMAX', 'climax-ride': 'CLIMAX', 'climax-signal': 'CLIMAX',
  'finale-response': 'CLIMAX', 'finale-noise': 'CLIMAX',
  'sub-pressure-finale-response': 'CLIMAX', 'sub-pressure-finale-noise': 'CLIMAX',
  'sub-pressure-finale-mutation': 'CLIMAX',
};

/**
 * §110: the section title each voice was authored under, in render order —
 * empty for a world that has no document of its own.
 */
export function voiceSections(graph: MusicalLayerGraph): string[] {
  const out: string[] = [];
  for (const layer of LAYER_NAMES) {
    for (const primitive of graph.layers[layer].primitives) {
      const section = primitive.parameters['section'];
      out.push(typeof section === 'string' ? section : '');
    }
  }
  return out;
}

/** Labels for the graph's voices, in the order the engine renders them. */
export function voiceLabels(graph: MusicalLayerGraph): string[] {
  const labels: string[] = [];
  for (const layer of LAYER_NAMES) {
    for (const primitive of graph.layers[layer].primitives) {
      labels.push(
        VOICE_LABELS[primitive.id] ??
          (layer === 'atmosphere' ? 'ATMOSPHERE' : layer.toUpperCase()),
      );
    }
  }
  return labels;
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

/**
 * §105 A PROGRESSION, NOT A CHORD.
 *
 * The harmony was one chord, held forever — `<[a3,c4,e4,g4] ~ ~ ... >` with a
 * single voicing repeating every bar. No harmonic movement means no music,
 * only texture, and it is the biggest single reason the track read as basic
 * however many voices were stacked on it. The reference tracks all move:
 * "Ab Cm Bb F" over five cycles, five-note voicings walking X→Y→Z→J→K.
 *
 * Semitone offsets from the track's own root, four chords over four bars, so
 * every world stays in the key the flight is in (§32) and still travels.
 */
export const PROGRESSIONS: Record<Exclude<TrackGenre, null>, readonly (readonly number[])[]> = {
  // i — VI — VII — v: the minor loop techno has always turned on.
  techno: [
    [0, 3, 7, 10],
    [8, 12, 15, 19],
    [10, 14, 17, 21],
    [7, 10, 14, 17],
  ],
  // i — iv — VI — V, darker and with a semitone lean in the third chord.
  'sub-pressure': [
    [0, 3, 7, 10], [5, 8, 12, 15], [1, 5, 8, 12], [7, 11, 14, 17],
  ],
  'heavy-signal': [
    [0, 3, 7, 10], [10, 14, 17, 20], [8, 12, 15, 19], [7, 10, 14, 17],
  ],
  'broken-machine': [
    [0, 3, 7, 10], [3, 7, 10, 14], [10, 13, 17, 20], [5, 8, 12, 15],
  ],
  'percussion-riot': [
    [0, 3, 7, 10], [7, 10, 14, 17], [5, 8, 12, 15], [3, 7, 10, 14],
  ],
  'void-crusher': [
    [0, 3, 7, 10], [1, 5, 8, 12], [8, 11, 15, 18], [0, 3, 7, 10],
  ],
};

/** The four chords of this world, as note names, ready for `<a b c d>`. */
export function progressionFor(genre: TrackGenre, rootMidi: number, octave = 12): string {
  const chords = PROGRESSIONS[genre ?? 'techno'];
  return chords
    .map((chord) => `[${chord.map((n) => midiToNoteName(rootMidi + octave + n)).join(',')}]`)
    .join(' ');
}

/** §85: has this track actually been grown, or is it still a sketch? */
function trackIsDeep(track?: TrackState): boolean {
  if (!track) return false;
  return [track.drums.kick, track.drums.snare, track.bass, track.harmony]
    .every((layer) => layer.unlocked && layer.level >= LEVEL_DEEP);
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
  /** §34 breakbeat: a timpani, not a machine. */
  | 'timpani'
  /** §69 breakbeat: a kick that lands broken — never on all four. */
  | 'broken'
  /** §73 bass music: four to the floor, distorted and clipped. */
  | 'hardgroove'
  /** §80 techno: four to the floor, driven and then held down by postgain. */
  | 'machine';
export type HatStyle =
  | 'offbeat'
  | 'sixteenth'
  | 'swing'
  | 'sparse'
  | 'dirt'
  /** §34 garage: skippy, shuffled sixteenths. */
  | 'shuffle'
  /** §34 trap: rolls that subdivide. */
  | 'roll'
  /** §69 breakbeat: minimal, dark, four hits and gone. */
  | 'dark'
  /** §71 techno: eighths, an offbeat open hat and a second machine under it. */
  | 'techno'
  /** §80 techno: degraded 808 dust over the 16th-note machine hats. */
  | 'machine-dust'
  /** §73 bass music: hard sixteenths with an open hat above them. */
  | 'pressure'
  /** §73 bass music: hard sixteenths with an open hat above them. */
  | 'pressure';
export type SnareStyle = 'backbeat' | 'ghost' | 'break' | 'body' | 'rim' | 'clap' | 'hardclap'
  | 'machine-clap' | 'machine-body'
  /** §69 breakbeat: one hard hit on 3 and 7, driven. */
  | 'hard';
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
  /** §34 breakbeat: the left hand. */
  /** §69 breakbeat: the pressure under the sub — saw, filtered, driven. */
  | 'pressure'
  /** §71 techno: body, edge and a low pulse over the sub. */
  | 'deep'
  /** §73 bass music: one note every sixteenth, filtered to a growl. */
  | 'rollingsub'
  | 'arco';
/** §31: harmony behaves differently per grammar — a stab is not a pad. */
export type ChordStyle =
  /** §66 garage: short stabs pushed OFF the grid — the signature of two-step. */
  | 'skip'
  | 'stab' | 'pad' | 'jazz' | 'piano' | 'organ' | 'skank'
  /** §69 breakbeat: a stab so sparse it reads as a warning light. */
  | 'dark'
  /** §71 techno: a pad, a stab and an FM shadow, none of them in front. */
  | 'darkpad'
  /** §73 bass music: an acid line where a chord would be. */
  | 'acid';
export type MelodyStyle =
  /** §71 techno: sequencer lines, not a tune. */
  | 'sequence'
  /** §73 bass music: a supersaw hook with a high twin answering it. */
  | 'hook2'
  | 'motif'
  | 'stab'
  | 'long'
  | 'improv'
  | 'hook'
  | 'fragment'
  | 'bell'
  | 'vocal'
  | 'melodica';
export type TextureStyle = 'hats' | 'air' | 'noise' | 'metallic' | 'shaker' | 'tape'
  /** §69 breakbeat: low atmospheric rumble under everything. */
  | 'rumble'
  /** §71 techno: the machine room — bytebeat, air, rumble and dust. */
  | 'machine'
  | 'machine-room'
  | 'machine-rise'
  /** §72 garage: air and dust, nothing you would call a part. */
  | 'dust'
  /** §73 bass music: one long detuned note in a huge room. */
  | 'foghorn';

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
  /** §71/§72: a named percussion figure, or '' for the generic one. */
  percStyle?: string;
  /**
   * §78: the machine the DEEP voices grow on. Body and detail from two
   * different boxes is what makes a doubled role sound produced rather than
   * layered — defaults to `percBank`.
   */
  deepBank?: string;
  /**
   * §79: the FIGURES a grammar's second voices take. Until now every world
   * doubled its roles the same way and only the sounds differed; a world that
   * says so here gets its own shape for the depth as well.
   */
  deepStyle?: string;
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
   * §49 (user decision): every world has its own SOUND, not only its own
   * pattern. These are the voices its bass, chords and lead are played on —
   * acoustic where the genre is acoustic, synthetic where it is synthetic, and
   * always a name that exists in the loaded library (§38 audits it).
   */
  bassVoice: string;
  chordVoice: string;
  leadVoice: string;
  /** §61: how this grammar means intro/build/drop/break. */
  sectionStyle: SectionStyle;
  /**
   * §62: what MOVEMENT ENERGY does here. Speed is never tempo (§46) — it is
   * musical energy, and every grammar spends that energy its own way. Techno
   * spends it on layers, Trap on subdivisions, DnB on break complexity,
   * Ambient on texture, Jazz on interplay, Dub on echo, Experimental on
   * mutation.
   */
  energyStyle: EnergyStyle;
  /**
   * §39: the tempo range of this grammar. Flight speed still chooses WHERE in
   * the range you sit — but a region has its own natural pace, so ambient can
   * never race and drum & bass can never crawl.
   */
  bpmMin: number;
  bpmMax: number;
  /**
   * §50: the tempo this region actually sits at, taken from the reference
   * presets the product owner wrote. The range above still exists — the
   * player's own rhythm may sit anywhere in it — but this is what you hear
   * when you fly in.
   */
  bpmCentre: number;
  kickGain: number;
  hatGain: number;
  snareGain: number;
  bassGain: number;
  /** §50 mix balance from the reference presets: chords sit under the bass. */
  harmonyGain: number;
  melodyGain: number;
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
  bassVoice: 'sawtooth',
  chordVoice: 'square',
  leadVoice: 'square',
  sectionStyle: 'driven',
  energyStyle: 'layers',
  bpmMin: 90,
  bpmMax: 140,
  bpmCentre: 132,
  // Reference preset: kick 1, hats .35, snare .65, bass .75, chords .3, lead .2.
  kickGain: 1,
  hatGain: 0.35,
  snareGain: 0.65,
  bassGain: 0.75,
  harmonyGain: 0.3,
  melodyGain: 0.2,
  harmonySlow: 4,
  melodySlow: 2,
  textureGain: 0.12,
};

const GRAMMARS: Record<Exclude<TrackGenre, null>, GenreGrammar> = {
  // §71 TECHNO, from the reference preset: 132 BPM, a 909 four-to-the-floor
  // with a second machine underneath, and everything else quiet enough that
  // the kick and the sub carry the whole thing.
  // §80 TECHNO / MACHINE PRESSURE, from the reference preset: 134 BPM, a 909
  // doubled by an 808 and an OberheimDMX, and everything driven hard and then
  // pulled back with postgain so the weight is pressure, not volume.
  techno: {
    ...NEUTRAL_GRAMMAR,
    bpmCentre: 134,
    bpmMin: 125,
    bpmMax: 145,
    drive: 0.42,
    drumBank: 'RolandTR909',
    percBank: 'OberheimDMX',
    deepBank: 'RolandTR808',
    kickStyle: 'machine',
    hatStyle: 'techno',
    snareStyle: 'clap',
    bassStyle: 'deep',
    chordStyle: 'darkpad',
    melodyStyle: 'sequence',
    textureStyle: 'machine',
    percStyle: 'machine',
    deepStyle: 'machine',
    bassVoice: 'sawtooth',
    chordVoice: 'supersaw',
    leadVoice: 'clavisynth',
    percCycle: 4,
    kickGain: 1,
    snareGain: 0.6,
    hatGain: 0.22,
    bassGain: 0.5,
    harmonyGain: 0.1,
    melodyGain: 0.06,
    textureGain: 0.02,
    harmonySlow: 2,
    melodySlow: 2,
  },
  'heavy-signal': {
    ...NEUTRAL_GRAMMAR,
    bpmCentre: 153, bpmMin: 149, bpmMax: 157, drive: 0.6,
    drumBank: 'EmuSP12', sectionStyle: 'driven', energyStyle: 'layers',
  },
  'broken-machine': {
    ...NEUTRAL_GRAMMAR,
    bpmCentre: 148, bpmMin: 144, bpmMax: 152, drive: 0.6,
    drumBank: 'SakataDPM48', sectionStyle: 'mutant', energyStyle: 'layers',
  },
  'percussion-riot': {
    ...NEUTRAL_GRAMMAR,
    bpmCentre: 144, bpmMin: 140, bpmMax: 148, drive: 0.6,
    drumBank: 'YamahaRY30', sectionStyle: 'dynamic', energyStyle: 'layers',
  },
  'void-crusher': {
    ...NEUTRAL_GRAMMAR,
    bpmCentre: 136, bpmMin: 132, bpmMax: 140, drive: 0.6,
    drumBank: 'SequentialCircuitsDrumtracks', sectionStyle: 'echo', energyStyle: 'layers',
  },
  'sub-pressure': {
    ...NEUTRAL_GRAMMAR,
    bpmCentre: 141.3,
    bpmMin: 138,
    bpmMax: 145,
    drive: 0.65,
    drumBank: 'AkaiMPC60',
    percBank: 'EmuSP12',
    deepBank: 'OberheimDMX',
    sectionStyle: 'driven',
    energyStyle: 'layers',
    kickGain: 1,
    snareGain: 0.8,
    hatGain: 0.18,
    bassGain: 0.82,
    harmonyGain: 0.42,
    melodyGain: 0.12,
    textureGain: 0.04,
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

/**
 * §62: how far the hats divide the bar at this energy. Only the subdivision
 * grammars actually change gear — a techno hat that suddenly ran at 32nds
 * would stop being techno (§19: the groove must survive).
 */
export function energyHatCycle(grammar: GenreGrammar, energy: number): number {
  const e = clamp01(energy);
  switch (grammar.energyStyle) {
    case 'subdivision':
      // 8ths → 16ths → 32nds: this IS what trap and garage do with energy.
      return grammar.hatCycle * (e > 0.75 ? 4 : e > 0.45 ? 2 : 1);
    case 'breaks':
      return grammar.hatCycle * (e > 0.7 ? 2 : 1);
    case 'layers':
      // Techno and House keep their grid; the energy goes into voices.
      return grammar.hatCycle;
    default:
      return grammar.hatCycle;
  }
}

/** §62: grammars that spend energy on MORE VOICES rather than finer ones. */
export function energyAddsVoices(grammar: GenreGrammar, energy: number): boolean {
  const e = clamp01(energy);
  switch (grammar.energyStyle) {
    case 'layers':
      return e > 0.55;
    case 'echo':
      return e > 0.5;
    case 'improv':
      return e > 0.6;
    case 'breaks':
      return e > 0.65;
    default:
      return false;
  }
}

/**
 * §62: how much the world lets go of the grid at this energy. Experimental
 * mutates harder the faster you fly; everything else stays where it is.
 */
export function energyLooseness(grammar: GenreGrammar, energy: number): number {
  return grammar.energyStyle === 'mutation' ? clamp01(energy) * 0.35 : 0;
}

export function buildLayerGraph(
  music: MusicState,
  genre?: GenreAffinity,
  structures: readonly StructureVoiceSource[] = [],
  track?: TrackState,
  patterns: LayerPatterns = {},
  /**
   * §42: MOVEMENT IS THE MUSIC. 0 = the orb is still and the world is silent;
   * 1 = flying. Earned layers are never lost — they simply stop sounding
   * until the player moves again.
   */
  motion = 1,
  /**
   * §62 MOVEMENT ENERGY, 0..1 — how hard the player is flying. Never tempo
   * (§46): each grammar spends it its own way, below.
   */
  energy = 0.5,
): MusicalLayerGraph {
  const playerTempo = music.tempoConfidence >= TEMPO_CONFIDENCE_THRESHOLD && music.bpm > 0;
  const trackClock = track && track.bpm > 0;
  const heartbeat = music.dynamics >= HEARTBEAT_DYNAMICS_THRESHOLD;
  const voices = structureVoices(structures);
  const ambientAffinity = 0;

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
  const mix = sectionMix(track?.form ?? 'none', grammar.sectionStyle);
  // §62: energy where this grammar spends it — texture grammars open up, the
  // rest keep their air where it is.
  const airBoost = grammar.energyStyle === 'texture' ? 0.6 + clamp01(energy) * 0.8 : 1;
  const loose = energyLooseness(grammar, energy);
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
        cycle: energyHatCycle(grammar, energy),
        bank: grammar.drumBank,
        gain: round2(grammar.hatGain * mix.drums * (0.75 + energy * 0.35)),
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
          style: grammar.deepStyle === 'machine' ? 'machine-dust' : 'dirt',
          deep: grammar.deepStyle ?? '',
          cycle: grammar.hatCycle,
          bank: grammar.deepBank ?? grammar.percBank,
          gain: round2(grammar.hatGain * 0.35 * mix.drums),
        },
        allowedTransforms: [...ALLOWED_TRANSFORMS.hat],
      });
    }
  }
  // A percussion voice on its own cycle length: broken groove in Techno,
  // ghost hits in DnB, true polymeter in Experimental (§31). It is the
  // kick's second voice, so it arrives once the pulse has been lived with.
  if (grammar.percCycle > 0 && (deep('kick') || energyAddsVoices(grammar, energy))) {
    drums.push({
      id: 'track-perc',
      kind: 'perc',
      layer: 'drums',
      parameters: {
        cycle: grammar.percCycle,
        style: grammar.percStyle ?? '',
        deep: grammar.deepStyle ?? '',
        bank: grammar.drumBank,
        percBank: grammar.percBank,
        gain: round2(grammar.hatGain * 0.7 * mix.drums * (0.6 + energy * 0.6)),
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
        style: grammar.deepStyle === 'machine' ? 'machine-clap' : grammar.snareStyle,
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
          style: grammar.deepStyle === 'machine' ? 'machine-body' : 'body',
          deep: grammar.deepStyle ?? '',
          bank: grammar.deepStyle === 'machine' ? 'EmuSP12' : grammar.deepBank ?? grammar.percBank,
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
            : grammar.deepStyle === 'machine'
              ? [0, -2, 1, 7].map((semitones) => midiToNoteName(rootMidi + semitones)).join(' ')
            : [0, 0, 3, 7].map((semitones) => midiToNoteName(rootMidi + semitones)).join(' '),
        drive: grammar.drive,
        voice: grammar.bassVoice,
        gain: round2(grammar.bassGain * mix.bass),
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.bass],
    });
    // §94: sub AND body arrive TOGETHER, the moment the rung is earned. The
    // sine carries the weight, the filtered voice carries the movement, and
    // together they read as one big bass — which is what PRESSURE promises.
    bass.push({
      id: 'track-sub',
      kind: 'sub',
      layer: 'bass',
      parameters: {
        notes: [0, 0, 3, 7]
          .map((semitones) => midiToNoteName(rootMidi - 12 + semitones))
          .join(' '),
        style: '',
        gain: round2(grammar.bassGain * 0.9 * mix.bass),
      },
      allowedTransforms: [...ALLOWED_TRANSFORMS.sub],
    });
    // Depth adds a THIRD voice on the grammar's own figure — it never replaces
    // one of the two that are already carrying the track.
    if (deepOf('bass')) {
      bass.push({
        id: 'track-sub-deep',
        kind: 'sub',
        layer: 'bass',
        parameters: {
          notes: (grammar.deepStyle === 'machine' ? [0, -2, 0, 0] : [0, 7, 0, 3])
            .map((semitones) => midiToNoteName(rootMidi - 12 + semitones))
            .join(' '),
          style: grammar.deepStyle ?? '',
          gain: round2(grammar.bassGain * 0.55 * mix.bass),
        },
        allowedTransforms: [...ALLOWED_TRANSFORMS.sub],
      });
    }
  }
  // §94: and NOTHING before it is earned. A ghost sub used to anchor the
  // heartbeat at 0.45 and was then swapped out for the real bass, so earning
  // the rung took the bottom away instead of adding to it — the one moment in
  // the whole build-up that has to feel like a gain.

  // --- Harmony (§29.2 fase 4): the chord the player's resonances built ---
  const harmony: MusicalPrimitive[] = [...voices];
  if (track?.harmony.unlocked) {
    harmony.unshift({
      id: 'track-harmony',
      kind: 'chord',
      layer: 'harmony',
      parameters: {
        voice: grammar.chordVoice,
        notes: (track.harmonyIntervals.length > 0 ? track.harmonyIntervals : [0])
          .slice(0, 4)
          .map((semitones) => midiToNoteName(rootMidi + 12 + semitones))
          .join(','),
        // §105: four chords, one per bar, in the track's own key. The single
        // held voicing above is what the player's resonances built; this is
        // where it TRAVELS.
        progression: progressionFor(track.genre, rootMidi),
        sound: 'triangle',
        style: grammar.chordStyle,
        drive: grammar.drive,
        slow: grammar.harmonySlow,
        gain: round2(grammar.harmonyGain * mix.harmony),
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
            .map((semitones) => midiToNoteName(rootMidi + (grammar.deepStyle === 'machine' ? 12 : 24) + semitones))
            .join(','),
          sound: 'triangle',
          style: 'pad',
          deep: grammar.deepStyle ?? '',
          slow: grammar.harmonySlow * 2,
          gain: round2(grammar.harmonyGain * 0.47 * mix.harmony),
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
        voice: grammar.leadVoice,
        notes: track.melodyNotes
          .slice(0, 8)
          .map((midi) => midiToNoteName(midi))
          .join(' '),
        sound: 'triangle',
        style: grammar.melodyStyle,
        drive: grammar.drive,
        slow: grammar.melodySlow,
        gain: round2(grammar.melodyGain * mix.melody),
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
          deep: grammar.deepStyle ?? '',
          slow: grammar.melodySlow * 2,
          gain: round2(grammar.melodyGain * 0.43 * mix.melody),
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
        voice: grammar.leadVoice,
        notes: track.responseNotes
          .slice(0, 4)
          .map((midi) => midiToNoteName(midi))
          .join(' '),
        gain: round2(grammar.melodyGain * 0.8 * mix.melody),
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
        gain: round2(grammar.textureGain * mix.texture * airBoost),
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
          deep: grammar.deepStyle ?? '',
          bank: grammar.deepBank ?? grammar.drumBank,
          gain: round2(grammar.textureGain * 0.5 * mix.texture * airBoost),
        },
        allowedTransforms: [...ALLOWED_TRANSFORMS.texture],
      });
    }
  }
  const atmosphere: MusicalPrimitive[] =
    track?.genre === 'techno'
      ? [
          {
            id: 'techno-machine-room',
            kind: 'texture',
            layer: 'atmosphere',
            parameters: { style: 'machine-room', gain: 1 },
            allowedTransforms: [...ALLOWED_TRANSFORMS.texture],
          },
          {
            id: 'techno-machine-rise',
            kind: 'texture',
            layer: 'atmosphere',
            parameters: { style: 'machine-rise', gain: 1 },
            allowedTransforms: [...ALLOWED_TRANSFORMS.texture],
          },
        ]
      : [
          // §102: EVERY world has air. This used to be techno-only plus an
          // ambient drone, so eight of the eleven grammars had nothing at all
          // in the atmosphere layer — ENTER BIOME, which is meant to be the
          // sound of arriving somewhere, was silent in most of the game, and
          // in Ambient the entire opening phase rendered zero voices.
          {
            id: 'world-air',
            kind: 'texture',
            layer: 'atmosphere',
            parameters: {
              code:
                `s("brown").clip(1).lpf(${Math.round(420 + grammar.drive * 420)})` +
                `.gain(${round2((0.04 + ambientAffinity * 0.04) * mix.atmosphere)})` +
                `.room(${(0.6 + grammar.drive * 0.2).toFixed(2)}).orbit(3)`,
            },
            allowedTransforms: [],
          },
          {
            id: 'world-shimmer',
            kind: 'texture',
            layer: 'atmosphere',
            parameters: {
              code:
                `s("crackle").hpf(${Math.round(4200 + grammar.drive * 2600)})` +
                `.gain(${round2((0.012 + grammar.drive * 0.012) * mix.atmosphere)}).room(.35)`,
            },
            allowedTransforms: [],
          },
          ...(ambientAffinity >= GENRE_LAYER_THRESHOLD
            ? [
                {
                  id: 'ambient-drone',
                  kind: 'drone' as const,
                  layer: 'atmosphere' as const,
                  parameters: {
                    note: subNoteFromHz(music.pitchCenter),
                    gain: round2(
                      (ambientAffinity >= GENRE_LAYER_STRONG ? 0.3 : 0.2) * mix.atmosphere,
                    ),
                  },
                  allowedTransforms: [...ALLOWED_TRANSFORMS.drone],
                },
              ]
            : []),
        ];

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

  // Quantized: a continuously drifting gain would re-evaluate the pattern on
  // every frame, which §11 forbids. Eight steps is inaudible as stepping and
  // keeps the graph diff-stable.
  const level = Math.round(clamp01(motion) * 8) / 8;

  /**
   * §85 DROP II is the payoff, so something has to arrive there that was not
   * possible anywhere else — a louder mix is not a reward. Only in the finale,
   * and only once the track has actually grown deep, does the world answer the
   * bass, throw noise across the top and let the grid mutate.
   */
  /**
   * §96 TENSION ENGINE — the VOID is a REDUCTION, never a break.
   *
   * §95 stopped the void from muting anything, but a thinner version of the
   * same parts is not tension, it is just quieter. What builds tension is
   * DIFFERENT material: a pulse that takes over the bass's job, a sub drone
   * underneath it, and air across the top. The engine keeps running and the
   * room changes around it.
   */
  if ((track?.form ?? 'none') === 'break' && track?.bass.unlocked) {
    const tonic = NOTE_NAMES[(((track.rootMidi % 12) + 12) % 12)];
    bass.push({
      id: 'tension-pulse',
      kind: 'bass',
      layer: 'bass',
      parameters: {
        code:
          `note("${tonic}2 ${tonic}2 ${tonic}2 ${tonic}2").s("pulse").slow(2)` +
          `.lpf(${Math.round(350 + grammar.drive * 900)}).lpq(12).decay(.08)` +
          `.distort(${round2(0.7 + grammar.drive).toFixed(2)}).postgain(.25)` +
          `.gain(${round2(grammar.bassGain * 0.35 * mix.bass)}).orbit(2)`,
      },
      allowedTransforms: [],
    });
    bass.push({
      id: 'tension-drone',
      kind: 'sub',
      layer: 'bass',
      parameters: {
        code:
          `note("<${tonic}1 ${tonic}1>").s("sine").slow(2).lpf(82)` +
          `.attack(.15).decay(.6).sustain(.55).release(.35)` +
          `.gain(${round2(grammar.bassGain * 0.5 * mix.bass)}).orbit(2)`,
      },
      allowedTransforms: [],
    });
    texture.push({
      id: 'tension-air',
      kind: 'noise',
      layer: 'texture',
      parameters: {
        code:
          `s("white*8").degradeBy(.4).hpf(5000).room(.5)` +
          `.gain(${round2(0.03 + grammar.drive * 0.03)})`,
      },
      allowedTransforms: [],
    });
  }

  if (isFinale(track?.form ?? 'none') && trackIsDeep(track)) {
    const key = NOTE_NAMES[(((track?.rootMidi ?? 45) % 12) + 12) % 12];
    bass.push({
      id: 'finale-response',
      kind: 'bass',
      layer: 'bass',
      parameters: {
        code:
          `note("~ ~ ${key}1 ~ ~ ${key}1 ~ [${key}1 ${key}1]")` +
          `.s("${grammar.bassVoice}").lpf(${Math.round(180 + grammar.drive * 260)})` +
          `.lpq(9).distort(${round2(0.8 + grammar.drive).toFixed(2)}).postgain(.28)` +
          `.gain(${round2(grammar.bassGain * 0.55 * mix.bass)})`,
      },
      allowedTransforms: [],
    });
    // §96: DROP II gets NEW RHYTHMIC INFORMATION, not just more of the same —
    // toms walking under it, a ride over the top, and a metallic signal.
    drums.push({
      id: 'climax-toms',
      kind: 'perc',
      layer: 'drums',
      parameters: {
        code:
          `s("lt ~ mt [ht mt] ~ lt [mt ht] ~").bank("${grammar.deepBank ?? grammar.percBank}")` +
          `.hpf(300).distort(${round2(0.4 + grammar.drive * 0.5).toFixed(2)})` +
          `.gain(${round2(0.18 * mix.drums)})`,
      },
      allowedTransforms: [],
    });
    drums.push({
      id: 'climax-ride',
      kind: 'hat',
      layer: 'drums',
      parameters: {
        code:
          `s("rd*8").bank("${grammar.drumBank}").hpf(5000).degradeBy(.18)` +
          `.gain(${round2(0.08 * mix.drums)})`,
      },
      allowedTransforms: [],
    });
    melody.push({
      id: 'climax-signal',
      kind: 'melody',
      layer: 'melody',
      parameters: {
        code:
          `note("~ ${key}5 ~ ${key}4 ~ ${key}5 ${key}4 ~").s("tubularbells")` +
          `.hpf(1400).decay(.08).distort(${round2(0.25 + grammar.drive * 0.3).toFixed(2)})` +
          `.room(.3).gain(${round2(0.04 * mix.melody)})`,
      },
      allowedTransforms: [],
    });
    texture.push({
      id: 'finale-noise',
      kind: 'texture',
      layer: 'texture',
      parameters: {
        code:
          `s("white").clip(1).hpf(${Math.round(3200 + grammar.drive * 3000)})` +
          `.attack(.45).release(.35).room(.5).distort(${round2(0.3 + grammar.drive).toFixed(2)})` +
          `.gain(${round2(0.09 + grammar.drive * 0.06)}).mask("<1 0!7>")`,
      },
      allowedTransforms: [],
    });
  }

  return {
    ...graph,
    layers: {
      ...graph.layers,
      drums: {
        ...graph.layers.drums,
        // §76: a section that sets a layer to zero takes the PART OUT — it does
        // not play it quietly. A break with the kick gone is a different piece
        // of music from a break with the kick at 0.55, and the reference
        // arrangements build themselves by adding and removing parts.
        primitives: mix.drums === 0 ? [] : authored('drums', drums),
        // §62 mutation: the faster you fly, the less the grid holds.
        density: Math.max(0, density - loose),
        gain: level,
      },
      bass: {
        ...graph.layers.bass,
        primitives: mix.bass === 0 ? [] : authored('bass', bass),
        gain: level,
      },
      harmony: {
        ...graph.layers.harmony,
        primitives: mix.harmony === 0 ? [] : authored('harmony', harmony),
        gain: level,
      },
      melody: {
        ...graph.layers.melody,
        primitives: mix.melody === 0 ? [] : authored('melody', melody),
        gain: level,
      },
      texture: {
        ...graph.layers.texture,
        primitives: mix.texture === 0 ? [] : authored('texture', texture),
        gain: level,
      },
      atmosphere: {
        ...graph.layers.atmosphere,
        primitives: mix.atmosphere === 0 ? [] : authored('atmosphere', atmosphere),
        gain: level,
      },
    },
    // §48: the grammar's own aggression decides how hard the mix pumps.
    production: { duck: Math.min(0.7, grammar.drive * 1.7) },
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
  // §3: the flight shapes every voice, so a changed performance is a changed
  // track even when the primitives are identical.
  if (performanceChanged(prev.performance, next.performance)) {
    changes.push({ type: 'performance' });
  }
  for (const layer of LAYER_NAMES) {
    if ((prev.variations?.[layer] ?? 0) !== (next.variations?.[layer] ?? 0)) {
      changes.push({ type: 'variation', layer });
    }
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

function performanceChanged(prev?: Performance, next?: Performance): boolean {
  if (prev === next) return false;
  if (prev === undefined || next === undefined) return true;
  return (
    prev.brightHz !== next.brightHz ||
    prev.space !== next.space ||
    prev.push !== next.push ||
    prev.length !== next.length ||
    prev.grit !== next.grit ||
    prev.weight !== next.weight
  );
}
