import { describe, expect, it } from 'vitest';

import { arcBar, layerRow } from '../../src/ui/TrackStrip';
import { LEVEL_DEEP, LEVEL_EARNED, createInitialTrackState } from '../../src/music/TrackState';

/**
 * §90: the read-out has to be readable at a glance and honest about what is
 * there. These check the two things a player actually decodes from it.
 */
describe('the strip shows where you are in the arc', () => {
  it('marks the current cycle, what is behind it and what is still ahead', () => {
    const bar = arcBar(8, 'driven');
    expect(bar).toContain('◆');
    expect(bar).toContain('09/32');
    expect(bar).toContain('DISCOVERY II');
    // Everything before the mark is flown, everything after is not.
    const marks = bar.split('  ')[0]!.replace(/ /g, '');
    expect(marks.slice(0, 8)).toBe('▬'.repeat(8));
    expect(marks[8]).toBe('◆');
    expect(marks.slice(9)).toBe('·'.repeat(23));
  });

  it('names the phase the cycle actually falls in, per world', () => {
    expect(arcBar(28, 'driven')).toContain('DROP II');
    // §61: a swelling world flies its own order through the eight, so the
    // same cycle is a different phase there — it voids before it peaks.
    expect(arcBar(12, 'driven')).toContain('PRESSURE');
    expect(arcBar(12, 'swell')).toContain('VOID');
  });
});

describe('the strip shows how much track there is', () => {
  const base = createInitialTrackState();

  it('is hollow before anything is earned', () => {
    const row = layerRow({ track: base, cycle: 0, style: 'driven', trackNumber: 1, beaconLayer: null });
    expect(row).toContain('KICK ▱▱');
    expect(row).not.toContain('▰');
  });

  it('half for earned, solid for grown deep', () => {
    const track = {
      ...base,
      drums: {
        kick: { unlocked: true, level: LEVEL_DEEP },
        snare: { unlocked: true, level: LEVEL_EARNED },
        hats: base.drums.hats,
      },
    };
    const row = layerRow({ track, cycle: 0, style: 'driven', trackNumber: 1, beaconLayer: null });
    expect(row).toContain('KICK ▰▰');
    expect(row).toContain('SNR ▰▱');
    expect(row).toContain('HAT ▱▱');
  });

  it('points at the layer standing in the world right now', () => {
    const row = layerRow({ track: base, cycle: 0, style: 'driven', trackNumber: 1, beaconLayer: 'bass' });
    expect(row).toContain('›BASS');
    expect(row).not.toContain('›KICK');
  });
});
