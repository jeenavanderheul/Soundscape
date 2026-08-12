import { describe, expect, it } from 'vitest';
import { ACTIVE_WORLD_GENRES, isActiveWorldGenre } from '../../src/genres/ActiveWorlds';

describe('active worlds', () => {
  it('activates only Techno and SUB PRESSURE', () => {
    expect(ACTIVE_WORLD_GENRES).toEqual(['techno', 'sub-pressure']);
    expect(isActiveWorldGenre('techno')).toBe(true);
    expect(isActiveWorldGenre('sub-pressure')).toBe(true);
    expect(isActiveWorldGenre('ambient')).toBe(false);
  });
});
