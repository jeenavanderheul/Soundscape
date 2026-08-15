import { describe, expect, it } from 'vitest';
import { GENRE_LOOKS } from '../../src/genres/ZonePalette';

/** §174: six worlds, six colours nobody can confuse for one another. */
describe('§174 every world is a different colour', () => {
  const hue = (c: { r: number; g: number; b: number }): number => {
    const max = Math.max(c.r, c.g, c.b);
    const min = Math.min(c.r, c.g, c.b);
    const d = max - min;
    if (d === 0) return 0;
    let h: number;
    if (max === c.r) h = ((c.g - c.b) / d) % 6;
    else if (max === c.g) h = (c.b - c.r) / d + 2;
    else h = (c.r - c.g) / d + 4;
    return ((h * 60) % 360 + 360) % 360;
  };

  it('keeps every pair of worlds at least 40 degrees apart on the wheel', () => {
    const worlds = Object.keys(GENRE_LOOKS) as (keyof typeof GENRE_LOOKS)[];
    const hues = worlds.map((w) => ({ w, h: hue(GENRE_LOOKS[w].color) }));
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        const raw = Math.abs(hues[i]!.h - hues[j]!.h);
        const apart = Math.min(raw, 360 - raw);
        // heavy-signal and percussion-riot used to be six degrees apart, which
        // is why the six worlds read as one world in four tints.
        expect(apart, `${hues[i]!.w} vs ${hues[j]!.w}`).toBeGreaterThan(40);
      }
    }
  });

  it('gives every world a colour with real saturation to carry', () => {
    for (const look of Object.values(GENRE_LOOKS)) {
      const max = Math.max(look.color.r, look.color.g, look.color.b);
      const min = Math.min(look.color.r, look.color.g, look.color.b);
      expect(max - min).toBeGreaterThan(0.5);
    }
  });
});
