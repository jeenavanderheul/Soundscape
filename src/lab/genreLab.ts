import { AudioEngine } from '../audio/AudioEngine';
import { StrudelEngine } from '../audio/StrudelEngine';
import {
  genreGrammar,
  regionBpm,
  LAYER_NAMES,
  type LayerName,
  type MusicalLayerGraph,
} from '../audio/MusicalPrimitives';
import { buildWorldLayerGraph, worldBankLabel } from '../audio/WorldLayerGraph';
import type { GenreAffinity } from '../music/MusicState';
import { createInitialMusicState } from '../music/MusicState';
import { performanceFrom } from '../music/Performance';
import { LEVEL_DEEP, createInitialTrackState, type TrackGenre, type TrackState } from '../music/TrackState';
import { sectionLabel as phaseLabel, type Section } from '../music/ArrangementEngine';
import {
  GENRE_LAB_PRESETS,
  genreLabPresetLabel,
  type GenreLabPreset,
} from './genreLabWorlds';

/**
 * §68 GENRE LAB — a bench, not a game.
 *
 * The world only ever plays a track you are BUILDING, which makes it hard to
 * judge whether a grammar is any good: you hear a kick, then a kick and hats,
 * and the finished thing only much later. Here every world is played complete
 * — all seven layers earned AND grown deep — with the flight and the mix on
 * sliders, so the end result can be judged and tuned in seconds.
 *
 * It runs the real engine: the same buildLayerGraph, the same templates, the
 * same StrudelEngine. Nothing here is a mock, or it would be worth nothing.
 */

// §84: the eight phases of the FLIGHT arc, in the order they are flown.
const SECTIONS: Section[] = [
  'intro', 'groove', 'discovery', 'build', 'drop', 'deep', 'break', 'return',
];

/** A track with everything on it: what a flight ends up with (§32). */
function finishedTrack(genre: Exclude<TrackGenre, null>, section: Section): TrackState {
  const deep = { unlocked: true, level: LEVEL_DEEP };
  return {
    ...createInitialTrackState(),
    genre,
    form: section,
    bpm: regionBpm(genreGrammar(genre)),
    drums: { kick: deep, snare: deep, hats: deep },
    bass: deep,
    harmony: deep,
    melody: deep,
    texture: deep,
    rootMidi: 45,
    harmonyIntervals: [0, 3, 7, 10],
    melodyNotes: [69, 72, 76, 74, 69, 67],
  };
}

function affinityFor(genre: Exclude<TrackGenre, null>): GenreAffinity {
  const zero = {
    techno: 0, 'sub-pressure': 0, ambient: 0, jazz: 0, bass: 0, experimental: 0,
    garage: 0, house: 0, trap: 0, dub: 0, breakbeat: 0,
  };
  return { ...zero, [genre]: 1 };
}

interface Knob {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** How to print it next to the slider. */
  format?: (value: number) => string;
}

const FLIGHT: Knob[] = [
  { id: 'energy', label: 'energy', min: 0, max: 1, step: 0.05, value: 0.7 },
  { id: 'altitude', label: 'altitude', min: 0, max: 70, step: 1, value: 19, format: (v) => `${v}` },
  { id: 'amplitude', label: 'wind', min: 0, max: 1, step: 0.05, value: 0.4 },
  { id: 'motion', label: 'motion gate', min: 0, max: 1, step: 0.125, value: 1 },
  { id: 'bpm', label: 'bpm ×', min: 0.6, max: 1.6, step: 0.01, value: 1 },
];

const MIX: Knob[] = LAYER_NAMES.filter((l) => l !== 'events').map((layer) => ({
  id: `mix-${layer}`,
  label: layer,
  min: 0,
  max: 1.5,
  step: 0.05,
  value: 1,
}));

const ALL_KNOBS = [...FLIGHT, ...MIX];
const values = new Map<string, number>();
for (const knob of ALL_KNOBS) values.set(knob.id, knob.value);
/** Every slider element, so `reset` can put them back where they started. */
const inputs = new Map<string, HTMLInputElement>();
/** What the grammar itself says, before anything on this page touched it. */
const DEFAULT_SECTION: Section = 'drop';

let preset: GenreLabPreset = 'techno';
let section: Section = 'drop';
let playing = false;
const sectionSelect = document.createElement('select');

const audio = new AudioEngine();
const strudel = new StrudelEngine();

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const codeBox = $('code');
const status = $('status');

function knobRow(knob: Knob, onInput: () => void): HTMLElement {
  const label = document.createElement('label');
  const name = document.createElement('span');
  name.textContent = knob.label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(knob.min);
  input.max = String(knob.max);
  input.step = String(knob.step);
  input.value = String(knob.value);
  const out = document.createElement('output');
  const print = () => {
    const value = Number(input.value);
    values.set(knob.id, value);
    out.textContent = knob.format ? knob.format(value) : value.toFixed(2);
  };
  print();
  input.addEventListener('input', () => {
    print();
    onInput();
  });
  inputs.set(knob.id, input);
  knobPrinters.set(knob.id, print);
  label.append(name, input, out);
  return label;
}

/** Redraws a knob's read-out after `reset` moves it. */
const knobPrinters = new Map<string, () => void>();

/**
 * Back to what the grammar says: every slider to its default and the section
 * to the drop. Tuning is only useful if you can hear the untouched version
 * again in one click.
 */
function resetKnobs(): void {
  for (const knob of ALL_KNOBS) {
    values.set(knob.id, knob.value);
    const input = inputs.get(knob.id);
    if (input) input.value = String(knob.value);
    knobPrinters.get(knob.id)?.();
  }
  section = DEFAULT_SECTION;
  sectionSelect.value = DEFAULT_SECTION;
  apply();
}

/** Everything the sliders say, turned into the graph the engine plays. */
function currentGraph(): MusicalLayerGraph {
  // Every world, finished: all seven layers earned AND grown deep. The game
  // discovers exactly this, rung by rung — same builder, same numbers (§81).
  const track = finishedTrack(preset, section);
  const music = {
    ...createInitialMusicState(),
    bpm: track.bpm,
    tempoConfidence: 0.6,
    dynamics: values.get('energy') ?? 0.7,
    rhythmDensity: 1,
    pitchCenter: 220,
  };
  const performance = performanceFrom(music, {
    altitude: values.get('altitude') ?? 19,
    amplitude: values.get('amplitude') ?? 0.4,
    velocity: (values.get('energy') ?? 0.7) * 66,
  });
  const graph = buildWorldLayerGraph({
    music,
    affinity: affinityFor(preset),
    structures: [],
    track,
    patterns: {},
    motion: values.get('motion') ?? 1,
    energy: values.get('energy') ?? 0.7,
    performance,
    mix: Object.fromEntries(
      LAYER_NAMES.map((layer) => [layer, values.get(`mix-${layer}`) ?? 1]),
    ),
  });
  graph.performance = performance;
  // The lab's own tempo trim, on top of what altitude already does (§58).
  graph.bpm = Math.round(graph.bpm * (values.get('bpm') ?? 1) * graph.performance.tempoRatio);
  // Per-layer trim: the sliders multiply the gains the grammar chose.
  for (const layer of LAYER_NAMES) {
    const trim = values.get(`mix-${layer as LayerName}`) ?? 1;
    if (trim === 1) continue;
    for (const primitive of graph.layers[layer].primitives) {
      const gain = primitive.parameters['gain'];
      if (typeof gain === 'number') {
        primitive.parameters['gain'] = Math.round(Math.min(1, gain * trim) * 100) / 100;
      }
    }
  }
  return graph;
}

function apply(): void {
  const graph = currentGraph();
  if (playing) strudel.setLayerGraph(graph, 'bar');
  // Show what the world is writing, whether or not it is sounding (§40).
  codeBox.textContent = strudel.code || '// press play';
}

async function start(): Promise<void> {
  if (playing) return;
  status.textContent = 'starting…';
  await audio.initialize();
  await strudel.initialize(audio.context);
  strudel.getOutputNode().connect(audio.masterGain);
  await strudel.start();
  playing = true;
  apply();
  const info = strudel.status;
  status.textContent = `${info.local ? 'local kit' : info.samples ? 'remote kit' : 'SYNTH FALLBACK'} · ${genreLabPresetLabel(preset)} · ${graphBpm()} bpm`;
  window.setInterval(() => {
    if (!playing) return;
    codeBox.textContent = strudel.code;
    const now = strudel.status;
    if (now.degraded) status.textContent = 'DEGRADED — a pattern failed, playing bare parts';
  }, 700);
}

function graphBpm(): number {
  return strudel.status.bpm;
}

function stop(): void {
  if (!playing) return;
  strudel.stop();
  playing = false;
  status.textContent = 'stopped';
}

// --- build the page -------------------------------------------------------

const genreRow = $('genres');
for (const world of GENRE_LAB_PRESETS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = genreLabPresetLabel(world);
  button.setAttribute('aria-pressed', String(world === preset));
  button.addEventListener('click', () => {
    preset = world;
    for (const other of genreRow.querySelectorAll('button')) {
      other.setAttribute('aria-pressed', String(other.textContent === genreLabPresetLabel(world)));
    }
    apply();
    if (playing) {
      status.textContent = `${genreLabPresetLabel(preset)} · ${genreGrammar(preset).bpmCentre} bpm · ${worldBankLabel(finishedTrack(preset, section))}`;
    }
  });
  genreRow.appendChild(button);
}

const flightPanel = $('flight');
for (const knob of FLIGHT) flightPanel.appendChild(knobRow(knob, apply));

// Section picker sits with the flight: it is the shape, not the mix.
const sectionLabel = document.createElement('label');
const sectionName = document.createElement('span');
sectionName.textContent = 'section';
for (const name of SECTIONS) {
  const option = document.createElement('option');
  option.value = name;
  option.textContent = phaseLabel(name);
  option.selected = name === section;
  sectionSelect.appendChild(option);
}
sectionSelect.addEventListener('change', () => {
  section = sectionSelect.value as Section;
  apply();
});
sectionLabel.append(sectionName, sectionSelect, document.createElement('output'));
flightPanel.appendChild(sectionLabel);

const mixPanel = $('mix');
for (const knob of MIX) mixPanel.appendChild(knobRow(knob, apply));

$('play').addEventListener('click', () => void start());
$('stop').addEventListener('click', stop);
// §74: A/B the three coats the engine puts over every grammar — the
// performance shaping, the variations and the production. In the REPL a
// preset has none of them, which is why the same patterns sound different
// there.
let bare = false;
$('bare').addEventListener('click', () => {
  bare = !bare;
  $('bare').setAttribute('aria-pressed', String(bare));
  strudel.setBare(bare);
  status.textContent = bare ? 'BARE — the parts alone, as a preset would play them' : 'coated — performance, variations and production on top';
});
$('reset').addEventListener('click', () => {
  resetKnobs();
  status.textContent = playing
    ? `back to defaults · ${genreLabPresetLabel(preset)}`
    : 'back to defaults';
});
apply();
