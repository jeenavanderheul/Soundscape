/**
 * StrudelEngine — the ONLY file allowed to import @strudel/web (spec §11, §16).
 *
 * API verified against the installed @strudel/web@1.3.0 sources:
 * - `initStrudel(options)` resolves to the repl object
 *   `{ scheduler, evaluate, start, stop, pause, setCps, ... }` and forwards
 *   `options.audioContext` to `webaudioRepl`, which makes superdough adopt
 *   OUR AudioEngine context via `setAudioContext`. No second AudioContext is
 *   created — no §11/§12 deviation needed.
 *
 * Gain staging / routing decision:
 *   superdough hard-wires its final `destinationGain` to
 *   `audioContext.destination`, bypassing AudioEngine's master chain. 1.3.0
 *   exposes no output-node option, so after init we disconnect that gain and
 *   reroute it into a GainNode owned by this engine (headroom
 *   STRUDEL_HEADROOM, see below). `getOutputNode()` returns that node; the
 *   game wires it into AudioEngine.getOutputNode() so Strudel layers stay
 *   under the master gain + compressor safety chain (spec §12, §21).
 *   Chain: superdough orbits -> destinationGain -> [our strudelGain]
 *          -> masterGain -> compressor -> destination.
 *
 * Scheduling rules (spec §3.4, §11, §21, §25.8):
 * - Patterns are built ONLY from the whitelisted templates below; all numeric
 *   params are asserted finite and clamped before string interpolation, note
 *   names must match NOTE_RE. No user data ever reaches code paths.
 * - `setLayerGraph` calls are coalesced: only the latest pending graph is
 *   applied, at the next beat/bar boundary, via one `repl.evaluate`. An
 *   unchanged graph (empty diff) triggers no evaluate. Never per frame.
 * - Boundary waits are anchored to the AUDIBLE grid: `repl.scheduler.now()`
 *   reports the Cyclist clock's cycle position (1 cycle = 1 bar), which stays
 *   correct across setCps tempo changes — no wall-clock epoch is extrapolated.
 *   While nothing is playing there is no audible grid, so changes apply
 *   immediately. Timing is independent of render FPS.
 */
import { getSuperdoughAudioController, initStrudel, samples, type StrudelRepl } from '@strudel/web';
import { guardPattern } from '../ai/PatternGuard';
import type { Performance } from '../music/Performance';
import type { LayerVariations } from '../music/Variation';
import {
  diffLayerGraph,
  createEmptyLayerGraph,
  LAYER_NAMES,
  type LayerName,
  type MusicalAction,
  type MusicalLayer,
  type MusicalLayerGraph,
  type MusicalPrimitive,
  type MusicParameter,
} from './MusicalPrimitives';

/** Beat-boundary notification (§20 M4 synchronized world behavior). */
export interface StrudelBeatEvent {
  /** AudioContext time of the boundary, in milliseconds. */
  atMs: number;
}

export interface StrudelEnginePort {
  initialize(audioContext: AudioContext): Promise<void>;
  start(): Promise<void>;
  stop(): void;
  setLayerGraph(graph: MusicalLayerGraph, boundary?: 'beat' | 'bar'): void;
  setParameter(name: MusicParameter, value: number): void;
  schedule(event: MusicalAction, boundary: 'beat' | 'bar'): void;
  /** Subscribe to beat boundaries while a pattern is playing; returns detach. */
  onBeat(handler: (event: StrudelBeatEvent) => void): () => void;
  getOutputNode(): AudioNode;
  dispose(): void;
}

/**
 * §63: ONE musical timeline. The visuals used to fire off the beat index —
 * a kick shockwave on every beat if the kick was earned — which is a lie the
 * moment the grammar is a two-step or a half-time trap kick. These are the
 * notes Strudel is ACTUALLY about to play, read straight off the live pattern,
 * so what flashes is what sounds.
 */
export type NoteKind = 'kick' | 'snare' | 'hat' | 'perc' | 'bass' | 'chord' | 'melody' | 'texture';

export interface MusicalNote {
  kind: NoteKind;
  /** Cycle position it begins at (1 cycle = 1 bar). */
  cycle: number;
  /** Seconds from now until it sounds. */
  inSeconds: number;
  velocity: number;
}

/** Sound names → what the world should do about them (§17 visual language). */
function noteKindOf(value: Record<string, unknown>): NoteKind | null {
  const sound = typeof value['s'] === 'string' ? (value['s'] as string) : '';
  const bare = sound.replace(/:.*$/, '');
  if (bare.startsWith('bd') || bare === 'sbd') return 'kick';
  if (bare === 'sd' || bare === 'cp' || bare === 'rim') return 'snare';
  if (bare.startsWith('hh') || bare === 'oh' || bare === 'sh') return 'hat';
  if (bare === 'white' || bare === 'pink' || bare === 'brown') return 'texture';
  if (bare === 'perc' || bare === 'cb' || bare === 'tb') return 'perc';
  if (value['note'] !== undefined) {
    // Pitched: the register tells bass from chord from lead.
    const note = value['note'];
    const midi = typeof note === 'number' ? note : Number.NaN;
    if (Number.isFinite(midi)) return midi < 48 ? 'bass' : midi < 72 ? 'chord' : 'melody';
    return 'chord';
  }
  return null;
}

/** Test seam for §63's classifier; the engine itself uses `noteKindOf`. */
export function classifyForTest(values: Array<Record<string, unknown>>): Array<NoteKind | null> {
  return values.map(noteKindOf);
}

export const BEATS_PER_BAR = 4;
/** Strudel layer headroom under the master chain so max layering cannot clip (§21).
 * §29: the TRACK is the star of the mix — headroom sits high, the player tone low. */
export const STRUDEL_HEADROOM = 0.9;
export const MIN_BPM = 30;
export const MAX_BPM = 300;
/** Time constant for click-free gain ramps (§21). */
const GAIN_RAMP_SECONDS = 0.03;

/** Real drum samples replace the synth fallbacks once the bank has loaded. */
let samplesLoaded = false;

/**
 * §75 GENERAL MIDI SOUNDFONTS. `@strudel/soundfonts` registers ~180 `gm_*`
 * instruments — piano, strings, guitars, brass, woodwinds — the whole family
 * our sample maps do not have. It is network-backed, so every template that
 * names one must have a fallback, exactly like the drum machines (§30.5): an
 * instrument that did not load is SILENCE, not an error (§38).
 */
let soundfontsLoaded = false;
export function setSoundfontsLoaded(value: boolean): void {
  soundfontsLoaded = value;
}
export function areSoundfontsLoaded(): boolean {
  return soundfontsLoaded;
}

/**
 * The GM voices a grammar may name. Deliberately a short list: these are the
 * instruments our worlds actually need, and every one of them is checked
 * against the registry the package ships (see soundfonts.test.ts).
 */
export const SOUNDFONT_VOICES: ReadonlySet<string> = new Set([
  'gm_piano', 'gm_epiano1', 'gm_harpsichord', 'gm_celesta',
  'gm_violin', 'gm_cello', 'gm_string_ensemble_1', 'gm_synth_strings_1',
  'gm_pizzicato_strings', 'gm_orchestral_harp', 'gm_choir_aahs',
  'gm_acoustic_bass', 'gm_electric_bass_finger', 'gm_fretless_bass',
  'gm_electric_guitar_jazz', 'gm_electric_guitar_clean', 'gm_overdriven_guitar',
  'gm_trumpet', 'gm_trombone', 'gm_french_horn', 'gm_brass_section',
  'gm_soprano_sax', 'gm_tenor_sax', 'gm_flute', 'gm_clarinet', 'gm_oboe',
  'gm_church_organ', 'gm_drawbar_organ', 'gm_accordion',
  'gm_lead_1_square', 'gm_lead_2_sawtooth', 'gm_pad_warm', 'gm_pad_choir', 'gm_pad_halo',
  'gm_fx_brightness', 'gm_marimba', 'gm_vibraphone', 'gm_kalimba',
]);
export function setSamplesLoaded(value: boolean): void {
  samplesLoaded = value;
}
/**
 * §37: the drum machines with a complete kit in the loaded map. A grammar
 * names its own machine; anything unknown falls back to the 909 rather than
 * silently producing no sound.
 */
export const DRUM_BANKS = new Set([
  'AkaiMPC60', 'AkaiXR10', 'AlesisHR16', 'AlesisSR16', 'BossDR550', 'EmuDrumulator',
  'EmuSP12', 'KorgDDM110', 'KorgM1', 'KorgT3', 'LinnDrum', 'LinnLM1', 'LinnLM2',
  'OberheimDMX', 'RolandCompuRhythm1000', 'RolandCompuRhythm8000', 'RolandD70',
  'RolandMC303', 'RolandMT32', 'RolandR8', 'RolandTR505', 'RolandTR626', 'RolandTR707',
  'RolandTR808', 'RolandTR909', 'SakataDPM48', 'SequentialCircuitsDrumtracks', 'YamahaRY30',
]);
const DEFAULT_BANK = 'RolandTR909';
/** A grammar that names this plays the plain kit, with no `.bank()` at all. */
export const PLAIN_KIT = 'none';
/**
 * The sample maps strudel.cc itself loads. @strudel/web ships none of them,
 * which is why `${drumBank}` resolved to nothing and oh/rim did not
 * exist at all. Maps are JSON only — individual audio files are still fetched
 * lazily on first hit, so this costs a few hundred KB, not a library.
 *
 * - tidal-drum-machines: 73 drum machines, what `bank()` looks up
 * - VCSL: acoustic and orchestral instruments
 * - EmuSP12 / Dirt-Samples: the classic tracker and Tidal kits
 */
/**
 * §43: the vendored library, served by our own origin. Tried FIRST so the
 * game works offline and does not depend on a third-party repository staying
 * up; the GitHub maps below remain the fallback for a checkout that has not
 * run `npm run sounds:vendor` yet.
 */
export const LOCAL_SAMPLE_MAP = '/samples/strudel.json';

export const SAMPLE_MAPS = [
  'https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json',
  'https://raw.githubusercontent.com/felixroos/dough-samples/main/vcsl.json',
  'https://raw.githubusercontent.com/felixroos/dough-samples/main/EmuSP12.json',
  'https://raw.githubusercontent.com/felixroos/dough-samples/main/Dirt-Samples.json',
  'https://raw.githubusercontent.com/felixroos/dough-samples/main/piano.json',
] as const;
/** The one the drum templates depend on; the rest widen the palette. */
export const DRUM_MACHINES_URL = SAMPLE_MAPS[0];

const NOTE_RE = /^[a-g]#?[0-8]$/;
/** Synth voices plus the sampled instruments the grammars call for (§34). */
const VOICE_SOUNDS = new Set([
  'sine',
  'triangle',
  'square',
  'sawtooth',
  'piano',
  'organ_full',
  'glockenspiel',
  'vibraphone',
  'marimba',
  'harp',
  'harmonica',
  'sax',
  'timpani',
  'tubularbells',
  // §71 techno: the synth voices its reference preset is written on.
  'pulse', 'supersaw', 'fmpiano', 'clavisynth', 'casio',
]);

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`StrudelEngine: parameter "${name}" must be a finite number`);
  }
  return value;
}

/** One cycle = one bar of four beats. */
export function bpmToCps(bpm: number): number {
  return clamp(finite(bpm, 'bpm'), MIN_BPM, MAX_BPM) / 60 / BEATS_PER_BAR;
}

/**
 * Milliseconds until the next beat/bar boundary, from the scheduler's cycle
 * position (`repl.scheduler.now()`; one cycle = one bar of four beats).
 */
export function msUntilNextCycleBoundary(
  nowCycles: number,
  bpm: number,
  boundary: 'beat' | 'bar',
): number {
  if (!Number.isFinite(nowCycles)) return 0;
  const clampedBpm = clamp(Number.isFinite(bpm) ? bpm : MIN_BPM, MIN_BPM, MAX_BPM);
  const barSec = (60 / clampedBpm) * BEATS_PER_BAR;
  const periodCycles = boundary === 'bar' ? 1 : 1 / BEATS_PER_BAR;
  const phase = ((nowCycles % periodCycles) + periodCycles) % periodCycles;
  return phase === 0 ? 0 : (periodCycles - phase) * barSec * 1000;
}

/** Note-list helpers: every token must be a real note name (no user data). */
function noteList(value: unknown, id: string, separator: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`StrudelEngine: primitive "${id}" needs note names`);
  }
  const tokens = value.split(separator).map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 8) {
    throw new TypeError(`StrudelEngine: primitive "${id}" has an invalid note list`);
  }
  for (const token of tokens) {
    if (!NOTE_RE.test(token)) {
      throw new TypeError(`StrudelEngine: invalid note "${token}" in primitive "${id}"`);
    }
  }
  return tokens.join(separator === ',' ? ',' : ' ');
}

function styleOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const KICK_STYLES = [
  'four', 'break', 'sparse', 'swing', 'irregular', 'twostep', 'halftime', 'echo', 'timpani',
  'broken', 'hardgroove',
] as const;
const HAT_STYLES = [
  'offbeat', 'sixteenth', 'swing', 'sparse', 'dirt', 'shuffle', 'roll', 'dark', 'muffled',
  'techno', 'pressure',
] as const;
const SNARE_STYLES = ['backbeat', 'ghost', 'break', 'body', 'rim', 'clap', 'hard', 'hardclap'] as const;
const BASS_STYLES = [
  'repetitive', 'sub', 'walking', 'rolling', 'skip', 'slide', 'dubwise', 'arco', 'pressure',
  'deep', 'rollingsub',
] as const;
const CHORD_STYLES = ['stab', 'pad', 'jazz', 'piano', 'organ', 'skank', 'skip', 'dark', 'darkpad', 'acid'] as const;
const MELODY_STYLES = [
  'motif', 'stab', 'long', 'improv', 'hook', 'fragment', 'bell', 'vocal', 'melodica',
  'sequence', 'hook2',
] as const;
const TEXTURE_STYLES = ['hats', 'air', 'noise', 'metallic', 'shaker', 'tape', 'rumble', 'machine', 'dust', 'foghorn'] as const;

/**
 * Whitelisted template library (spec §11, §29.5): primitive kind + genre
 * style -> pattern expression. Built only from Strudel's BUILT-IN synth
 * sounds (sbd, white noise, sine/triangle/sawtooth) so the track is audible
 * without loading any sample bank over the network.
 */
/**
 * §49 (user decision): every world plays its own instruments. The templates
 * write the FIGURE — a two-step sub, a jazz voicing, a stab — and the grammar
 * says which voice plays it, so garage stabs come out of an organ and jazz
 * chords out of a piano without duplicating a single pattern.
 *
 * Only a name that exists in the loaded library is accepted; anything else
 * leaves the template's own choice standing, because an unknown sound is
 * SILENCE, not an error (§38).
 */
const VOICED_KINDS = new Set(['bass', 'chord', 'melody', 'response']);

function withVoice(code: string, primitive: MusicalPrimitive): string {
  // §71: a stacked template has already chosen a voice per line on purpose —
  // substituting the grammar's single voice into the first one would silently
  // flatten three voices into one.
  if (code.startsWith('stack(')) return code;
  if (!VOICED_KINDS.has(primitive.kind)) return code;
  const voice = primitive.parameters['voice'];
  if (typeof voice !== 'string' || !VOICE_SOUNDS.has(voice)) return code;
  return code.replace(/\.s\("[a-z_0-9]+"\)/, `.s("${voice}")`);
}

function renderPrimitive(primitive: MusicalPrimitive, layer: MusicalLayer): string {
  const layerGain = clamp(finite(layer.gain, `${primitive.id}.layer.gain`), 0, 1);
  const gain = (
    clamp(finite(primitive.parameters['gain'] ?? 1, `${primitive.id}.gain`), 0, 1) * layerGain
  ).toFixed(3);
  const p = primitive.parameters;
  // §32: saturation. Techno and DnB are driven; Ambient and Jazz stay clean.
  const drive = clamp(finite(p['drive'] ?? 0, `${primitive.id}.drive`), 0, 0.6);
  const bankOf = (value: unknown): string =>
    typeof value === 'string' && DRUM_BANKS.has(value) ? value : DEFAULT_BANK;
  const DRUM_BANK = bankOf(p['bank']);
  const PERC_BANK = bankOf(p['percBank'] ?? p['bank']);
  // §66b: a grammar may ask for the plain kit — UK garage's reference preset
  // names no machine at all, and that bare kit IS part of how it sounds.
  const plain = p['bank'] === PLAIN_KIT;
  const drumBank = plain ? '' : `.bank("${DRUM_BANK}")`;
  const percBank = plain ? '' : `.bank("${PERC_BANK}")`;
  const shaped = drive > 0 ? `.shape(${drive.toFixed(2)})` : '';
  // §30: authored/AI source is rendered ONLY if it passes the allowlist
  // grammar — the same boundary every other parameter crosses.
  if (typeof p['code'] === 'string') {
    const guarded = guardPattern(p['code']);
    if (!guarded.ok) {
      throw new TypeError(`StrudelEngine: rejected pattern for "${primitive.id}": ${guarded.reason}`);
    }
    return guarded.code;
  }
  switch (primitive.kind) {
    case 'pulse':
    case 'kick': {
      const style = styleOf(p['style'], KICK_STYLES, 'four');
      const steps = Math.round(clamp(finite(p['steps'] ?? 4, `${primitive.id}.steps`), 1, 8));
      switch (style) {
        // §9.4 velocity: the kick is chopped into a break.
        case 'break':
          return samplesLoaded
            ? `stack(s("bd ~ ~ [~ bd]")${drumBank}.shape(.2).gain(${gain}), s("<rim rim [rim rim] rim>")${percBank}.fast(2).gain(${(Number(gain) * 0.3).toFixed(3)}).pan("<.2 .8 .4 .65>"))`
            : `s("sbd ~ ~ [~ sbd]").gain(${gain})`;
        // §69 breakbeat: bd ~ ~ bd ~ ~ [bd ~] ~ — it never lands on all four,
        // and it is driven hard enough to be the loudest thing in the mix.
        case 'broken':
          return samplesLoaded
            ? `s("bd ~ ~ bd ~ ~ [bd ~] ~")${drumBank}${shaped}.gain(${gain})`
            : `s("sbd ~ ~ sbd ~ ~ [sbd ~] ~").gain(${gain})`;
        // §73 bass music: four to the floor, distorted and clipped, and loud
        // enough that the sidechain under it is the whole groove.
        case 'hardgroove':
          return samplesLoaded
            ? `s("bd*4")${drumBank}.distort("1.8:.25").clip(.85).gain(${gain})`
            : `s("sbd*4").distort("1.8:.25").clip(.85).gain(${gain})`;
        // §9.2 space: a distant heartbeat, one hit per bar.
        case 'sparse':
          return samplesLoaded
            ? `s("bd ~ ~ ~")${drumBank}.gain(${gain})`
            : `s("sbd ~ ~ ~").gain(${gain})`;
        // §9.3 conversation: pushed off the grid.
        case 'swing':
          // §50 reference preset: the kick and the snare trade over eight steps.
          return samplesLoaded
            ? `s("bd ~ ~ sd ~ bd ~ sd")${drumBank}.gain(${gain})`
            : `s("sbd ~ ~ white ~ sbd ~ white").gain(${gain})`;
        // §34 garage: TWO-STEP. The second beat is left empty on purpose —
        // that hole is what the whole groove leans into.
        case 'twostep':
          // §77 reference preset: bd ~ ~ [~ bd] ~ ~ bd ~ — the second kick
          // lands LATE inside its step. That push is the whole two-step.
          return samplesLoaded
            ? `s("bd ~ ~ [~ bd] ~ ~ bd ~")${drumBank}${shaped}.gain(${gain})`
            : `s("sbd ~ ~ [~ sbd] ~ ~ sbd ~").gain(${gain})`;
        // §34 trap: half-time, and the 808 is allowed to ring.
        case 'halftime':
          // §50 reference preset: bd ~ ~ bd ~ ~ bd ~, and the 808 rings.
          return samplesLoaded
            ? `s("bd ~ ~ bd ~ ~ bd ~")${percBank}.lpf(120)${shaped}.gain(${gain})`
            : `s("sbd ~ ~ sbd ~ ~ sbd ~").gain(${gain})`;
        // §34 dub: one kick, then room for the echo to answer.
        case 'echo':
          // §50 reference preset: bd ~ ~ ~ bd ~ ~ ~ — mostly space.
          return samplesLoaded
            ? `s("bd ~ ~ ~ bd ~ ~ ~")${drumBank}.room(.4).lpf(180).gain(${gain})`
            : `s("sbd ~ ~ ~ sbd ~ ~ ~").room(.4).gain(${gain})`;
        // §34 breakbeat: this region has no drum machine at all.
        case 'timpani':
          return samplesLoaded
            ? `s("timpani ~ ~ ~").room(.6).gain(${gain})`
            : `note("a1 ~ ~ ~").s("sine").decay(.6).sustain(0).room(.6).gain(${gain})`;
        // §9.5 mutation: grouping that refuses to settle.
        case 'irregular':
          return samplesLoaded
            ? `s("[bd ~ ~] [bd ~] [~ bd]")${drumBank}.gain(${gain})`
            : `s("[sbd ~ ~] [sbd ~] [~ sbd]").gain(${gain})`;
        default:
          // Per-step velocity keeps a straight kick from sounding mechanical.
          return samplesLoaded
            ? `s("bd*${steps}")${drumBank}.gain("${gain} ${(Number(gain) * 0.94).toFixed(2)} ${gain} ${(Number(gain) * 0.96).toFixed(2)}")${shaped}`
            : `s("sbd*${steps}").gain(${gain})`;
      }
    }
    case 'snare': {
      const style = styleOf(p['style'], SNARE_STYLES, 'backbeat');
      if (style === 'ghost') {
        return samplesLoaded
          ? `s("[~ cp ~ cp]")${drumBank}.degradeBy(.4).gain(${gain})`
          : `s("[~ white ~ white]").decay(.06).sustain(0).bpf(1500).degradeBy(.4).gain(${gain})`;
      }
      // §34 trap/dub: a rim on the third beat instead of a backbeat.
      if (style === 'rim') {
        return samplesLoaded
          ? `s("~ ~ rim ~")${percBank}.room(.25).gain(${gain})`
          : `s("~ ~ white ~").decay(.05).sustain(0).bpf(2400).room(.25).gain(${gain})`;
      }
      // §69 breakbeat: one hard snare on 3 and 7, shaped.
      if (style === 'hard') {
        return samplesLoaded
          ? `s("~ ~ sd ~ ~ ~ sd ~")${drumBank}${shaped}.gain(${gain})`
          : `s("~ ~ white ~ ~ ~ white ~").decay(.14).sustain(0).bpf(1500)${shaped}.gain(${gain})`;
      }
      // §66b garage/house: the clap IS the backbeat — eight steps, on 3 and 7,
      // dry, exactly as the reference preset writes it.
      if (style === 'clap') {
        return samplesLoaded
          ? `s("~ ~ cp ~ ~ ~ cp ~")${percBank}.gain(${gain})`
          : `s("~ white ~ white").decay(.1).sustain(0).bpf(1700).room(.2).gain(${gain})`;
      }
      // §32: the second snare — an 808 body a hair behind the clap.
      if (style === 'body') {
        return samplesLoaded
          ? `s("~ sd ~ sd")${percBank}.late(.01).gain(${gain})`
          : `s("~ white ~ white").decay(.12).sustain(0).bpf(1200).late(.01).gain(${gain})`;
      }
      if (style === 'break') {
        return samplesLoaded
          ? `s("~ sd ~ [sd ~]")${percBank}.room(.08).gain(${gain})`
          : `s("[~ white] [white ~ white ~]").decay(.07).sustain(0).bpf(1900).gain(${gain})`;
      }
      return samplesLoaded
        // §66b reference preset: ~ ~ cp ~ ~ ~ cp ~ — dry, and on the plain
        // kit when the grammar asked for one.
        ? `s("~ ~ cp ~ ~ ~ cp ~")${drumBank}.gain(${gain})`
        : `s("~ ~ white ~ ~ ~ white ~").decay(.09).sustain(0).bpf(1800).gain(${gain})`;
    }
    case 'hat': {
      const style = styleOf(p['style'], HAT_STYLES, 'offbeat');
      // A cycle length that is not a power of two runs against the 4/4 grid
      // and only realigns after many bars: polymeter on one clock (§31).
      const cycle = Math.round(clamp(finite(p['cycle'] ?? 4, `${primitive.id}.cycle`), 2, 16));
      // §66c: a cycle other than four is polymeter (§31) — or, since §62,
      // energy asking a grammar to subdivide. Either way it must NOT replace a
      // style that has a figure of its own: doing so took UK garage's shuffle
      // away the moment the player flew hard, which is the one thing that
      // makes it UK garage.
      const hasOwnFigure = style === 'shuffle' || style === 'swing' || style === 'roll';
      if (cycle !== 4 && !hasOwnFigure) {
        return samplesLoaded
          ? `s("hh*${cycle}")${drumBank}.hpf(8000).gain(${gain})`
          : `s("white*${cycle}").decay(.03).sustain(0).hpf(8000).gain(${gain})`;
      }
      // §32: the second hat voice — 32nds of dirt at the very top.
      if (style === 'dirt') {
        return samplesLoaded
          ? `s("hh*32")${drumBank}.hpf(9500).gain("${(Number(gain) * 0.4).toFixed(3)} ${gain} ${(Number(gain) * 0.3).toFixed(3)} ${(Number(gain) * 1.2).toFixed(3)}")`
          : `s("white*32").decay(.015).sustain(0).hpf(9500).gain(${gain})`;
      }
      switch (style) {
        // §34 garage: skippy shuffled sixteenths — the displacement itself.
        case 'shuffle':
          // §77 reference preset: sixteenths SWUNG by a third, accented in
          // pairs, with an open hat slipping in one time in eight and the
          // whole thing drifting across the stereo field.
          return samplesLoaded
            ? `s("hh*16")${drumBank}.swingBy(1/3, 8).gain("[${gain} ${(Number(gain) * 0.51).toFixed(3)}]*8").sometimesBy(.12, x => x.s("oh")).hpf(7500).pan(sine.range(.35,.65).slow(3))`
            : `s("~ white ~ [white white] ~ white ~ white").decay(.03).sustain(0).hpf(7000).gain(${gain})`;
        // §34 trap: rolls that subdivide the bar under your feet.
        case 'roll':
          return samplesLoaded
            ? `s("hh*8 [hh*16] hh*8 [hh*32]")${percBank}.gain("${gain} ${(Number(gain) * 0.6).toFixed(3)}")`
            : `s("white*8 [white*16] white*8 [white*32]").decay(.02).sustain(0).hpf(8000).gain(${gain})`;
        // §69 breakbeat: four dark hits and gone — hh ~ ~ hh ~ hh ~ ~.
        case 'dark':
          return samplesLoaded
            ? `s("hh ~ ~ hh ~ hh ~ ~")${drumBank}.lpf(4200).gain(${gain})`
            : `s("white ~ ~ white ~ white ~ ~").decay(.03).sustain(0).hpf(6000).lpf(4200).gain(${gain})`;
        // §71 techno: eighths high and thin, an open hat on the offbeat, and a
        // second machine's shuffle whispering underneath.
        case 'techno':
          return samplesLoaded
            ? `stack(s("hh*8")${drumBank}.hpf(4000).gain(${gain}), s("~ oh ~ ~ ~ oh ~ ~")${drumBank}.hpf(3200).gain(${(Number(gain) * 0.76).toFixed(3)}), s("~ hh ~ [hh hh] ~ hh ~ hh")${percBank}.hpf(5000).gain(${(Number(gain) * 0.41).toFixed(3)}))`
            : `stack(s("white*8").decay(.02).sustain(0).hpf(4000).gain(${gain}), s("~ white ~ ~ ~ white ~ ~").decay(.08).sustain(0).hpf(3200).gain(${(Number(gain) * 0.76).toFixed(3)}))`;
        // §73 bass music: sixteenths with a hard accent pattern, and an open
        // hat on the offbeat above them.
        case 'pressure':
          return samplesLoaded
            ? `stack(s("hh*16")${drumBank}.hpf(6500).gain("[${(Number(gain) * 0.27).toFixed(3)} ${gain} ${(Number(gain) * 0.35).toFixed(3)} ${(Number(gain) * 1.0).toFixed(3)}]*4"), s("oh*4")${drumBank}.struct("~ x ~ x").hpf(5200).room(.25).gain(${(Number(gain) * 0.77).toFixed(3)}))`
            : `stack(s("white*16").decay(.02).sustain(0).hpf(6500).gain(${gain}), s("white*4").struct("~ x ~ x").decay(.08).sustain(0).hpf(5200).room(.25).gain(${(Number(gain) * 0.77).toFixed(3)}))`;
        case 'sixteenth':
          return samplesLoaded
            ? `stack(s("hh*16")${drumBank}.hpf(6500).gain("${(Number(gain) * 0.5).toFixed(2)} ${gain} ${(Number(gain) * 0.4).toFixed(2)} ${(Number(gain) * 1.1).toFixed(2)}"), s("~ oh ~ oh")${drumBank}.hpf(5000).gain(${(Number(gain) * 0.8).toFixed(3)}))`
            : `s("white*8").decay(.03).sustain(0).hpf(7000).gain(${gain})`;
        case 'swing':
          // §50 reference preset: hh ~ hh [hh hh] hh ~ hh ~ — brushed, uneven.
          return samplesLoaded
            ? `s("hh ~ hh [hh hh] hh ~ hh ~")${drumBank}.gain(${gain})`
            : `s("white ~ white [white white] white ~ white ~").decay(.035).sustain(0).hpf(6500).gain(${gain})`;
        case 'sparse':
          return samplesLoaded
            ? `s("~ ~ oh ~")${drumBank}.gain(${gain})`
            : `s("~ ~ white ~").decay(.05).sustain(0).hpf(5000).gain(${gain})`;
        default:
          // Offbeat open hat, with ghost sixteenths underneath (the classic
          // four-to-the-floor lift).
          return samplesLoaded
            ? `stack(s("[~ oh]*4")${drumBank}.gain(${gain}), s("[~ hh]*8")${drumBank}.gain(${(Number(gain) * 0.4).toFixed(3)}))`
            : `s("[~ white]*2").decay(.035).sustain(0).hpf(6000).gain(${gain})`;
      }
    }
    // §31: a percussion voice on its own cycle — ghost hits in DnB, a 5
    // against the 4 in Experimental.
    case 'perc': {
      if (p['deep'] === 'skip' && p['style'] === 'garage') {
        // §79 garage depth: the kick's second voice is a euclidean tom figure
        // on its own cycle, so it never lines up with the two-step.
        return samplesLoaded
          ? `stack(s("~ ~ rim ~ ~ rim ~ ~")${drumBank}.hpf(2500).every(4, x => x.ply(2)).gain(${gain}), s("<lt ht mt>(5,8)")${drumBank}.slow(1.5).hpf(400).room(.3).gain(${(Number(gain) * 0.94).toFixed(3)}))`
          : `s("~ ~ white ~ ~ white ~ ~").decay(.03).sustain(0).hpf(2500).gain(${gain})`;
      }
      if (p['style'] === 'garage') {
        // §77 reference preset: a ghost rim that doubles every fourth cycle,
        // and a swung shaker moving above it.
        return samplesLoaded
          ? `stack(s("~ ~ rim ~ ~ rim ~ ~")${drumBank}.hpf(2500).every(4, x => x.ply(2)).gain(${gain}), s("white*8").decay(.02).sustain(0).hpf(9000).swingBy(1/3, 8).gain(${(Number(gain) * 0.47).toFixed(3)}))`
          : `s("~ ~ white ~ ~ white ~ ~").decay(.03).sustain(0).hpf(2500).gain(${gain})`;
      }
      if (p['style'] === 'toms') {
        // §71 techno: toms walking across the bar, rim ghosts on the other machine.
        return samplesLoaded
          ? `stack(s("~ ~ lt ~ ~ mt ~ ht ~")${drumBank}.gain(${gain}), s("~ rim ~ ~ ~ [rim rim] ~ ~")${percBank}.gain(${(Number(gain) * 0.8).toFixed(3)}))`
          : `s("~ ~ white ~ ~ white ~ white ~").decay(.06).sustain(0).lpf(900).gain(${gain})`;
      }
      const cycle = Math.round(clamp(finite(p['cycle'] ?? 3, `${primitive.id}.cycle`), 2, 16));
      if (!samplesLoaded) {
        return `s("white*${cycle}").decay(.02).sustain(0).bpf(3200).gain(${gain})`;
      }
      // On the grid the percussion is a broken figure that shifts every bar;
      // off the grid (5, 7) it stays even, because the cycle length is the
      // point (§31 polymeter).
      return cycle > 4
        ? `s("rim*${cycle}")${percBank}.pan("<.25 .7 .45 .8>").gain(${gain})`
        : `s("<rim [~ rim] rim [rim ~]>")${percBank}.fast(${cycle / 2}).pan("<.25 .75 .4 .65>").gain("${gain} ${(Number(gain) * 1.5).toFixed(3)} ${(Number(gain) * 0.7).toFixed(3)} ${(Number(gain) * 1.3).toFixed(3)}")`;
    }
    case 'sub': {
      // §32: the sub moves with the bass rather than sitting on one note —
      // rests are what make a sub read as weight instead of as a drone.
      if (typeof p['notes'] === 'string') {
        const notes = noteList(p['notes'], primitive.id, ' ').split(' ');
        const [root = 'a1', , third = 'a1', fifth = 'a1'] = notes;
        return `note("<${root} ~ ${root} ~ ${third} ~ [${root} ${fifth}] ~>").s("sine").gain(${gain})`;
      }
      const note = p['note'];
      if (typeof note !== 'string' || !NOTE_RE.test(note)) {
        throw new TypeError(`StrudelEngine: invalid note for primitive "${primitive.id}"`);
      }
      return `note("${note}").s("sine").gain(${gain})`;
    }
    case 'bass': {
      // §29.2 fase 3: the bassline the player's low register earned.
      const style = styleOf(p['style'], BASS_STYLES, 'repetitive');
      const notes = noteList(p['notes'], primitive.id, ' ').split(' ');
      const root = notes[0]!;
      switch (style) {
        case 'sub':
          // Heavy sub: resonant and moving, not a held sine.
          return `note("<${root} ${root} ~ ${notes[2] ?? root}>").s("sawtooth").lpf("<180 240 150 320>").lpq(10)${shaped}.gain(${gain})`;
        case 'walking': {
          const line = [0, 1, 2, 3].map((i) => notes[i % notes.length]!).join(' ');
          return `note("${line}").s("triangle").decay(.3).sustain(.2).gain(${gain})`;
        }
        // §34 garage: short syncopated sub stabs, all holes and accents.
        case 'skip':
          // §66 reference preset: `f2 ~ ~ ab2 ~ c3 ~ eb2` — eight steps, all
          // holes and offbeats. That syncopation IS two-step; a rolling
          // sub-figure reads as house however you filter it.
          // §77 reference preset: a PURE sub carrying the root — no filter at
          // all — and a detuned, filtered, distorted reese doing the moving.
          return `stack(note("<${notes[0] ?? root} ${notes[0] ?? root} ${notes[1] ?? root} ${notes[2] ?? root}>").struct("x ~ ~ x ~ ~ x ~").s("sine").attack(.005).decay(.3).sustain(.35).release(.12).gain(${gain}), note("<[${notes[0] ?? root} ${notes[0] ?? root} ${notes[2] ?? root} ${notes[0] ?? root}] [${notes[0] ?? root} ${notes[0] ?? root} ${notes[1] ?? root} ${notes[3] ?? root}]>").struct("~ x ~ x ~ x ~ [x x]").s("sawtooth").detune(.12).lpf(sine.range(350,1600).slow(8)).lpq(9).lpenv(3).lpa(.005).lpd(.14).lps(.2).decay(.18).sustain(.15).release(.08).distort("1.6:.45").gain(${(Number(gain) * 0.75).toFixed(3)}))`;
        // §34 trap: the 808 that slides between its notes.
        case 'slide':
          // §34 trap: the 808 IS the low end, so it has to be heard on a
          // laptop as well as felt. `slide(1)` was a ZZFX control that a plain
          // sine ignores; the classic 808 glide is a pitch envelope, and the
          // filter opens far enough for the body to carry (§21: the low
          // register must stay perceptible).
          return `note("<${root} ~ ${notes[2] ?? root} ~>").s("sine").penv(-12).pdec(.14).decay(.9).sustain(.3).lpf(560).shape(.25).gain(${gain})`;
        // §34 dub: mostly silence, and a long decay into the room.
        // §69 breakbeat: the pressure under the sub — a saw, filtered low and
        // driven, on the same broken figure as the kick.
        case 'pressure':
          return `note("${notes[0] ?? root} ~ ~ ${notes[0] ?? root} ~ ${notes[1] ?? root} ${notes[2] ?? root} ~").s("sawtooth").lpf(240).shape(.65).gain(${gain})`;
        // §71 techno: a saw body with a little distortion, a square edge above
        // it and a slow pulse under everything. The sub is its own voice (§32).
        case 'deep':
          return `stack(note("${notes[0] ?? root} ~ ${notes[0] ?? root} ${notes[0] ?? root} ~ ${notes[1] ?? root} ~ ${notes[2] ?? root}").s("sawtooth").lpf(260).distort(.18).gain(${gain}), note("~ ${notes[0] ?? root} ~ ~ ${notes[1] ?? root} ~ ${notes[2] ?? root} ~").s("square").hpf(130).lpf(430).gain(${(Number(gain) * 0.29).toFixed(3)}), note("${notes[0] ?? root} ~ ~ ~ ${notes[0] ?? root} ~ ~ ~").s("pulse").lpf(330).gain(${(Number(gain) * 0.17).toFixed(3)}))`;
        // §73 bass music: one note every sixteenth, filtered to a growl — the
        // roll IS the track, and the sidechain cuts the holes into it.
        case 'rollingsub':
          return `note("<${notes[0] ?? root} ${notes[1] ?? root} ${notes[0] ?? root} ${notes[2] ?? root}>/2").struct("x*8").s("sawtooth").clip(.65).lpf(160).distort(.45).gain(${gain})`;
        case 'dubwise':
          return `note("<${root} ~ ~ [${notes[1] ?? root} ~] ~ ~ ${notes[2] ?? root} ~>").s("sine").decay(.5).sustain(.2).room(.3).gain(${gain})`;
        // §34 breakbeat: the left hand, bowed and sustained.
        case 'arco':
          return `note("<${root} ~ ${notes[2] ?? root} ~>").s("triangle").attack(.4).release(1.2).room(.5).gain(${gain})`;
        case 'rolling':
          return `note("${root} ~ ${root} ${root} ~ ${root} ${root} ~").s("sawtooth").decay(.12).sustain(0).lpf(900).gain(${gain})`;
        default: {
          // Moving root figure through a resonant low-pass — the funk in the
          // reference track comes from lpq, not from more notes.
          const line = [0, 1, 2, 3].map((i) => notes[i % notes.length]!).join(' ');
          return `note("<${line}>").s("sawtooth").lpf(420).lpq(8)${shaped}.gain(${gain})`;
        }
      }
    }
    case 'chord': {
      // Either a stacked chord (§29.2 fase 4) or one structure voice (§17).
      const slow = Math.round(clamp(finite(p['slow'] ?? 2, `${primitive.id}.slow`), 1, 8));
      const sound = p['sound'];
      const s = typeof sound === 'string' && VOICE_SOUNDS.has(sound) ? sound : 'sine';
      if (typeof p['notes'] === 'string') {
        const stacked = noteList(p['notes'], primitive.id, ',');
        const style = styleOf(p['style'], CHORD_STYLES, 'stab');
        // Ambient: a wide, slow pad — the chord IS the space (§31).
        if (style === 'pad') {
          return `note("[${stacked}]").s("triangle").slow(${slow}).lpf(1300).attack(.8).release(2).room(.9).gain(${gain})`;
        }
        // Jazz: a warm comped chord, pushed slightly late like a real hand.
        if (style === 'jazz') {
          return `note("[${stacked}]").s("triangle").slow(${slow}).lpf(2200).decay(.5).sustain(.25).late(.02).room(.25).gain(${gain})`;
        }
        // §34 house/breakbeat: real hands on a real instrument.
        if (style === 'piano') {
          return `note("[${stacked}]").s("piano").slow(${slow}).room(.3).gain(${gain})`;
        }
        // §34 house: the organ chord that carries a room.
        if (style === 'organ') {
          return `note("[${stacked}]").s("organ_full").slow(${slow}).room(.35).gain(${gain})`;
        }
        // §66 garage: the chord lands OFF the beat and stops immediately —
        // that displacement is what makes two-step sound like two-step.
        if (style === 'skip') {
          // §77 reference preset: short wet stabs OFF the beat, each answered
          // an octave up an eighth later, over a pad that breathes open across
          // sixteen cycles.
          // §78: the preset puts the stab an octave above the chord it came
          // from — that register is what makes it a garage stab and not a pad.
          return `stack(note("[${stacked}]").add(note(12)).struct("~ x ~ ~ x ~ ~ x").s("square").detune(.04).clip(.22).lpf(3200).lpq(3).attack(.002).decay(.12).sustain(.15).release(.1).room(.5).off(.125, x => x.add(note(12)).pan(.75)).gain(${gain}), note("[${stacked}]").s("supersaw").attack(.6).release(1.2).lpf(saw.range(500,3000).slow(16)).lpq(2).room(.7).gain(${(Number(gain) * 0.55).toFixed(3)}))`;
        }
        // §71 techno: a dark pad holding under a dissonant stab, with an FM
        // shadow an octave up — three voices, none of them in front.
        if (style === 'darkpad') {
          return `stack(note("[${stacked}]").s("supersaw").slow(4).lpf(580).attack(.8).release(1.5).room(.3).gain(${(Number(gain) * 0.38).toFixed(3)}), note("<[${stacked}] ~ ~ [${stacked}] ~>").s("square").lpf(720).decay(.12).gain(${gain}), note("[${stacked}]").s("fmpiano").slow(2).lpf(1300).gain(${(Number(gain) * 0.34).toFixed(3)}))`;
        }
        // §73 bass music: an acid line, not a chord — a resonant saw crawling
        // through the same notes the player found.
        if (style === 'acid') {
          return `note("[${stacked}]*4").s("sawtooth").lpf(sine.slow(6).range(180, 900)).lpq(11).distort("1.6:.25").gain(${gain})`;
        }
        // §69 breakbeat: one dark stab every other bar, and nothing else.
        if (style === 'dark') {
          return `note("<[${stacked}] ~ ~ ~>").s("square").slow(${slow}).lpf(550).gain(${gain})`;
        }
        // §34 dub: the off-beat skank, drowned in delay.
        if (style === 'skank') {
          return `note("[${stacked}]").s("triangle").struct("~ x ~ x").decay(.14).sustain(0).delay(.5).delayfeedback(.6).room(.5).gain(${gain})`;
        }
        // Techno/DnB: stabs, not pads — the filter sweep makes them speak.
        return `note("[${stacked}]").s("sawtooth").slow(${slow}).lpf("<900 1600 1100 2200>")${shaped}.room(.18).gain(${gain})`;
      }
      const note = p['note'];
      if (typeof note !== 'string' || !NOTE_RE.test(note)) {
        throw new TypeError(`StrudelEngine: invalid note for primitive "${primitive.id}"`);
      }
      const slot = Math.round(clamp(finite(p['slot'] ?? 0, `${primitive.id}.slot`), 0, 7));
      return `note("${note}").s("${s}").slow(2).late(${(slot * 0.25).toFixed(2)}).gain(${gain})`;
    }
    case 'melody': {
      // §29.2 fase 5: the phrase traced through pitch space.
      const notes = noteList(p['notes'], primitive.id, ' ');
      const slow = Math.round(clamp(finite(p['slow'] ?? 2, `${primitive.id}.slow`), 1, 8));
      const sound = p['sound'];
      const s = typeof sound === 'string' && VOICE_SOUNDS.has(sound) ? sound : 'triangle';
      const style = styleOf(p['style'], MELODY_STYLES, 'motif');
      switch (style) {
        // §73 bass music: the hook — a supersaw run with a detuned twin, its
        // filter breathing, and a high triangle answering it.
        case 'hook2':
          return `stack(note("${notes}").s("supersaw").legato(.28).distort(.32).lpf(sine.slow(8).range(450, 2400)).room(.55).delay(.125).gain(${gain}), note("${notes}").s("triangle").slow(${slow * 2}).legato(.22).lpf(2600).room(.75).delay(.1875).gain(${(Number(gain) * 0.59).toFixed(3)}))`;
        // §71 techno: sequencers, not a tune — a pulse line, a clavisynth
        // answering it and a casio far above, each on its own clock.
        case 'sequence':
          return `stack(note("${notes}").s("pulse").lpf(1250).decay(.07).gain(${gain}), note("${notes}").s("clavisynth").slow(${slow * 2}).lpf(1500).delay(.15).gain(${(Number(gain) * 0.71).toFixed(3)}), note("${notes}").s("casio").slow(${slow * 4}).hpf(1000).gain(${(Number(gain) * 0.4).toFixed(3)}))`;
        // Techno: not a tune but a dark stab — the hook is the rhythm.
        case 'stab':
          return `note("${notes}").s("square").slow(${slow}).lpf("<500 900 650 1300>")${shaped}.decay(.18).sustain(0).gain(${gain})`;
        // §34 trap/breakbeat: bells and mallets, bright and struck.
        case 'bell':
          return `note("${notes}").s("glockenspiel").slow(${slow}).room(.45).gain(${gain})`;
        // §34 garage: the chopped vocal-like hook.
        case 'vocal':
          // §79 garage depth: the same phrase a fifth up, twice as slow, on a
          // sine held open — it hangs over the pluck instead of doubling it.
          if (p['deep'] === 'skip') {
            return `note("${notes}").s("sine").slow(${slow}).clip(.8).attack(.05).release(.4).room(.7).pan(.25).gain(${gain})`;
          }
          // §77 reference preset: a short plucked line, mirrored into the
          // other channel and hurried every fourth cycle.
          return `note("${notes}").s("triangle").slow(${slow}).attack(.001).decay(.14).sustain(0).release(.1).clip(.4).delay(".4:.1875:.55").room(.4).jux(rev).every(4, x => x.hurry(2)).gain(${gain})`;
        // §34 dub: the melodica line, always one echo behind.
        case 'melodica':
          return `note("${notes}").s("harmonica").slow(${slow}).delay(.6).delayfeedback(.65).room(.5).gain(${gain})`;
        // Ambient: long tones that hang in the room and overlap each other.
        case 'long':
          return `note("${notes}").s("sine").slow(${slow * 2}).attack(1).release(3).delay(.35).room(.9).gain(${gain})`;
        // Jazz: a phrase that never repeats identically — the improvisation.
        case 'improv':
          return `note("${notes}").s("triangle").slow(${slow}).sometimesBy(.4, x => x.fast(2)).decay(.4).sustain(.15).room(.3).gain(${gain})`;
        // DnB: a short, hard hook that cuts through the break.
        case 'hook':
          return `note("${notes}").s("square").slow(${slow}).lpf(1400).decay(.12).sustain(0).gain(${gain})`;
        // Experimental: fragments, half of them missing.
        case 'fragment':
          return `note("${notes}").s("square").slow(${slow}).fm("<2 8 4 12>").degradeBy(.35).delay(.2).gain(${gain})`;
        default:
          return `note("${notes}").s("${s}").slow(${slow}).lpf("<700 900 1300 2000>").delay(.18).decay(.25).sustain(.1).gain(${gain})`;
      }
    }
    case 'break': {
      const intensity = Math.round(
        clamp(finite(p['intensity'] ?? 1, `${primitive.id}.intensity`), 1, 2),
      );
      return intensity === 2
        ? `s("[sbd sbd] [~ white] [sbd ~] [white white]").decay(.06).sustain(0).fast(2).gain(${gain})`
        : `s("sbd [~ white] [sbd sbd] white").decay(.07).sustain(0).fast(2).gain(${gain})`;
    }
    // §31: the world answering the player's phrase. A different timbre and a
    // half-bar delay, so it reads as a second musician rather than an echo.
    case 'response': {
      const notes = noteList(p['notes'], primitive.id, ' ');
      return `note("${notes}").s("sine").slow(2).late(.5).decay(.4).sustain(.2).room(.35).delay(.2).gain(${gain})`;
    }
    case 'texture': {
      const style = styleOf(p['style'], TEXTURE_STYLES, 'hats');
      switch (style) {
        // Ambient: air. Barely-there ticks drifting in a large room (§31).
        case 'air':
          return samplesLoaded
            ? `s("hh*8")${drumBank}.hpf(9000).slow(4).room(.9).gain("${(Number(gain) * 0.4).toFixed(3)} ${gain} ${(Number(gain) * 0.3).toFixed(3)} ${(Number(gain) * 0.7).toFixed(3)}")`
            : `s("white*8").decay(.02).sustain(0).hpf(9000).slow(4).room(.9).gain(${gain})`;
        // §34 garage/house: hand percussion keeping the top end alive.
        // §79 garage depth: a wide pink bed under the riser.
        case 'metallic':
          return p['deep'] === 'skip'
            ? `s("pink").clip(1).lpf(1500).room(.9).gain(${gain})`
            : `note("c6").s("square").fm("<3 7 5>").slow(3).hpf(3000).delay(.3).room(.4).gain(${gain})`;
        // §72 garage: air and dust, nothing you would call a part.
        case 'dust':
          // §77 reference preset: a riser sweeping the whole spectrum, with
          // dust behind it.
          return `stack(s("white").clip(1).hpf(saw.range(200,9000)).lpf(12000).attack(.4).release(.3).room(.6).gain(${gain}), s("crackle").hpf(4500).gain(${(Number(gain) * 0.2).toFixed(3)}))`;
        case 'shaker':
          // §66b reference preset: sh*8, even. `sh` is not in the maps we load,
          // and an absent name is silence (§38) — shaker_small is the real one.
          return samplesLoaded
            ? `s("shaker_small*8").gain(${gain})`
            : `s("white*8").decay(.02).sustain(0).hpf(8000).gain(${gain})`;
        // §34 dub/breakbeat: air and tape, the room breathing.
        // §71 techno: the machine room — crushed bytebeat, air, rumble, dust.
        case 'machine':
          return `stack(s("bytebeat").slow(4).bpf(1100).crush(6).gain(${gain}), s("pink").hpf(5000).room(.5).gain(${(Number(gain) * 0.5).toFixed(3)}), s("brown").slow(8).lpf(250).gain(${gain}), s("crackle").hpf(4500).gain(${(Number(gain) * 0.3).toFixed(3)}))`;
        // §69 breakbeat: low rumble under everything, felt more than heard.
        case 'rumble':
          return `s("white").slow(4).lpf(400).room(.75).gain(${gain})`;
        // §73 bass music: the foghorn — one long detuned note every other bar,
        // drowned in a huge room.
        case 'foghorn':
          return `s("supersaw").detune(.7).release(4).slow(2).fm(1.5).fmh(2.02).lpf(700).room(.9).roomsize(5).gain(${gain})`;
        case 'tape':
          return `s("brown").slow(6).lpf(900).room(.7).gain(${gain})`;
        // DnB: high-frequency noise riding over the break.
        case 'noise':
          return `s("white").slow(2).hpf(7000).decay(.3).sustain(.1).gain(${gain})`;
        // Jazz/Experimental: metallic, ringing, slightly unstable.
        case 'metallic':
          return `note("c6").s("square").fm("<3 7 5>").slow(3).hpf(3000).delay(.3).room(.4).gain(${gain})`;
        default:
          // Techno: the top-end shimmer of fast, quiet hats.
          return samplesLoaded
            ? `s("hh*16")${drumBank}.hpf(9000).gain("${(Number(gain) * 0.4).toFixed(3)} ${gain} ${(Number(gain) * 0.3).toFixed(3)} ${gain}")`
            : `s("white*16").decay(.02).sustain(0).hpf(9000).gain(${gain})`;
      }
    }
    case 'drone': {
      const note = p['note'];
      if (typeof note !== 'string' || !NOTE_RE.test(note)) {
        throw new TypeError(`StrudelEngine: invalid note for primitive "${primitive.id}"`);
      }
      return `note("${note}").s("sine").slow(4).attack(2).release(4).room(.85).gain(${gain})`;
    }
    default:
      throw new Error(
        `StrudelEngine: primitive kind "${primitive.kind}" is not in the template library`,
      );
  }
}

function renderAction(action: MusicalAction): string {
  const gain = clamp(finite(action.gain, 'action.gain'), 0, 1).toFixed(3);
  if (action.kind === 'throw') {
    // One gesture per turn, thrown into the track and left to decay (§33).
    switch (action.style) {
      case 'echo':
        return samplesLoaded
          ? `s("~ cp").bank("${DEFAULT_BANK}").delay("0.55:0.375:0.72").room(.35).gain(${gain})`
          : `s("~ white").decay(.09).sustain(0).bpf(1800).delay("0.55:0.375:0.72").gain(${gain})`;
      case 'riser':
        return `s("white").hpf(1400).attack(.35).decay(.5).sustain(0).room(.45).gain(${gain})`;
      case 'impact':
        // §60 the drop itself: a low hit with a crash of air over it, so the
        // word on screen and the sound arrive together.
        return samplesLoaded
          ? `stack(s("bd").bank("${DEFAULT_BANK}").lpf(140).gain(${gain}), s("white").hpf(900).decay(.9).sustain(0).room(.6).gain(${(Number(gain) * 0.55).toFixed(3)}))`
          : `stack(s("sbd").gain(${gain}), s("white").hpf(900).decay(.9).sustain(0).room(.6).gain(${(Number(gain) * 0.55).toFixed(3)}))`;
      case 'bell':
        return samplesLoaded
          ? `s("vibraphone").room(.6).gain(${gain})`
          : `note("a4").s("sine").decay(.9).sustain(0).room(.6).gain(${gain})`;
      case 'sweep':
      default:
        return `s("white").lpf(700).attack(.2).decay(.7).sustain(0).room(.3).gain(${gain})`;
    }
  }
  // Both M4 action kinds share one off-beat clap accent template.
  return `s("[~ white]").decay(.08).sustain(0).bpf(2200).gain(${gain})`;
}

/**
 * §3: the flight plays the track. Brightness, space, push, note length and grit
 * come from how the player is flying and are applied to every voice here.
 *
 * Strudel treats these as single-use controls: chaining one that the template
 * already set OVERRIDES the template. So anything the template chose for itself
 * (its own filter, its own reverb) wins, and the performance only fills in what
 * the voice left open. `postgain` is never used in a template, so the wind's
 * force always reaches the mix.
 */
/** Layers whose filter travels over bars instead of standing still (§48). */
const AUTOMATED: ReadonlySet<LayerName> = new Set<LayerName>(['harmony', 'texture', 'atmosphere']);

function applyPerformance(
  code: string,
  layer: LayerName,
  perf?: Performance,
  moving = false,
): string {
  if (perf === undefined) return code;
  let out = code;
  if (!out.includes('.lpf(')) {
    const top = Math.round(perf.brightHz);
    // §48 automation: a filter that opens and closes over eight bars is the
    // difference between a pad that sits there and one that breathes.
    out += moving && AUTOMATED.has(layer)
      ? `.lpf(sine.range(${Math.round(top * 0.45)}, ${top}).slow(8))`
      : `.lpf(${top})`;
  }
  if (!out.includes('.room(')) out += `.room(${perf.space.toFixed(2)})`;
  // §3.8 duration is memory — only for voices that hold a note; clipping a
  // drum sample just chokes it.
  if (SUSTAINED_LAYERS.has(layer) && !out.includes('.clip(')) {
    out += `.clip(${perf.length.toFixed(2)})`;
  }
  if (perf.grit > 0.02 && !out.includes('.shape(')) out += `.shape(${perf.grit.toFixed(2)})`;
  // Climbing lifts the pitched voices together, in steps of the key, so the
  // track transposes without ever going out of tune (user decision).
  if (perf.transpose !== 0 && PITCHED_LAYERS.has(layer)) out += `.add(note(${perf.transpose}))`;
  // §3.1: skimming the ground IS the low register. Down there the bass and the
  // kick carry the track; up in the air they step back and the detail takes over.
  const weighted =
    layer === 'bass' ? 0.7 + perf.weight * 1.0
    : layer === 'drums' ? 0.9 + perf.weight * 0.35
    : layer === 'harmony' || layer === 'melody' ? 1 - perf.weight * 0.2
    : 1;
  const push = perf.push * weighted;
  return `${out}.postgain(${clamp(push, 0, 2).toFixed(2)})`;
}

/**
 * The variations of a part (endless journey, user decision). Structural
 * transforms only — the material stays the player's, it just moves
 * differently, so a finished track never loops itself to death.
 */
const VARIATIONS: Partial<Record<LayerName, readonly string[]>> = {
  drums: ['', '.iter(4)', '.degradeBy(.09)', '.late(.012)', '.ply("<1 1 2 1>")'],
  bass: ['', '.iter(2)', '.rev()', '.ply(2)', '.degradeBy(.1)'],
  harmony: ['', '.jux(rev)', '.iter(4)', '.late(.03)', '.ply(2)'],
  melody: ['', '.rev()', '.iter(3)', '.jux(rev)', '.late(.05)'],
  texture: ['', '.rev()', '.iter(2)', '.late(.05)', '.degradeBy(.15)'],
};

function applyVariation(code: string, layer: LayerName, variations?: LayerVariations): string {
  const index = variations?.[layer] ?? 0;
  if (index === 0) return code;
  const list = VARIATIONS[layer];
  return list === undefined ? code : `${code}${list[index % list.length] ?? ''}`;
}

/**
 * §48 PRODUCTION (user decision). Four things that turn a stack of correct
 * parts into something that sounds mixed, all of them inside the vocabulary
 * Strudel already gives us, and all of them dosed by the grammar:
 *
 * - separate reverb buses, so the kick stays dry while the harmony sits in the
 *   room (patterns sharing an orbit share ONE delay and reverb)
 * - sidechain pumping: the bass and the chords duck under every kick
 * - fills: the last bar of every eight turns around instead of repeating
 * - automation: filters that travel over bars instead of standing still
 */
const LAYER_ORBIT: Partial<Record<LayerName, number>> = {
  drums: 1,
  bass: 1,
  harmony: 2,
  melody: 2,
  texture: 3,
  atmosphere: 3,
};

/** Layers that duck under the kick, and how much of the grammar's pump they take. */
const DUCKED: Partial<Record<LayerName, number>> = {
  bass: 1,
  harmony: 0.75,
  melody: 0.5,
  texture: 0.4,
};

/** The last bar of every eight turns around — this is what makes a loop a song. */
const FILLS: Partial<Record<LayerName, string>> = {
  drums: '.lastOf(8, x => x.fast(2))',
  bass: '.lastOf(8, x => x.degradeBy(.3))',
  harmony: '.lastOf(8, x => x.late(.02))',
};

function applyProduction(
  code: string,
  layer: LayerName,
  production?: MusicalLayerGraph['production'],
): string {
  if (production === undefined) return code;
  let out = code;
  const orbit = LAYER_ORBIT[layer];
  if (orbit !== undefined && !out.includes('.orbit(')) out += `.orbit(${orbit})`;
  const duck = (DUCKED[layer] ?? 0) * production.duck;
  // Ambient, jazz and breakbeat have drive 0, so they never pump — a swelling
  // pad ducking under a kick that is not there would be nonsense.
  if (duck > 0.05 && !out.includes('.duckorbit(')) {
    out += `.duckorbit(1).duckdepth(${duck.toFixed(2)}).duckattack(.06)`;
  }
  const fill = FILLS[layer];
  if (fill !== undefined && production.duck > 0.05 && !out.includes('.lastOf(')) out += fill;
  return out;
}

/** Layers that actually carry notes, and can therefore be transposed. */
const PITCHED_LAYERS: ReadonlySet<LayerName> = new Set<LayerName>(['bass', 'harmony', 'melody']);

/** Layers whose voices hold a note long enough for note length to mean anything. */
const SUSTAINED_LAYERS: ReadonlySet<LayerName> = new Set<LayerName>([
  'bass', 'harmony', 'melody', 'texture', 'atmosphere',
]);

/**
 * Deterministically map a layer graph (plus one-shot actions) to pattern code.
 *
 * `plain` strips everything decorative — the §3 performance, the §53
 * variations and the §48 production — leaving the parts themselves. It is what
 * the engine falls back to when a pattern fails to evaluate: ONE bad
 * expression must never take the whole track down with it (§65).
 */
export function buildPatternCode(
  graph: MusicalLayerGraph,
  actions: MusicalAction[] = [],
  plain = false,
): string {
  const parts: string[] = [];
  for (const name of LAYER_NAMES) {
    const layer = graph.layers[name];
    for (const primitive of layer.primitives) {
      const voice = withVoice(renderPrimitive(primitive, layer), primitive);
      parts.push(
        plain
          ? voice
          : applyProduction(
              applyVariation(
                applyPerformance(
                  voice,
                  name,
                  graph.performance,
                  (graph.production?.duck ?? 0) > 0.05,
                ),
                name,
                graph.variations,
              ),
              name,
              graph.production,
            ),
      );
    }
  }
  for (const action of actions) {
    parts.push(renderAction(action));
  }
  if (parts.length === 0) return '';
  return `stack(\n  ${parts.join(',\n  ')}\n)`;
}

/** Every voice in the track, in playing order — the parts of the score (§32). */
export function trackParts(graph: MusicalLayerGraph): Array<{ id: string; code: string }> {
  const parts: Array<{ id: string; code: string }> = [];
  for (const name of LAYER_NAMES) {
    const layer = graph.layers[name];
    for (const primitive of layer.primitives) {
      parts.push({
        id: primitive.id,
        code: applyProduction(
          applyVariation(
            applyPerformance(
              withVoice(renderPrimitive(primitive, layer), primitive),
              name,
              graph.performance,
              (graph.production?.duck ?? 0) > 0.05,
            ),
            name,
            graph.variations,
          ),
          name,
          graph.production,
        ),
      });
    }
  }
  return parts;
}

export class StrudelEngine implements StrudelEnginePort {
  private context: AudioContext | null = null;
  private outputGain: GainNode | null = null;
  private repl: StrudelRepl | null = null;
  private started = false;
  private disposed = false;
  /** §43: true once the vendored local library is in use. */
  private localSamples = false;

  private appliedGraph: MusicalLayerGraph = createEmptyLayerGraph();
  private baseCode = '';
  private playing = false;

  private pendingGraph: MusicalLayerGraph | null = null;
  private pendingActions: MusicalAction[] = [];
  private revertPending = false;
  private boundaryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly beatHandlers = new Set<(event: StrudelBeatEvent) => void>();
  private beatTimer: ReturnType<typeof setTimeout> | null = null;

  async initialize(audioContext: AudioContext): Promise<void> {
    if (this.repl !== null) return;
    this.context = audioContext;
    const gain = audioContext.createGain();
    gain.gain.value = STRUDEL_HEADROOM;
    this.outputGain = gain;
    try {
      this.repl = await initStrudel({ audioContext });
    } catch (cause) {
      throw new Error('StrudelEngine: failed to initialize @strudel/web', { cause });
    }
    // The drum machines (strudel.cc/learn/samples § Sound Banks). This map is
    // what `${drumBank}` resolves against — WITHOUT it every banked
    // template is silent, and oh/rim do not exist at all. Dirt-Samples alone
    // is not enough: it has no banks.
    // Sample maps are fetched lazily over the network, so this can fail
    // offline — the templates fall back to built-in synth voices and the
    // world still sounds. Never blocks the unlock.
    void Promise.resolve()
      // Local first (§43). If it is not vendored yet, fall back to the remote
      // maps — the drum machines decide whether the kit is real, and the rest
      // are extra palette that must not be able to hold the drums back.
      .then(async () => {
        try {
          // A dev server answers unknown paths with index.html, so "200" is
          // not proof: the body has to actually be a sample map.
          const probe = await fetch(LOCAL_SAMPLE_MAP);
          const map: unknown = probe.ok ? await probe.json() : null;
          if (map !== null && typeof map === 'object' && '_base' in map) {
            await samples(LOCAL_SAMPLE_MAP);
            this.localSamples = true;
            return;
          }
        } catch {
          // Not vendored yet: fall back to the network maps below.
        }
        await samples(DRUM_MACHINES_URL);
      })
      .then(() => {
        this.samplesReady = true;
        setSamplesLoaded(true);
        // §75: the GM instruments come after, lazily imported so they stay out
        // of the main bundle. They must never hold up the drums, and a failure
        // costs those voices and nothing else.
        void import('@strudel/soundfonts')
          .then(({ registerSoundfonts }) => {
            registerSoundfonts();
            this.soundfontsReady = true;
            setSoundfontsLoaded(true);
          })
          .catch((error: unknown) => {
            console.warn('StrudelEngine: soundfonts unavailable', error);
          });
        if (this.localSamples) return; // everything is already in-house
        for (const map of SAMPLE_MAPS.slice(1)) {
          void Promise.resolve()
            .then(() => samples(map))
            .catch(() => undefined);
        }
      })
      .catch(() => {
        this.samplesReady = false;
        setSamplesLoaded(false);
      });
    // Reroute superdough's hard-wired destination connection through our
    // gain so the game keeps master-volume and headroom control (§12, §21).
    const destinationGain = getSuperdoughAudioController().output.destinationGain;
    destinationGain.disconnect();
    destinationGain.connect(gain);
  }

  async start(): Promise<void> {
    const repl = this.requireRepl();
    this.started = true;
    if (this.baseCode !== '' && !this.playing) {
      this.evaluate(repl, this.baseCode);
    }
  }

  stop(): void {
    this.started = false;
    this.playing = false;
    this.clearBoundaryTimer();
    this.clearBeatTimer();
    this.pendingGraph = null;
    this.pendingActions = [];
    this.revertPending = false;
    this.repl?.stop();
  }

  /**
   * §63: the notes about to sound, in the next `windowSeconds`. Returns an
   * empty list whenever the runtime cannot answer — the visuals then simply
   * have nothing to draw, which is better than drawing something false.
   */
  upcomingNotes(windowSeconds: number): MusicalNote[] {
    const pattern = this.repl?.scheduler.pattern;
    if (!pattern || !this.playing) return [];
    const cps = this.appliedGraph.bpm > 0 ? bpmToCps(this.appliedGraph.bpm) : 0;
    if (cps <= 0) return [];
    const from = this.repl!.scheduler.now();
    const to = from + windowSeconds * cps;
    let haps: Array<{ whole?: { begin: number } | undefined; value: Record<string, unknown> }>;
    try {
      haps = pattern.queryArc(from, to);
    } catch {
      return [];
    }
    const notes: MusicalNote[] = [];
    for (const hap of haps) {
      // No `whole` means a fragment: superdough never sounds it, so nor do we.
      if (hap.whole === undefined) continue;
      const kind = noteKindOf(hap.value);
      if (kind === null) continue;
      const gain = typeof hap.value['gain'] === 'number' ? (hap.value['gain'] as number) : 1;
      notes.push({
        kind,
        cycle: hap.whole.begin,
        inSeconds: Math.max(0, (hap.whole.begin - from) / cps),
        velocity: clamp(gain, 0, 1),
      });
    }
    return notes;
  }

  /**
   * §74: play the parts BARE — no performance shaping, no variations, no
   * production. The bench needs it, because three coats applied to every
   * grammar alike are exactly what makes ten worlds sound like family.
   */
  setBare(bare: boolean): void {
    if (this.bare === bare) return;
    this.bare = bare;
    this.baseCode = buildPatternCode(this.appliedGraph, [], this.bare);
    if (this.repl && this.started) this.evaluate(this.repl, this.baseCode);
  }

  private bare = false;

  setLayerGraph(graph: MusicalLayerGraph, boundary: 'beat' | 'bar' = 'bar'): void {
    this.requireRepl();
    // Coalesce: only the latest pending graph is applied at the next boundary.
    this.pendingGraph = graph;
    this.scheduleApply(boundary);
  }

  setParameter(name: MusicParameter, value: number): void {
    finite(value, name);
    const repl = this.requireRepl();
    switch (name) {
      case 'bpm': {
        this.appliedGraph = { ...this.appliedGraph, bpm: clamp(value, MIN_BPM, MAX_BPM) };
        repl.setCps(bpmToCps(value));
        return;
      }
      case 'gain': {
        const gain = this.requireOutput();
        const now = this.context?.currentTime ?? 0;
        gain.gain.setTargetAtTime(clamp(value, 0, 1) * STRUDEL_HEADROOM, now, GAIN_RAMP_SECONDS);
        return;
      }
    }
  }

  schedule(event: MusicalAction, boundary: 'beat' | 'bar'): void {
    this.requireRepl();
    this.pendingActions.push(event);
    this.scheduleApply(boundary);
  }

  /**
   * Beat-boundary callbacks (§20 M4): fired while a pattern is playing, from
   * a self-correcting timer re-anchored to the Strudel scheduler clock each
   * beat — independent of render FPS, no per-frame work.
   */
  onBeat(handler: (event: StrudelBeatEvent) => void): () => void {
    this.beatHandlers.add(handler);
    this.startBeatTicker();
    return () => {
      this.beatHandlers.delete(handler);
      if (this.beatHandlers.size === 0) this.clearBeatTimer();
    };
  }

  getOutputNode(): AudioNode {
    return this.requireOutput();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.outputGain?.disconnect();
    this.outputGain = null;
    this.repl = null;
    this.context = null;
  }

  private requireRepl(): StrudelRepl {
    if (this.repl === null) {
      throw new Error('StrudelEngine is not initialized. Call initialize() first.');
    }
    return this.repl;
  }

  private requireOutput(): GainNode {
    if (this.outputGain === null) {
      throw new Error('StrudelEngine is not initialized. Call initialize() first.');
    }
    return this.outputGain;
  }

  private clearBoundaryTimer(): void {
    if (this.boundaryTimer !== null) {
      clearTimeout(this.boundaryTimer);
      this.boundaryTimer = null;
    }
  }

  private clearBeatTimer(): void {
    if (this.beatTimer !== null) {
      clearTimeout(this.beatTimer);
      this.beatTimer = null;
    }
  }

  private startBeatTicker(): void {
    if (this.beatTimer !== null || !this.playing || this.beatHandlers.size === 0) return;
    const bpm = this.appliedGraph.bpm;
    if (!(bpm > 0)) return;
    const nowCycles = this.repl?.scheduler.now() ?? 0;
    const ms = msUntilNextCycleBoundary(nowCycles, bpm, 'beat');
    const beatMs = 60_000 / clamp(bpm, MIN_BPM, MAX_BPM);
    // Exactly on a boundary: wait one full beat rather than firing immediately.
    this.beatTimer = setTimeout(() => {
      this.beatTimer = null;
      if (this.disposed || !this.playing) return;
      const atMs = (this.context?.currentTime ?? 0) * 1000;
      for (const handler of [...this.beatHandlers]) handler({ atMs });
      this.startBeatTicker();
    }, ms === 0 ? beatMs : ms);
  }

  private scheduleApply(boundary: 'beat' | 'bar'): void {
    if (this.boundaryTimer !== null) return; // pending apply picks up the latest state
    // The wait runs on the CURRENTLY AUDIBLE grid (applied tempo); a pending
    // tempo only takes effect once applied. Not playing -> scheduler.now() is
    // 0 -> phase 0 -> apply immediately (there is no audible grid to respect).
    const nowCycles = this.repl?.scheduler.now() ?? 0;
    const ms = msUntilNextCycleBoundary(nowCycles, this.appliedGraph.bpm, boundary);
    this.boundaryTimer = setTimeout(() => {
      this.boundaryTimer = null;
      this.applyPending();
    }, ms);
  }

  private applyPending(): void {
    if (this.disposed || this.repl === null) return;
    const repl = this.repl;
    const next = this.pendingGraph;
    this.pendingGraph = null;
    const actions = this.pendingActions.splice(0);
    const revert = this.revertPending;
    this.revertPending = false;

    let dirty = revert;
    if (next !== null && diffLayerGraph(this.appliedGraph, next).length > 0) {
      if (next.bpm > 0 && next.bpm !== this.appliedGraph.bpm) {
        repl.setCps(bpmToCps(next.bpm));
      }
      this.appliedGraph = next;
      this.baseCode = buildPatternCode(next, [], this.bare);
      dirty = true;
    }
    if (actions.length > 0) {
      dirty = true;
    }
    if (!dirty) return;

    const code =
      actions.length > 0 ? buildPatternCode(this.appliedGraph, actions, this.bare) : this.baseCode;
    if (code === '') {
      if (this.playing) {
        repl.stop();
        this.playing = false;
        this.clearBeatTimer();
      }
      return;
    }
    if (this.started) {
      this.evaluate(repl, code);
    }
    if (actions.length > 0) {
      // One-shot overlay: revert to the base pattern at the next bar.
      this.revertPending = true;
      this.scheduleApply('bar');
    }
  }

  /** True once the sample bank finished loading; templates upgrade to real
   * drums when it does (§30). */
  private samplesReady = false;
  /** §75: true once the GM instruments are registered. */
  private soundfontsReady = false;

  /** The pattern source the world last wrote — shown read-only in the UI
   * overlay (§11: never an editable REPL). */
  get code(): string {
    return this.lastCode;
  }

  private lastCode = '';

  /** Diagnostic status (dev debug handle): playing state, bpm and evaluation count. */
  get status(): {
    playing: boolean;
    bpm: number;
    evaluations: number;
    samples: boolean;
    soundfonts: boolean;
    local: boolean;
    degraded: boolean;
  } {
    return {
      playing: this.playing,
      bpm: this.appliedGraph.bpm,
      evaluations: this.evaluations,
      samples: this.samplesReady,
      soundfonts: this.soundfontsReady,
      local: this.localSamples,
      degraded: this.degraded,
    };
  }

  private evaluations = 0;

  private evaluate(repl: StrudelRepl, code: string): void {
    this.playing = true;
    this.lastCode = code;
    this.evaluations += 1;
    this.startBeatTicker();
    void repl.evaluate(code, true).catch((error: unknown) => {
      // §65 audio boundary: a bad pattern must not take the game loop down —
      // and it must not take the MUSIC down either. Everything decorative is
      // dropped and the parts alone are played, so the track keeps sounding
      // while the console says exactly what failed.
      console.error('StrudelEngine: pattern evaluation failed', error);
      const bare = buildPatternCode(this.appliedGraph, [], true);
      if (bare === '' || bare === code) return;
      this.degraded = true;
      this.lastCode = bare;
      void repl.evaluate(bare, true).catch((fallbackError: unknown) => {
        console.error('StrudelEngine: even the bare pattern failed', fallbackError);
      });
    });
  }

  /** True once a pattern failed and the engine dropped back to bare parts. */
  private degraded = false;
}
