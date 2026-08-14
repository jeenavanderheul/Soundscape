import { beaconOffset, guideLines, onTarget } from '../../src/ui/Guide';
import { describe, expect, it } from 'vitest';

import { placeName,
  compassPoint,
  GENRE_LOOKS,
  headingLabel,
  lookFor,
  NEUTRAL_LOOK,
} from '../../src/genres/ZonePalette';
import type { GenreAffinity } from '../../src/music/MusicState';

const NONE: GenreAffinity = { techno: 0, 'sub-pressure': 0, ambient: 0, jazz: 0, bass: 0, garage: 0, house: 0, trap: 0, breakbeat: 0, dub: 0, experimental: 0 };

describe('§33 zone palette — every direction is a place you can see', () => {
  it('gives SUB PRESSURE a dark, high-relief identity distinct from Techno', () => {
    const pressure = GENRE_LOOKS['sub-pressure'];
    expect(pressure.relief).toBeGreaterThan(0.7);
    expect(pressure.color.r + pressure.color.g + pressure.color.b).toBeLessThan(1);
    expect(pressure).not.toEqual(GENRE_LOOKS.techno);
  });

  it('leaves the void neutral', () => {
    expect(lookFor(NONE)).toEqual(NEUTRAL_LOOK);
  });

  it('takes on a region fully once that region dominates', () => {
    const look = lookFor({ ...NONE, techno: 1 });
    expect(look.color).toEqual(GENRE_LOOKS.techno.color);
    expect(look.relief).toBeCloseTo(GENRE_LOOKS.techno.relief);
  });

  it('blends an even mix, but lets the dominant region dominate', () => {
    const red = GENRE_LOOKS.techno.color;
    const green = GENRE_LOOKS.bass.color;
    // Halfway between two compass points both regions pull hard (cos³ of
    // 22.5° ≈ 0.79), and there the look really is the midpoint.
    const between = lookFor({ ...NONE, techno: 0.79, bass: 0.79 });
    expect(between.color.r).toBeCloseTo((red.r + green.r) / 2, 1);
    expect(between.color).not.toEqual(red);
    // A weak pull leaves the world mostly void, as it should.
    expect(lookFor({ ...NONE, techno: 0.4 }).color.r).toBeLessThan(red.r / 2);

    // §45: at a compass point both neighbours sit at about a third. Weighted
    // linearly that turned every region into the same blend, so the leader
    // has to carry far more than its share.
    const atPoint = lookFor({ ...NONE, techno: 1, bass: 0.35, garage: 0.35 });
    expect(Math.abs(atPoint.color.r - red.r)).toBeLessThan(0.12);
    expect(Math.abs(atPoint.color.g - red.g)).toBeLessThan(0.12);
  });

  it('stays close to the void while the pull is weak', () => {
    const faint = lookFor({ ...NONE, techno: 0.2 });
    expect(faint.color.r).toBeLessThan(GENRE_LOOKS.techno.color.r / 2);
    expect(faint.color.r).toBeGreaterThan(NEUTRAL_LOOK.color.r);
  });

  it('gives every region a different colour and horizon', () => {
    const colors = Object.values(GENRE_LOOKS).map((l) => `${l.color.r},${l.color.g},${l.color.b}`);
    expect(new Set(colors).size).toBe(colors.length);
    const reliefs = Object.values(GENRE_LOOKS).map((l) => l.relief);
    expect(new Set(reliefs).size).toBe(reliefs.length);
  });
});

describe('§33 compass', () => {
  it('reads the ten points from a heading (§57)', () => {
    const step = (Math.PI * 2) / 10;
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(step)).toBe('NNE');
    expect(compassPoint(step * 2)).toBe('ENE');
    expect(compassPoint(Math.PI)).toBe('S');
    expect(compassPoint(-step)).toBe('NNW');
  });

  it('names the region the player is flying into', () => {
    const step = (Math.PI * 2) / 10;
    expect(headingLabel(0)).toBe('N · techno');
    expect(headingLabel(step * 2)).toBe('ENE · techno');
    expect(headingLabel(Math.PI)).toBe('S · sub-pressure');
    expect(headingLabel(-step * 3)).toBe('WSW · sub-pressure');
    expect(headingLabel(-step)).toBe('NNW · techno');
  });
});

describe('§57 a place is its music', () => {
  it('names every region after its grammar; only the middle is neutral', () => {
    expect(placeName('techno')).toBe('techno');
    expect(placeName('experimental')).toBe('experimental');
    expect(placeName('dub')).toBe('dub');
    expect(placeName(null)).toBe('the void');
  });
});

describe('§59 ten worlds you can tell apart at a glance', () => {
  const WORLDS = [
    'techno', 'garage', 'jazz', 'house', 'ambient',
    'breakbeat', 'bass', 'trap', 'dub', 'experimental',
  ] as const;

  /** Hue in degrees — what "a different colour" actually means to an eye. */
  function hue(world: keyof typeof GENRE_LOOKS): number {
    const { r, g, b } = GENRE_LOOKS[world].color;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    const h =
      max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return ((h * 60) % 360 + 360) % 360;
  }

  it('no two worlds sit on the same hue', () => {
    // Breakbeat is deliberately the one without a hue: near-white ivory.
    const hued = WORLDS.filter((w) => w !== 'breakbeat');
    for (const a of hued) {
      for (const b of hued) {
        if (a === b) continue;
        const apart = Math.abs(hue(a) - hue(b));
        const shortest = Math.min(apart, 360 - apart);
        expect(`${a}/${b}:${shortest >= 15}`).toBe(`${a}/${b}:true`);
      }
    }
  });

  it('and every world is a colour, not a grey', () => {
    for (const world of WORLDS) {
      const { r, g, b } = GENRE_LOOKS[world].color;
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      // Breakbeat is deliberately near-white; everything else is a hue.
      if (world !== 'breakbeat') expect(`${world}:${spread > 0.3}`).toBe(`${world}:true`);
      expect(Math.max(r, g, b)).toBeGreaterThan(0.79);
    }
  });
});

describe('§91 the guide points at the layer standing out there', () => {
  const at = (bearing: number, rise: number, distance = 120) =>
    ({ layer: 'bass' as const, bearing, rise, distance });

  it('names the layer, which way to turn and how far', () => {
    const right = guideLines({
      genre: 'techno', heading: 'N · techno', energy: 0.8, beacon: at(0.9, 0, 140),
    });
    expect(right[0]).toContain('bass');
    expect(right[0]).toContain('to your right');
    expect(right[0]).toContain('140m');
    expect(right[1]).toContain('stay on N');
    expect(right[2]).toContain('pushing');
  });

  it('says climb or dive only when the height really differs', () => {
    const base = { genre: 'techno' as const, heading: 'N · techno', energy: 0.2 };
    expect(guideLines({ ...base, beacon: at(0.9, 25) })[0]).toContain('climb');
    expect(guideLines({ ...base, beacon: at(0.9, -25) })[0]).toContain('dive');
    expect(guideLines({ ...base, beacon: at(0.9, 2) })[0]).not.toContain('climb');
    expect(guideLines({ ...base, beacon: at(0.9, 2) })[2]).toContain('hold LMB');
  });

  it('says hold it once the layer is on the nose', () => {
    const on = guideLines({
      genre: 'techno', heading: 'N · techno', energy: 0.8, beacon: at(0.02, 1),
    });
    expect(on[0]).toContain('dead ahead');
  });

  it('and says the track is full when there is nothing left to collect', () => {
    const done = guideLines({ genre: 'techno', heading: 'N · techno', energy: 0.8, beacon: null });
    expect(done[0]).toContain('every layer earned');
  });

  it('sends you home when you are heading out of your own world', () => {
    const away = guideLines({
      genre: 'sub-pressure', heading: 'N · techno', energy: 0.9, beacon: null,
    });
    expect(away[1]).toContain('turn to ESE');
    expect(away[1]).toContain('leaving ends this track');
  });

  it('and asks for a direction while nothing is playing yet', () => {
    const empty = guideLines({ genre: null, heading: 'N · techno', energy: 0.5, beacon: null });
    expect(empty[1]).toContain('pick a direction');
  });
});

describe('§91 the crosshair: something to line up, not a number to read', () => {
  const state = (bearing: number, rise: number) => ({
    genre: 'techno' as const, heading: 'N · techno', energy: 0.8,
    beacon: { layer: 'bass' as const, bearing, rise, distance: 100 },
  });

  it('settles on the cross when the beacon is on the nose', () => {
    expect(onTarget(state(0.02, 1))).toBe(true);
    const offset = beaconOffset(state(0.02, 1));
    expect(Math.abs(offset.x)).toBeLessThan(0.1);
  });

  it('rides towards it: right is positive, above is positive', () => {
    expect(beaconOffset(state(0.9, 0)).x).toBeGreaterThan(0);
    expect(beaconOffset(state(-0.9, 0)).x).toBeLessThan(0);
    expect(beaconOffset(state(0, 25)).y).toBeGreaterThan(0);
    expect(beaconOffset(state(0, -25)).y).toBeLessThan(0);
  });

  it('saturates instead of flying off the screen', () => {
    expect(beaconOffset(state(Math.PI, 400)).x).toBeLessThanOrEqual(1);
    expect(beaconOffset(state(Math.PI, 400)).y).toBeLessThanOrEqual(1);
    expect(beaconOffset(state(-Math.PI, -400)).x).toBeGreaterThanOrEqual(-1);
  });

  it('is centred when there is nothing to point at', () => {
    const none = beaconOffset({ genre: 'techno', heading: 'N', energy: 0.5, beacon: null });
    expect(none).toEqual({ x: 0, y: 0 });
  });
});
