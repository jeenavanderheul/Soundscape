import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
}));
import { buildLayerGraph, structureVoices } from '../../src/audio/MusicalPrimitives';
import { buildPatternCode } from '../../src/audio/StrudelEngine';
import { createInitialMusicState } from '../../src/music/MusicState';

const structure = (id: string, hz: number, waveform = 'sine', persistence = 1) => ({
  id,
  hz,
  waveform,
  persistence,
});

describe('structureVoices (§17: form = voice)', () => {
  it('turns persistent structures into bounded, slotted harmony voices', () => {
    const voices = structureVoices([
      structure('a', 110),
      structure('b', 330, 'square'),
      structure('c', 880, 'saw'),
      structure('young', 220, 'sine', 0.2), // not persistent enough yet
    ]);
    expect(voices).toHaveLength(3);
    expect(voices.map((v) => v.parameters['slot'])).toEqual([0, 1, 2]);
    expect(voices[1]!.parameters['sound']).toBe('square');
    expect(voices.every((v) => v.layer === 'harmony')).toBe(true);
  });

  it('caps at 5 voices', () => {
    const many = Array.from({ length: 9 }, (_, i) => structure(`s${i}`, 100 + i * 60));
    expect(structureVoices(many)).toHaveLength(5);
  });

  it('keeps the world humming without any pulse: voices alone make a graph', () => {
    const graph = buildLayerGraph(createInitialMusicState(), undefined, [structure('a', 220)]);
    expect(graph.layers.harmony.primitives).toHaveLength(1);
    const code = buildPatternCode(graph);
    expect(code).toContain('note("');
    expect(code).toContain('.late(0.00)');
  });
});
