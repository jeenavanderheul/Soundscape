import { ARC_PHASES, CYCLES_PER_PHASE, arcFor, sectionLabel } from '../music/ArrangementEngine';
import type { SectionStyle } from '../music/ArrangementEngine';
import { ladderFor } from '../music/GenreLadder';
import type { Performance } from '../music/Performance';
import { LEVEL_DEEP } from '../music/TrackState';
import type { TrackLayerName, TrackState } from '../music/TrackState';

/**
 * §109 THE SCORE READS LIKE THE PRESET IT CAME FROM.
 *
 * The overlay showed the live stack, which is true but unreadable — a wall of
 * voices with no sense of where they came from or where you are. The presets
 * these worlds were written from open with a header: the world's name, the
 * ladder in order, the thirty-two cycles, the performance constants. That
 * header is what makes the code legible.
 *
 * So the overlay gets the same header — except every value in it is LIVE.
 * The ladder shows which rungs you actually hold, the cycle map shows where
 * the flight is right now, and ALT/WIND/EDGE are the numbers being fed into
 * the patterns underneath this second. Read it top to bottom and you can see
 * exactly how the thing works while it works.
 */

const SHORT: Record<TrackLayerName, string> = {
  kick: 'kick',
  hats: 'hats',
  snare: 'clap/snare',
  bass: 'sub/bass',
  harmony: 'rave stab',
  melody: 'signal',
  texture: 'texture',
};

function levelOf(track: Readonly<TrackState>, layer: TrackLayerName): number {
  if (layer === 'kick' || layer === 'hats' || layer === 'snare') {
    return track.drums[layer].unlocked ? track.drums[layer].level : 0;
  }
  return track[layer].unlocked ? track[layer].level : 0;
}

export interface ScoreHeaderState {
  track: Readonly<TrackState>;
  cycle: number;
  style: SectionStyle;
  trackNumber: number;
  performance?: Readonly<Performance> | undefined;
  /** 0..1 movement energy — the wind, which is what the patterns spend (§105). */
  energy: number;
  bank: string;
}

const RULE = '═'.repeat(60);

/** The header, as pure text — the same shape the presets are written in. */
export function scoreHeader(state: ScoreHeaderState): string {
  const { track } = state;
  const genre = (track.genre ?? 'the void').toUpperCase();
  const arc = arcFor(state.style);
  const phase = arc[Math.floor(state.cycle / CYCLES_PER_PHASE) % ARC_PHASES] ?? 'groove';

  // The ladder in this world's own order, with what you hold marked under it.
  const rungs = ladderFor(track.genre).map(({ layer }) => SHORT[layer]);
  const held = ladderFor(track.genre).map(({ layer }) => {
    const level = levelOf(track, layer);
    const mark = level >= LEVEL_DEEP ? '●●' : level > 0 ? '●○' : '○○';
    return mark.padEnd(SHORT[layer].length, ' ');
  });

  // The thirty-two cycles, grouped in phases, with the flight's position.
  let map = '';
  for (let c = 0; c < ARC_PHASES * CYCLES_PER_PHASE; c += 1) {
    if (c > 0 && c % CYCLES_PER_PHASE === 0) map += ' ';
    map += c === state.cycle ? '◆' : c < state.cycle ? '▬' : '·';
  }

  const perf = state.performance;
  // The three numbers the presets carry at the top, as they are RIGHT NOW.
  const alt = perf === undefined ? 0 : Math.round((1 - perf.weight) * 100) / 100;
  const wind = perf === undefined ? 0 : Math.round(((perf.push - 0.75) / 0.45) * 100) / 100;
  const edge = Math.round(state.energy * 100) / 100;

  return [
    `// ${RULE}`,
    `// FREQUENCY — ${genre} · TRACK ${String(state.trackNumber).padStart(2, '0')}`,
    '//',
    `// LADDER:  ${rungs.join(' → ')}`,
    `//          ${held.join('    ')}`,
    '//',
    `// 32 CYCLES:  ${map}`,
    `//             cycle ${String(state.cycle).padStart(2, '0')} · ${sectionLabel(phase)}`,
    '//',
    `// PERFORMANCE:  ALT ${alt.toFixed(2)}   WIND ${wind.toFixed(2)}   EDGE ${edge.toFixed(2)}`,
    `// MACHINES:     ${state.bank}`,
    `// ${RULE}`,
    `setcpm(${track.bpm} / 4)`,
    '',
  ].join('\n');
}
