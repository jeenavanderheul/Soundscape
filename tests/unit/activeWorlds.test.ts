import { describe, expect, it } from 'vitest';
import { ACTIVE_WORLD_GENRES, isActiveWorldGenre } from '../../src/genres/ActiveWorlds';

describe('active worlds', () => {
  it('activates only LOCKED GROOVE and SUB PRESSURE', () => {
    expect(ACTIVE_WORLD_GENRES).toEqual(['locked-groove', 'sub-pressure', 'heavy-signal', 'broken-machine', 'percussion-riot', 'void-crusher']);
    expect(isActiveWorldGenre('locked-groove')).toBe(true);
    expect(isActiveWorldGenre('sub-pressure')).toBe(true);
    expect(isActiveWorldGenre('ambient')).toBe(false);
  });
});
