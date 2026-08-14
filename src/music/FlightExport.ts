import { buildWorldLayerGraph } from '../audio/WorldLayerGraph';
import { buildPatternCode, setSamplesLoaded } from '../audio/StrudelEngine';
import { genreGrammar, voiceLabels } from '../audio/MusicalPrimitives';
import { createEventBus } from '../core/EventBus';
import { createStore } from '../core/stores';
import { CYCLES_PER_PHASE, sectionLabel } from './ArrangementEngine';
import { createInitialMusicState } from './MusicState';
import type { GenreAffinity } from './MusicState';
import { performanceFrom } from './Performance';
import { TrackBuilder } from './TrackBuilder';
import { createInitialTrackState, type TrackEvents, type TrackGenre } from './TrackState';

/**
 * §106 FLIGHT EXPORT — hear what the flight writes, without flying.
 *
 * Every fault in this track has been found the same way: the player heard it,
 * described it, and only then did printing the pattern confirm it. The suite
 * could not find any of them, because a test can prove that nothing broke and
 * cannot prove that something is music.
 *
 * This runs a real flight through the real TrackBuilder — the same clock, the
 * same ladder, the same arc — and writes out the Strudel the flight produces,
 * one block per phase. Paste a block into strudel.cc and you are hearing
 * exactly what the game would have played at that point, with no guessing in
 * between. It is the missing feedback loop, not a debugging aid.
 */

export interface FlightBlock {
  /** Which of the thirty-two cycles this block starts at. */
  cycle: number;
  phase: string;
  /** Seconds of real flight elapsed when this phase began. */
  atSeconds: number;
  bpm: number;
  /** How many layers the flight has earned by now. */
  earned: number;
  code: string;
}

export interface FlightExportOptions {
  genre: Exclude<TrackGenre, null>;
  /** 0..66 — how hard the flight is pushed; decides how fast the arc walks. */
  velocity?: number;
  /** Height above the terrain, which is colour only (§91). */
  altitude?: number;
  /** 0..1 wind held, which is the track's force (§105). */
  amplitude?: number;
  seconds?: number;
  stepMs?: number;
}

function affinityFor(genre: Exclude<TrackGenre, null>): GenreAffinity {
  return { techno: 0, 'sub-pressure': 0, [genre]: 1 } as GenreAffinity;
}

/**
 * Fly, and collect the pattern at the moment each phase begins. Deterministic:
 * the same options always produce the same track, so two exports can be
 * diffed against each other after a change.
 */
export function exportFlight(options: FlightExportOptions): FlightBlock[] {
  const {
    genre,
    velocity = 40,
    altitude = 19,
    amplitude = 0.5,
    seconds = 180,
    stepMs = 250,
  } = options;
  setSamplesLoaded(true);

  const store = createStore(createInitialTrackState());
  const bus = createEventBus<TrackEvents>();
  const builder = new TrackBuilder(store, bus);
  const affinity = affinityFor(genre);
  const music = { ...createInitialMusicState(), bpm: 0, tempoConfidence: 0, dynamics: 0.5 };

  const blocks: FlightBlock[] = [];
  let lastPhase = '';
  let phaseStartMs = 0;
  let phaseCycle = 0;
  // §106: a phase is captured at its END, not its start. What you want to
  // paste and hear is what the phase BECAME — a rung that lands halfway
  // through DISCOVERY I belongs to DISCOVERY I, and a block taken on the
  // opening tick would not contain it.
  let previous: ReturnType<typeof store.getState> | null = null;
  const emit = (track: ReturnType<typeof store.getState>) => {
    const performance = performanceFrom(music, { altitude, amplitude, velocity });
    const graph = buildWorldLayerGraph({
      music: { ...music, bpm: track.bpm },
      affinity,
      structures: [],
      track,
      patterns: {},
      motion: 1,
      energy: amplitude,
      performance,
    });
    graph.performance = performance;
    blocks.push({
      cycle: phaseCycle,
      phase: sectionLabel(track.form),
      atSeconds: Math.round(phaseStartMs / 100) / 10,
      bpm: track.bpm,
      earned: [
        track.drums.kick, track.drums.snare, track.drums.hats,
        track.bass, track.harmony, track.melody, track.texture,
      ].filter((layer) => layer.unlocked).length,
      code: labelled(graph),
    });
  };

  for (let t = 0; t <= seconds * 1000; t += stepMs) {
    builder.tick(t, music, { velocity, hz: 220, energy: amplitude, altitude }, affinity);
    const track = store.getState();
    if (track.form === 'none') continue;
    if (track.form !== lastPhase) {
      if (previous !== null) emit(previous);
      lastPhase = track.form;
      phaseStartMs = t;
      phaseCycle = builder.arrangement.cycle;
    }
    previous = track;
  }
  if (previous !== null) emit(previous);
  return blocks;
}

/** The pattern with a banner above each role, as the game's overlay shows it. */
function labelled(graph: Parameters<typeof voiceLabels>[0]): string {
  const code = buildPatternCode(graph, []);
  const labels = voiceLabels(graph);
  const lines = code.split('\n');
  const out: string[] = [];
  let voice = 0;
  let last = '';
  for (const line of lines) {
    if (!line.startsWith('  ')) {
      out.push(line);
      continue;
    }
    const label = labels[voice] ?? '';
    voice += 1;
    if (label !== '' && label !== last) {
      if (last !== '') out.push('');
      out.push(`  // ── ${label} ──`);
      last = label;
    }
    out.push(line);
  }
  return out.join('\n');
}

/** The whole flight as one paste-ready file, each phase its own block. */
export function formatFlight(options: FlightExportOptions): string {
  const blocks = exportFlight(options);
  const grammar = genreGrammar(options.genre);
  const head = [
    `// ${options.genre.toUpperCase()} — ${grammar.bpmCentre} bpm`,
    `// a ${options.seconds ?? 180}s flight at velocity ${options.velocity ?? 40},`,
    `// altitude ${options.altitude ?? 19}, wind ${options.amplitude ?? 0.5}.`,
    '//',
    '// Each block is what the game plays when that phase begins. Paste one',
    '// into strudel.cc and press play — no flying, no guessing.',
    '',
  ];
  const body = blocks.map((block) => {
    const bar = '━'.repeat(58);
    return [
      `// ${bar}`,
      `// cycle ${String(block.cycle).padStart(2, '0')}/${CYCLES_PER_PHASE * 8}` +
        ` · ${block.phase} · ${block.atSeconds}s · ${block.earned}/7 layers`,
      `// ${bar}`,
      `setcpm(${block.bpm} / 4)`,
      block.code,
      '',
    ].join('\n');
  });
  return [...head, ...body].join('\n');
}
