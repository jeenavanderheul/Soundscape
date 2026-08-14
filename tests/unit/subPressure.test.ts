import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { buildPatternCode, trackParts } from '../../src/audio/StrudelEngine';
import { buildWorldLayerGraph } from '../../src/audio/WorldLayerGraph';
import { buildSubPressureGraph } from '../../src/lab/SubPressure';
import { createInitialMusicState } from '../../src/music/MusicState';
import { performanceFrom } from '../../src/music/Performance';
import { LEVEL_EARNED, LEVEL_DEEP, createInitialTrackState, type TrackState } from '../../src/music/TrackState';

const ids = (graph: ReturnType<typeof buildSubPressureGraph>): string[] =>
  trackParts(graph).map((part) => part.id);

const deep = { unlocked: true, level: LEVEL_DEEP };
const earned = { unlocked: true, level: LEVEL_EARNED };

/** What the genre lab plays: everything earned AND grown deep. */
function finished(form: TrackState['form'] = 'none'): TrackState {
  return {
    ...createInitialTrackState(),
    genre: 'sub-pressure',
    form,
    drums: { kick: deep, snare: deep, hats: deep },
    bass: deep,
    harmony: deep,
    melody: deep,
    texture: deep,
  };
}

describe('SUB PRESSURE, finished — what the genre lab plays', () => {
  it('is the supplied fourteen-voice composition at 141 BPM', () => {
    const graph = buildSubPressureGraph();
    const code = buildPatternCode(graph);

    expect(graph.bpm).toBe(141);
    expect(trackParts(graph)).toHaveLength(14);
    expect(code).toContain('s("hh ~ hh [hh hh] ~ hh ~ [hh hh]").bank("EmuSP12")');
    expect(code).toContain('s("bd ~ bd ~ ~ bd [bd ~] ~").bank("AkaiMPC60")');
    expect(code).toContain('note("~ c1 ~ c1 ~ ~ bb0 db1").s("sine")');
    expect(code).toContain('note("~ c2 ~ c2 ~ ~ bb1 db2").s("sawtooth")');
    expect(code).toContain('note("<~ [c3,db3,g3] ~ ~ ~ [bb2,db3,gb3] ~ ~>").s("square")');
    expect(code).toContain('s("bytebeat").slow(2).bpf(1300).crush(5)');
  });

  it('applies motion and layer mix before rendering', () => {
    expect(buildPatternCode(buildSubPressureGraph({ motion: 0 }))).toBe('');
    expect(buildPatternCode(buildSubPressureGraph({ mix: { bass: 0.5 } })))
      .toContain('.gain(0.486)');
  });

  /**
   * §81: the 32-cycle masks were this world's private arrangement, invisible to
   * the ArrangementEngine — the HUD said BUILD while the audio played its own
   * loop. The sections are the arrangement now.
   */
  it('no longer carries a private arrangement in masks', () => {
    expect(buildPatternCode(buildSubPressureGraph())).not.toContain('mask(');
  });
});

describe('SUB PRESSURE answers the flight, like every other world', () => {
  const music = createInitialMusicState();
  const at = (altitude: number, amplitude: number) =>
    buildPatternCode(
      buildSubPressureGraph({
        performance: performanceFrom(music, { altitude, amplitude, velocity: 30 }),
      }),
    );

  it('§3.1 height opens the hats and the stab; the ground closes them', () => {
    const high = at(60, 0.4);
    const low = at(1, 0.4);
    expect(high).not.toBe(low);
    const hz = (code: string) => Number(/bank\("EmuSP12"\)\.hpf\((\d+)\)/.exec(code)![1]);
    expect(hz(high)).toBeGreaterThan(hz(low));
  });

  it('§3.2 the wind you hold is the weight of the kick and the sub', () => {
    const held = at(20, 1);
    const none = at(20, 0);
    const kick = (code: string) => Number(/postgain\(\.7\)\.gain\(([\d.]+)\)/.exec(code)![1]);
    expect(kick(held)).toBeGreaterThan(kick(none));
  });

  it('§62 movement energy becomes edge, not volume', () => {
    const hard = buildPatternCode(buildSubPressureGraph({ energy: 1 }));
    const soft = buildPatternCode(buildSubPressureGraph({ energy: 0 }));
    const drive = (code: string) => Number(/lpq\(10\.6\)\.distort\(([\d.]+)\)/.exec(code)![1]);
    expect(drive(hard)).toBeGreaterThan(drive(soft));
  });
});

describe('SUB PRESSURE is arranged by its section, not by a baked loop', () => {
  const parts = (form: TrackState['form']) =>
    ids(buildSubPressureGraph({ track: finished(form) }));

  it('§92 PRESSURE brings the sub in and DROP I keeps it', () => {
    expect(parts('intro')).not.toContain('sub-pressure-sub');
    expect(parts('build')).toContain('sub-pressure-sub');
    expect(parts('drop')).toContain('sub-pressure-sub');
  });

  it('§95 the void thins the bottom out but never stops the track', () => {
    const broken = parts('break');
    // Everything the flight earned is still sounding…
    expect(broken).toContain('sub-pressure-kick');
    expect(broken).toContain('sub-pressure-sub');
    expect(broken).toContain('sub-pressure-stab');
    // …and it is the quietest the drums ever get, short of gone.
    const gainOf = (id: string, form: TrackState['form']) => {
      const g = buildSubPressureGraph({ track: finished(form) });
      for (const layer of Object.values(g.layers)) {
        const hit = layer.primitives.find((p) => p.id === id);
        if (hit) return Number(/\.gain\(([0-9.]+)\)/.exec(String(hit.parameters['code']))?.[1] ?? 0);
      }
      return 0;
    };
    expect(gainOf('sub-pressure-kick', 'break')).toBeGreaterThan(0);
    expect(gainOf('sub-pressure-kick', 'break'))
      .toBeLessThan(gainOf('sub-pressure-kick', 'drop') / 2);
  });
});

describe('in the game you discover it layer by layer', () => {
  it('one rung at a time, and the second machine is earned separately', () => {
    const track = { ...createInitialTrackState(), genre: 'sub-pressure' as const };
    const at = () => ids(buildSubPressureGraph({ track }));
    // §94: the AIR of a world is never earned — ENTER BIOME is the air alone,
    // and gating it left this world's first four cycles silent. `mask` puts
    // the rise in the air layer too, so both are there from the start.
    expect(at()).toEqual(['sub-pressure-atmosphere', 'sub-pressure-rise']);

    // …and this world OPENS on texture, so its first rung brings a voice.
    track.texture = earned;
    expect([...at()].sort()).toEqual([
      'sub-pressure-atmosphere', 'sub-pressure-rise', 'sub-pressure-texture',
    ]);

    track.drums.hats = earned;
    expect(at()).toContain('sub-pressure-hats');
    // §78: the AkaiMPC60 dust is the SAME role, doubled — not a free extra.
    expect(at()).not.toContain('sub-pressure-hats-deep');
    track.drums.hats = deep;
    expect(at()).toContain('sub-pressure-hats-deep');

    track.drums.kick = earned;
    expect(at()).toContain('sub-pressure-kick');
    expect(at()).not.toContain('sub-pressure-kick-deep');

    track.drums.snare = earned;
    expect(at()).toContain('sub-pressure-snare');

    // §81: the bassline is the bass rung — it no longer waits for harmony.
    track.bass = earned;
    expect(at()).toEqual(expect.arrayContaining(['sub-pressure-sub', 'sub-pressure-body']));
    expect(at()).not.toContain('sub-pressure-reese');
    track.bass = deep;
    expect(at()).toContain('sub-pressure-reese');

    track.harmony = earned;
    expect(at()).toContain('sub-pressure-stab');
    track.melody = earned;
    expect(at()).toContain('sub-pressure-signal');
  });

  it('and finished, it is exactly what the lab plays', () => {
    const track = finished();
    const music = createInitialMusicState();
    const performance = performanceFrom(music, { altitude: 19, amplitude: 0.4, velocity: 46 });
    const game = buildWorldLayerGraph({ music, track, performance, energy: 0.7, motion: 1 });
    const lab = buildSubPressureGraph({ track, performance, energy: 0.7, motion: 1 });
    expect(buildPatternCode(game)).toBe(buildPatternCode(lab));
    expect(trackParts(game)).toHaveLength(14);
  });
});

describe('§85 DROP II brings something that was impossible before it', () => {
  const ids = (form: TrackState['form']) =>
    trackParts(buildSubPressureGraph({ track: finished(form) })).map((p) => p.id);

  it('the finale answers the bass, throws noise and lets the grid mutate', () => {
    const finale = ids('return');
    expect(finale).toEqual(expect.arrayContaining([
      'sub-pressure-finale-response',
      'sub-pressure-finale-noise',
      'sub-pressure-finale-mutation',
    ]));
  });

  it('and nowhere else — not even in DROP I or DEEP FLIGHT', () => {
    for (const form of ['drop', 'deep', 'groove', 'break'] as const) {
      expect(ids(form).filter((id) => id.includes('finale'))).toEqual([]);
    }
  });

  it('a sketch gets no finale: the bass has to have grown deep first', () => {
    const shallow: TrackState = {
      ...finished('return'),
      bass: { unlocked: true, level: LEVEL_EARNED },
    };
    const parts = trackParts(buildSubPressureGraph({ track: shallow })).map((p) => p.id);
    expect(parts.filter((id) => id.includes('finale'))).toEqual([]);
  });
});
