import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { buildPatternCode, trackParts } from '../../src/audio/StrudelEngine';
import { buildSubPressureGraph } from '../../src/lab/SubPressure';

describe('SUB PRESSURE Genre Lab preset', () => {
  it('builds the supplied fourteen-voice composition at 141.3 BPM', () => {
    const graph = buildSubPressureGraph();
    const code = buildPatternCode(graph);

    expect(graph.bpm).toBeCloseTo(141.3);
    expect(trackParts(graph)).toHaveLength(14);
    expect(code).toContain('s("hh ~ hh [hh hh] ~ hh ~ [hh hh]").bank("EmuSP12")');
    expect(code).toContain('s("bd ~ bd ~ ~ bd [bd ~] ~").bank("AkaiMPC60")');
    expect(code).toContain('note("~ c1 ~ c1 ~ ~ bb0 db1").s("sine")');
    expect(code).toContain('note("~ c2 ~ c2 ~ ~ bb1 db2").s("sawtooth")');
    expect(code).toContain('note("<~ [c3,db3,g3] ~ ~ ~ [bb2,db3,gb3] ~ ~>").s("square")');
    expect(code).toContain('s("bytebeat").slow(2).bpf(1300).crush(5)');
  });

  it('keeps every supplied 32-cycle arrangement mask', () => {
    const code = buildPatternCode(buildSubPressureGraph());

    for (const mask of [
      '<1!24 0!4 1!4>',
      '<0!8 1!16 0!4 1!4>',
      '<0!4 1!20 0!4 1!4>',
      '<0!12 1!12 0!4 1!4>',
      '<0!16 1!8 0!4 1!4>',
      '<0!20 1!4 0!4 1!4>',
      '<0!15 1 0!15 1>',
    ]) {
      expect(code).toContain(`mask("${mask}")`);
    }
  });

  it('applies motion and layer mix before rendering', () => {
    expect(buildPatternCode(buildSubPressureGraph({ motion: 0 }))).toContain('.gain(0)');
    expect(buildPatternCode(buildSubPressureGraph({ mix: { bass: 0.5 } })))
      .toContain('.gain(0.4865)');
  });
});
