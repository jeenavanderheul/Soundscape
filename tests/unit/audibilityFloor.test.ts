import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { buildWorldLayerGraph } from '../../src/audio/WorldLayerGraph';
import { buildPatternCode } from '../../src/audio/StrudelEngine';
import { performanceFrom } from '../../src/music/Performance';
import { createInitialMusicState } from '../../src/music/MusicState';
import { ACTIVE_WORLD_GENRES } from '../../src/genres/ActiveWorlds';
import { createInitialTrackState, LEVEL_DEEP, type TrackState } from '../../src/music/TrackState';

const deep = { unlocked: true, level: LEVEL_DEEP };
const finished = (genre: string): TrackState => ({
  ...createInitialTrackState(), genre, bpm: 140,
  drums: { kick: deep, hats: deep, snare: deep },
  bass: deep, harmony: deep, melody: deep, texture: deep,
} as TrackState);

/** Loudest single voice per layer, in dB relative to the loudest in the world. */
function levels(genre: string): Record<string, number> {
  const graph = buildWorldLayerGraph({ track: finished(genre), motion: 1, energy: 0.6 } as never);
  const peak: Record<string, number> = {};
  for (const [name, layer] of Object.entries(graph.layers)) {
    for (const primitive of layer.primitives) {
      const found = /\.gain\(([0-9]*\.?[0-9]+)\)/.exec(String(primitive.parameters.code ?? ''));
      if (found) peak[name] = Math.max(peak[name] ?? 0, Number(found[1]));
    }
  }
  const reference = Math.max(...Object.values(peak));
  return Object.fromEntries(
    Object.entries(peak).map(([n, v]) => [n, 20 * Math.log10(v / reference)]),
  );
}

describe('§127 nothing you earned is inaudible', () => {
  // Measured before the floor: melody sat 22–25 dB under the loudest voice and
  // texture 28–35 dB, in every world. You fly to earn those rungs, the strip
  // fills to 7/7, and they are under the threshold of noticing.
  it.each(ACTIVE_WORLD_GENRES)('keeps every earned layer within 20 dB — %s', (genre) => {
    for (const [layer, db] of Object.entries(levels(genre))) {
      expect(`${layer} ${db > -20.5 ? 'ok' : `${db.toFixed(0)}dB`}`).toBe(`${layer} ok`);
    }
  });

  it('lifts, never lowers: a document louder than the floor is left alone', () => {
    // PERCUSSION RIOT writes its harmony at −8 dB on purpose; the floor is a
    // floor, not a mix, so that intent has to survive untouched.
    expect(levels('percussion-riot').harmony).toBeGreaterThan(-10);
  });
});

describe('§130 the flight colours a voice, it never closes it', () => {
  const WORLDS = ACTIVE_WORLD_GENRES;
  const ALTITUDES = [0, 1, 4, 8, 20, 32, 45, 60];

  /** Every rendered voice that carries both filters, at every height. */
  function windows(): { line: string; lpf: number; hpf: number }[] {
    const music = { ...createInitialMusicState(), pitchCenter: 220, timbreBrightness: 0.5 };
    const found: { line: string; lpf: number; hpf: number }[] = [];
    for (const genre of WORLDS) {
      for (const altitude of ALTITUDES) {
        const performance = performanceFrom(music, { altitude, amplitude: 0.5, velocity: 40 });
        const graph = buildWorldLayerGraph({
          track: finished(genre), motion: 1, energy: 0.6, performance,
        } as never);
        (graph as { performance?: unknown }).performance = performance;
        for (const line of buildPatternCode(graph).split('\n')) {
          const lpf = /\.lpf\((?:sine\.range\()?([0-9]+)/.exec(line);
          const hpf = /\.hpf\(([0-9]+)\)/.exec(line);
          if (lpf && hpf) found.push({ line: line.trim(), lpf: Number(lpf[1]), hpf: Number(hpf[1]) });
        }
      }
    }
    return found;
  }

  it('never hands a voice a lowpass under its own highpass', () => {
    // Measured before this: 61 voices were filtered into silence. The locked groove
    // texture is hpf(8200) and was given lpf(702) down at ground level; the
    // 909/808 hats sit at hpf 6200–9500, above the brightness ceiling at EVERY
    // height, so they were gone the whole flight. Earned, shown as 7/7, silent.
    const shut = windows().filter((v) => v.hpf >= v.lpf);
    expect(shut.map((v) => `${v.hpf}≥${v.lpf} ${v.line.slice(0, 40)}`)).toEqual([]);
  });

  it('still lets height colour those voices — it is a floor, not a bypass', () => {
    const music = { ...createInitialMusicState(), pitchCenter: 220, timbreBrightness: 0.5 };
    const cutoff = (altitude: number): number => {
      const performance = performanceFrom(music, { altitude, amplitude: 0.5, velocity: 40 });
      const graph = buildWorldLayerGraph({
        track: finished('locked-groove'), motion: 1, energy: 0.6, performance,
      } as never);
      (graph as { performance?: unknown }).performance = performance;
      const melody = buildPatternCode(graph).split('\n').find((l) => l.includes('clavisynth'))!;
      return Number(/\.lpf\((?:sine\.range\()?([0-9]+)/.exec(melody)![1]);
    };
    expect(cutoff(60)).toBeGreaterThan(cutoff(1));
  });
});
