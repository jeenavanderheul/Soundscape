import { describe, expect, it } from 'vitest';

import { GENRE_LAB_PRESETS, genreLabPresetLabel } from '../../src/lab/genreLabWorlds';

describe('Genre Lab presets', () => {
  it('offers Techno and SUB PRESSURE only', () => {
    expect(GENRE_LAB_PRESETS).toEqual(['techno', 'sub-pressure']);
    expect(GENRE_LAB_PRESETS.map(genreLabPresetLabel)).toEqual(['techno', 'sub pressure']);
  });
});
