import { describe, expect, it } from 'vitest';

import { setZoneGenres } from '../../src/genres/GenreZones';
import {
  compassPoint,
  GENRE_LOOKS,
  headingLabel,
  lookFor,
  NEUTRAL_LOOK,
} from '../../src/genres/ZonePalette';
import type { GenreAffinity } from '../../src/music/MusicState';

const NONE: GenreAffinity = { techno: 0, ambient: 0, jazz: 0, dnb: 0, garage: 0, house: 0, trap: 0, classical: 0, dub: 0, experimental: 0 };

describe('§33 zone palette — every direction is a place you can see', () => {
  it('leaves the void neutral', () => {
    expect(lookFor(NONE)).toEqual(NEUTRAL_LOOK);
  });

  it('takes on a region fully once that region dominates', () => {
    const look = lookFor({ ...NONE, techno: 1 });
    expect(look.color).toEqual(GENRE_LOOKS.techno.color);
    expect(look.relief).toBeCloseTo(GENRE_LOOKS.techno.relief);
  });

  it('blends the space between two regions', () => {
    const between = lookFor({ ...NONE, techno: 0.5, dnb: 0.5 });
    const red = GENRE_LOOKS.techno.color;
    const green = GENRE_LOOKS.dnb.color;
    expect(between.color.r).toBeCloseTo((red.r + green.r) / 2);
    expect(between.color.g).toBeCloseTo((red.g + green.g) / 2);
    // A hybrid is neither of its parents.
    expect(between.color).not.toEqual(red);
    expect(between.color).not.toEqual(green);
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
  it('reads the eight points from a heading', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(Math.PI / 2)).toBe('E');
    expect(compassPoint(Math.PI)).toBe('S');
    expect(compassPoint(-Math.PI / 2)).toBe('W');
    expect(compassPoint(Math.PI / 4)).toBe('NE');
  });

  it('names the region the player is flying into', () => {
    setZoneGenres({ north: 'techno', east: 'jazz', south: 'ambient', west: 'dnb' });
    expect(headingLabel(0)).toBe('N · techno');
    expect(headingLabel(Math.PI / 2)).toBe('E · jazz');
    expect(headingLabel(Math.PI)).toBe('S · ambient');
    expect(headingLabel(-Math.PI / 2)).toBe('W · dnb');
  });

  it('follows a world that reassigned its directions (§30)', () => {
    setZoneGenres({ north: 'dnb' });
    expect(headingLabel(0)).toBe('N · dnb');
    setZoneGenres({ north: 'techno' });
  });
});
