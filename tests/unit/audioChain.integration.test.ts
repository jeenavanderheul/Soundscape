import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));
import { AudioEngine } from '../../src/audio/AudioEngine';
import { PlayerTone } from '../../src/audio/PlayerTone';
import { SpatialAudio } from '../../src/audio/SpatialAudio';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import { createInitialWorldState } from '../../src/world/WorldState';
import { FakeAudioContext, FakeGainNode, FakeNode } from './audioFakes';
import { buildPatternCode } from '../../src/audio/StrudelEngine';
import { buildWorldLayerGraph, worldBankLabel } from '../../src/audio/WorldLayerGraph';
import { createInitialMusicState } from '../../src/music/MusicState';
import { createInitialTrackState } from '../../src/music/TrackState';

/**
 * Integration: the full audio wiring as Game.unlock() builds it (M2: three resonators).
 * Every source node path must terminate at audioEngine.getOutputNode()
 * (spec §12: single AudioContext, one master chain).
 */
async function buildWiredEngine(): Promise<{
  engine: AudioEngine;
  ctx: FakeAudioContext;
  playerTone: PlayerTone;
  spatialAudio: SpatialAudio;
}> {
  const engine = new AudioEngine(FakeAudioContext as unknown as typeof AudioContext);
  await engine.initialize();
  const ctx = engine.context as unknown as FakeAudioContext;
  const output = engine.getOutputNode();
  const playerTone = new PlayerTone(engine.context, output);
  playerTone.start(createInitialFrequencyState());
  const spatialAudio = new SpatialAudio(engine.context, output);
  for (const resonator of createInitialWorldState('audio-chain-test-seed').resonators) {
    if (resonator.active) spatialAudio.addResonator(resonator);
  }
  return { engine, ctx, playerTone, spatialAudio };
}

describe('audio chain integration (Game.unlock wiring)', () => {
  it('routes each active world through its own graph source', () => {
    const music = { ...createInitialMusicState(), bpm: 132, dynamics: 0.7 };
    const pressureTrack = {
      ...createInitialTrackState(),
      genre: 'sub-pressure' as const,
      bpm: 141,
      texture: { unlocked: true, level: 1 },
      drums: {
        ...createInitialTrackState().drums,
        kick: { unlocked: true, level: 1 },
      },
    };
    const pressureCode = buildPatternCode(buildWorldLayerGraph({ music, track: pressureTrack }));
    expect(pressureCode).toContain('AkaiMPC60');
    expect(pressureCode).toContain('bytebeat');

    const technoTrack = {
      ...pressureTrack,
      genre: 'techno' as const,
      bpm: 134,
    };
    const technoCode = buildPatternCode(buildWorldLayerGraph({ music, track: technoTrack }));
    expect(technoCode).toContain('s("sbd*4")');
    expect(technoCode).not.toContain('AkaiMPC60');
    expect(worldBankLabel(technoTrack)).toBe('RolandTR909');
    expect(worldBankLabel(pressureTrack)).toBe('EmuSP12 / AkaiMPC60');
  });

  it('routes the player tone through getOutputNode()', async () => {
    const { engine, ctx } = await buildWiredEngine();
    const output = engine.getOutputNode() as unknown as FakeNode;
    const osc = ctx.createdOscillators[0]!;
    const toneGain = osc.connections[0] as FakeGainNode;
    expect(toneGain.connections).toContain(output);
  });

  it('routes every resonator panner through getOutputNode()', async () => {
    const { engine, ctx } = await buildWiredEngine();
    const output = engine.getOutputNode() as unknown as FakeNode;
    expect(ctx.createdPanners.length).toBeGreaterThan(0);
    for (const panner of ctx.createdPanners) {
      expect(panner.connections).toContain(output);
    }
  });

  it('spawns one resonator source per seeded resonator (spec §7)', async () => {
    const { ctx } = await buildWiredEngine();
    expect(ctx.createdPanners).toHaveLength(7);
  });

  it('master chain ends at the context destination via the compressor', async () => {
    const { engine, ctx } = await buildWiredEngine();
    const output = engine.getOutputNode() as unknown as FakeNode;
    const compressor = ctx.createdCompressors[0]!;
    expect(output.connections).toContain(compressor);
    expect(compressor.connections).toContain(ctx.destination);
  });
});
