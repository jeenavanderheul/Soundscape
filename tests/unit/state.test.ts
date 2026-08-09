import { describe, expect, it } from 'vitest';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import { createInitialMusicState } from '../../src/music/MusicState';

describe('createInitialFrequencyState', () => {
  it('has neutral defaults matching the spec shape', () => {
    const s = createInitialFrequencyState();
    expect(s.hz).toBe(220);
    expect(s.amplitude).toBe(0);
    expect(s.waveform).toBe('sine');
    expect(s.phase).toBe(0);
    expect(s.velocity).toBe(0);
    expect(s.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(s.direction).toEqual({ x: 0, y: 0, z: -1 });
    expect(s.resonance).toBe(0);
    expect(s.stability).toBe(0);
    expect(s.energy).toBe(0);
  });

  it('returns a fresh object each call', () => {
    const a = createInitialFrequencyState();
    const b = createInitialFrequencyState();
    expect(a).not.toBe(b);
    expect(a.position).not.toBe(b.position);
  });

  it('is serializable', () => {
    const s = createInitialFrequencyState();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('createInitialMusicState', () => {
  it('has neutral defaults matching the spec shape', () => {
    const s = createInitialMusicState();
    expect(s.bpm).toBe(0);
    expect(s.tempoConfidence).toBe(0);
    expect(s.pitchCenter).toBe(220);
    expect(s.pitchSpread).toBe(0);
    expect(s.dynamics).toBe(0);
    expect(s.rhythmDensity).toBe(0);
    expect(s.rhythmicRegularity).toBe(0);
    expect(s.syncopation).toBe(0);
    expect(s.durationAverage).toBe(0);
    expect(s.harmonicComplexity).toBe(0);
    expect(s.dissonance).toBe(0);
    expect(s.melodicActivity).toBe(0);
    expect(s.timbreBrightness).toBe(0);
    expect(s.timbreNoise).toBe(0);
    expect(s.meterConfidence).toBe(0);
    expect(s.textureDensity).toBe(0);
    expect(s.spatiality).toBe(0);
    expect(s.repetition).toBe(0);
    expect(s.variation).toBe(0);
    expect(s.lowEndEnergy).toBe(0);
    expect(s.transientDensity).toBe(0);
    expect(s.formPhase).toBe('void');
  });

  it('omits the optional meter until detected', () => {
    const s = createInitialMusicState();
    expect('meter' in s).toBe(false);
  });

  it('is serializable', () => {
    const s = createInitialMusicState();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
