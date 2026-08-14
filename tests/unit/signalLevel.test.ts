import { describe, expect, it } from 'vitest';

import { signalDrive, signalLevel, type SignalInput } from '../../src/rendering/signalLevel';

/**
 * §136.15: the image has six levels and it has to TRAVEL through them. A world
 * parked at overload is the same failure as a world parked at silence.
 */

const quiet: SignalInput = { growth: 0, rms: 0, section: 'none', speed01: 0, grit: 0 };

describe('§136.15 the intensity of the image', () => {
  it('is silence when nothing has been built and nothing is sounding', () => {
    expect(signalLevel(quiet)).toBe(0);
    expect(signalDrive(quiet).intensity).toBe(0);
  });

  it('rises with what has been earned and with what is sounding now', () => {
    const trace = signalLevel({ ...quiet, section: 'groove', growth: 0.2, rms: 0.1 });
    const signal = signalLevel({ ...quiet, section: 'groove', growth: 0.6, rms: 0.3 });
    const loud = signalLevel({ ...quiet, section: 'groove', growth: 1, rms: 0.6 });
    expect(trace).toBeLessThan(signal);
    expect(signal).toBeLessThan(loud);
  });

  it('never leaves the 0..5 range, however hard the music pushes', () => {
    const level = signalLevel({ growth: 1, rms: 1, section: 'drop', speed01: 1, grit: 1 });
    expect(level).toBeLessThanOrEqual(5);
    expect(level).toBeGreaterThan(4); // a full track dropping IS overload
  });

  it('lets a break be a hole in the picture even on a finished track', () => {
    const full = { ...quiet, growth: 1, rms: 0.5 };
    const dropping = signalLevel({ ...full, section: 'drop' });
    const breaking = signalLevel({ ...full, section: 'break' });
    expect(breaking).toBeLessThan(dropping * 0.35);
    // and it must actually be quiet, not merely quieter
    expect(breaking).toBeLessThan(2);
  });

  it('breaks the signal up with speed and dissonance, not with loudness', () => {
    const still = signalDrive({ ...quiet, growth: 1, rms: 0.5, section: 'groove' });
    const fast = signalDrive({ ...quiet, growth: 1, rms: 0.5, section: 'groove', speed01: 1 });
    const dissonant = signalDrive({ ...quiet, growth: 1, rms: 0.5, section: 'groove', grit: 1 });
    expect(fast.instability).toBeGreaterThan(still.instability);
    expect(dissonant.instability).toBeGreaterThan(still.instability);
    expect(still.instability).toBeLessThan(0.2);
  });

  it('keeps instability normalised so the shader can trust it', () => {
    const worst = signalDrive({ growth: 1, rms: 1, section: 'drop', speed01: 1, grit: 1 });
    expect(worst.instability).toBeLessThanOrEqual(1);
    expect(worst.intensity).toBeLessThanOrEqual(1);
  });
});
