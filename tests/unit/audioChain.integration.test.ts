import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../../src/audio/AudioEngine';
import { PlayerTone } from '../../src/audio/PlayerTone';
import { SpatialAudio } from '../../src/audio/SpatialAudio';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import { createInitialWorldState } from '../../src/world/WorldState';
import { FakeAudioContext, FakeGainNode, FakeNode } from './audioFakes';

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

  it('spawns exactly three resonator sources in M2 (spec §7)', async () => {
    const { ctx } = await buildWiredEngine();
    expect(ctx.createdPanners).toHaveLength(3);
  });

  it('master chain ends at the context destination via the compressor', async () => {
    const { engine, ctx } = await buildWiredEngine();
    const output = engine.getOutputNode() as unknown as FakeNode;
    const compressor = ctx.createdCompressors[0]!;
    expect(output.connections).toContain(compressor);
    expect(compressor.connections).toContain(ctx.destination);
  });
});
