import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { buildWorldLayerGraph } from '../../src/audio/WorldLayerGraph';
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
