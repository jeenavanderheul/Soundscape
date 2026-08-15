import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VOLUME,
  loadVolume,
  quantizeVolume,
  saveVolume,
  stepVolume,
  VOLUME_STEPS,
  volumeToGain,
} from '../../src/audio/masterVolume';
import { volumeBar } from '../../src/ui/VolumeReadout';

/** A localStorage that can also be broken, because a real one can be. */
function storage(initial: Record<string, string> = {}, broken = false) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => {
      if (broken) throw new Error('blocked');
      return map.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error('full');
      map.set(k, v);
    },
    read: (k: string) => map.get(k) ?? null,
  };
}

describe('§145 the volume knob', () => {
  it('lands on the same eight values however it is driven', () => {
    expect(quantizeVolume(0.51)).toBe(0.5);
    expect(quantizeVolume(0.44)).toBe(0.5);
    expect(stepVolume(0.5, 1)).toBe(0.625);
    expect(stepVolume(0.5, -1)).toBe(0.375);
    // Eight steps from silence to full, and no step lands off the ladder.
    let level = 0;
    for (let i = 0; i < VOLUME_STEPS; i++) level = stepVolume(level, 1);
    expect(level).toBe(1);
  });

  it('stops at both ends instead of wrapping or overshooting', () => {
    expect(stepVolume(1, 1)).toBe(1);
    expect(stepVolume(0, -1)).toBe(0);
  });

  it('is silent at zero and full at one, and half sounds like half', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    // Squared, not linear: a linear knob does nothing over its whole top half.
    expect(volumeToGain(0.5)).toBeCloseTo(0.25);
    expect(volumeToGain(0.5)).toBeLessThan(0.5);
  });

  it('remembers the level between flights', () => {
    const store = storage();
    saveVolume(0.375, store);
    expect(store.read('frequency:volume')).toBe('0.375');
    expect(loadVolume(store)).toBe(0.375);
  });

  it('falls back to the default rather than to silence', () => {
    expect(loadVolume(storage())).toBe(DEFAULT_VOLUME);
    expect(loadVolume(storage({ 'frequency:volume': 'loud' }))).toBe(DEFAULT_VOLUME);
    expect(loadVolume(null)).toBe(DEFAULT_VOLUME);
    // A blocked or full storage must never take the sound away or throw.
    const broken = storage({}, true);
    expect(loadVolume(broken)).toBe(DEFAULT_VOLUME);
    expect(() => saveVolume(0.5, broken)).not.toThrow();
  });

  it('reads back as eight blocks, so the keyboard has something to see', () => {
    expect(volumeBar(0)).toBe('░░░░░░░░');
    expect(volumeBar(1)).toBe('████████');
    expect(volumeBar(0.5)).toBe('████░░░░');
    expect(volumeBar(0.5)).toHaveLength(VOLUME_STEPS);
  });
});
