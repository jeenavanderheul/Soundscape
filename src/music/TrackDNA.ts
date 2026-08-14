import type { TrackGenre } from './TrackState';

/**
 * §118 TRACK DNA — track 27 is not track 1 in another key.
 *
 * A world is a document (§110): fixed parts, fixed masks, fixed notes. That is
 * what makes it sound like itself, and it is why the arrangement finally
 * stopped fighting itself. But a fixed document gives a fixed track, so
 * staying in one world produced the same composition forever with only the
 * root note moving — infinite in NUMBER and not in music.
 *
 * The DNA is the missing dimension, and it works the way ALT/WIND/EDGE
 * already do: not by rewriting the parts, but by shaping how they are played.
 * Per TRACK instead of per moment. The document stays the world; the DNA is
 * this particular reading of it.
 *
 * Deterministic in (genre, track number): flight 1 and flight 2 hear the same
 * track 27 in the same world, which is what makes depth a place rather than a
 * dice roll.
 */

export interface TrackDNA {
  /** What this reading is called, for the score and the strip. */
  character: string;
  /** −1 dark and closed, +1 bright and open. Moves every filter. */
  tilt: number;
  /** 0 clean, 1 pushed. Moves distortion and shaping. */
  drive: number;
  /** 0 dry, 1 cavernous. Moves the room. */
  space: number;
  /** 0 dense, 1 stripped. Thins the percussion out. */
  sparse: number;
}

/**
 * A small, readable vocabulary rather than a continuum — a player should be
 * able to tell two readings apart by name as well as by ear.
 */
const CHARACTERS: readonly {
  name: string;
  tilt: number;
  drive: number;
  space: number;
  sparse: number;
}[] = [
  { name: 'hypnotic', tilt: -0.2, drive: 0.35, space: 0.55, sparse: 0.45 },
  { name: 'darker', tilt: -0.75, drive: 0.6, space: 0.35, sparse: 0.2 },
  { name: 'percussive', tilt: 0.3, drive: 0.45, space: 0.2, sparse: 0 },
  { name: 'acid', tilt: 0.65, drive: 0.85, space: 0.3, sparse: 0.35 },
  { name: 'raw', tilt: -0.1, drive: 1, space: 0.15, sparse: 0.1 },
  { name: 'dubbed', tilt: -0.45, drive: 0.2, space: 1, sparse: 0.6 },
  { name: 'stripped', tilt: 0.1, drive: 0.25, space: 0.45, sparse: 0.85 },
];

/** A stable hash of the world and the track number — no clock, no randomness. */
function seed(genre: TrackGenre, track: number): number {
  const text = `${genre ?? 'void'}#${track}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

/**
 * §118: the DNA of track N in this world.
 *
 * Track 1 is deliberately the plainest reading — the world as written, so a
 * player meets it before it starts bending. Everything after it drifts, and
 * the drift WIDENS with depth: track 2 is a variation, track 50 is a corner
 * of the genre you would not have found on the way in. Depth is more genre
 * knowledge, never simply harder and faster (user decision).
 */
export function dnaFor(genre: TrackGenre, track: number): TrackDNA {
  if (track <= 1) {
    return { character: 'as written', tilt: 0, drive: 0.5, space: 0.5, sparse: 0 };
  }
  const base = CHARACTERS[(track - 2) % CHARACTERS.length]!;
  // How far this reading is allowed to travel from the document. Grows with
  // depth and settles, so track 50 explores without becoming another genre.
  const reach = Math.min(1, 0.45 + (track - 2) * 0.04);
  const wobble = seed(genre, track) - 0.5;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    character: base.name,
    tilt: clamp(base.tilt * reach + wobble * 0.3, -1, 1),
    drive: clamp(base.drive * reach + 0.5 * (1 - reach) + wobble * 0.2, 0, 1),
    space: clamp(base.space * reach + 0.5 * (1 - reach) + wobble * 0.2, 0, 1),
    sparse: clamp(base.sparse * reach + wobble * 0.15, 0, 1),
  };
}

/**
 * Apply the reading to a rendered voice. This is the same trick §3 uses for
 * the flight: touch the numbers, never the notes. A document's figures, its
 * masks and its machines come through untouched — what changes is how open,
 * how pushed, how wet and how thinned it is played.
 */
export function applyDna(code: string, dna: TrackDNA | undefined): string {
  if (dna === undefined) return code;
  let out = code;
  // Filters move together, so the whole track leans dark or bright as one.
  const lean = Math.pow(2, dna.tilt * 0.7);
  out = out.replace(/\.(lpf|hpf|bpf)\(([0-9]+(?:\.[0-9]+)?)\)/g, (_m, fn: string, hz: string) =>
    `.${fn}(${Math.round(clampHz(Number(hz) * lean))})`,
  );
  // Push, relative to the middle — 0.5 leaves a document exactly as written.
  const push = 0.6 + dna.drive * 0.8;
  out = out.replace(/\.(distort|shape)\(([0-9]*\.?[0-9]+)\)/g, (_m, fn: string, amount: string) =>
    `.${fn}(${round3(Math.min(fn === 'shape' ? 0.9 : 3, Number(amount) * push))})`,
  );
  // 0.5 has to land on exactly 1.0, or "as written" is not as written —
  // track 1 came out 5% wetter than the document, which is a small number
  // and still a lie.
  const wet = 0.4 + dna.space * 1.2;
  out = out.replace(/\.room\(([0-9]*\.?[0-9]+)\)/g, (_m, amount: string) =>
    `.room(${round3(Math.min(1, Number(amount) * wet))})`,
  );
  // Thinning only touches what is already being thinned: a part written with
  // degradeBy is one the document treats as dust.
  if (dna.sparse > 0.05) {
    out = out.replace(/\.degradeBy\(([0-9]*\.?[0-9]+)\)/g, (_m, amount: string) =>
      `.degradeBy(${round3(Math.min(0.92, Number(amount) + dna.sparse * 0.3))})`,
    );
  }
  return out;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const clampHz = (hz: number): number => Math.min(18000, Math.max(30, hz));
