import { BEATS_PER_BAR, trackParts } from '../audio/StrudelEngine';
import type { MusicalLayerGraph } from '../audio/MusicalPrimitives';
import type { TrackGenre } from './TrackState';

/**
 * §32: the flight, as a score. A finished flight is a finished track, so it
 * has to leave something behind — a numbered, commented Strudel block the
 * player can read, keep, and paste straight into strudel.cc.
 *
 * Pure string building from the same graph the engine is playing, so what you
 * export is exactly what you heard.
 */

/** What each voice in the graph is called on the page. */
const PART_NAMES: Record<string, string> = {
  pulse: 'KICK / FOUNDATION',
  'track-perc': 'BROKEN PERCUSSION',
  'track-hat': 'HATS',
  'track-hat-dirt': 'HIGH FREQUENCY DIRT',
  'track-snare': 'CLAP / SNARE',
  'track-snare-body': 'SNARE BODY',
  'track-bass': 'BASS',
  'track-sub': 'SUB',
  sub: 'SUB',
  'track-harmony': 'CHORDS',
  'track-harmony-wide': 'WIDE HARMONY',
  'track-melody': 'LEAD',
  'track-melody-octave': 'COUNTER LINE',
  'track-response': 'THE WORLD ANSWERS',
  'track-texture': 'TEXTURE',
  'track-texture-wide': 'SECOND TEXTURE',
  'ambient-drone': 'DRONE',
};

function partName(id: string): string {
  const known = PART_NAMES[id];
  if (known) return known;
  if (id.startsWith('voice-')) return 'STRUCTURE VOICE';
  if (id.startsWith('world-')) return 'WORLD PATTERN';
  return id.replace(/^track-/, '').replace(/-/g, ' ').toUpperCase();
}

export interface TrackExportInfo {
  graph: MusicalLayerGraph;
  genre: TrackGenre;
  /** Flight time in seconds, for the header. */
  flownSeconds: number;
  /**
   * §128: the journey this was flown on, and the shape that journey drew for
   * this track. The code is what makes a good flight findable again — paste it
   * back and the same worlds write the same tracks (user decision: shareable).
   */
  journey?: string;
  shape?: string;
}

/**
 * The track as source. Empty graph → an honest note instead of an empty
 * stack, so a player who exports too early understands why.
 */
/**
 * A voice built from `stack(a, b)` is two voices on the page. Split it on
 * top-level commas so the score reads as a flat list of parts, the way a
 * musician would write it out.
 */
function flatten(code: string): string[] {
  const inner = code.startsWith('stack(') && code.endsWith(')') ? code.slice(6, -1) : null;
  if (inner === null) return [code];
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let quoted = false;
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '(' || char === '[')) depth++;
    else if (!quoted && (char === ')' || char === ']')) depth--;
    else if (!quoted && char === ',' && depth === 0) {
      parts.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(inner.slice(start).trim());
  return parts.filter((part) => part !== '');
}

export function exportTrack({ graph, genre, flownSeconds, journey, shape }: TrackExportInfo): string {
  const parts = trackParts(graph).flatMap((part) => {
    const voices = flatten(part.code);
    return voices.map((code, index) => ({
      // A split voice keeps its name; the second one says which one it is.
      name: voices.length > 1 ? `${partName(part.id)} · ${index + 1}` : partName(part.id),
      code,
    }));
  });
  const minutes = Math.floor(flownSeconds / 60);
  const seconds = Math.round(flownSeconds % 60);
  const header = [
    '// FREQUENCY — this track was flown, not written.',
    `// ${genre === null ? 'no region' : genre} · ${graph.bpm} bpm · ${minutes}m${String(seconds).padStart(2, '0')}s of flight`,
    ...(journey === undefined ? [] : [`// journey ${journey}${shape === undefined ? '' : ` · ${shape}`}`]),
    '',
  ];
  if (parts.length === 0) {
    return [...header, '// Nothing was earned yet. Fly, and the track writes itself.'].join('\n');
  }
  const body = parts.map(
    (part, index) =>
      `  // ${String(index + 1).padStart(2, '0')} — ${part.name}\n  ${part.code}`,
  );
  return [
    ...header,
    `setcpm(${graph.bpm}/${BEATS_PER_BAR})`,
    '',
    'stack(',
    '',
    body.join(',\n\n'),
    '',
    ')',
    '',
  ].join('\n');
}
