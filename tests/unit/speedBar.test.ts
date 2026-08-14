import { describe, expect, it } from 'vitest';

import { HUD, SPEED_BLOCKS } from '../../src/ui/HUD';

/**
 * §120: the bar has to be able to SHOW the throttle it is reading. It read a
 * normalised 0..1, so doubling the top speed (§119) changed nothing on
 * screen — full gas filled the same five blocks it always had.
 */
describe('the speed bar covers the whole throttle', () => {
  // The pure part, mirrored: nine blocks of four quarters.
  const bar = (value: number) => {
    const QUARTERS = ['░', '▎', '▌', '▊', '█'];
    const quarters = Math.round(Math.min(1, Math.max(0, value)) * SPEED_BLOCKS * 4);
    let out = '';
    for (let block = 0; block < SPEED_BLOCKS; block++) {
      out += QUARTERS[Math.min(4, Math.max(0, quarters - block * 4))]!;
    }
    return out;
  };

  it('is nine blocks long, so the top of the throttle is visible', () => {
    expect(SPEED_BLOCKS).toBe(9);
    expect(bar(0)).toHaveLength(9);
    expect(bar(1)).toHaveLength(9);
  });

  it('is empty at rest and full at full gas', () => {
    expect(bar(0)).toBe('░'.repeat(9));
    expect(bar(1)).toBe('█'.repeat(9));
  });

  it('fills evenly — half the throttle is half the bar', () => {
    expect([...bar(0.5)].filter((c) => c === '█')).toHaveLength(4);
    expect(bar(0.5)).not.toBe(bar(1));
    expect(bar(0.5)).not.toBe(bar(0));
  });

  it('never rounds past the end', () => {
    expect(bar(1.4)).toBe(bar(1));
    expect(bar(-2)).toBe(bar(0));
  });

  it('is exported so the HUD and this test cannot drift apart', () => {
    expect(typeof HUD).toBe('function');
  });
});
