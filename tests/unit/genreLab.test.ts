import { describe, expect, it } from 'vitest';

import {
  GENRE_LAB_PRESETS,
  genreLabPresetLabel,
  isTrackGenrePreset,
} from '../../src/lab/genreLabWorlds';

describe('Genre Lab presets', () => {
  it('offers Techno and SUB PRESSURE only', () => {
    expect(GENRE_LAB_PRESETS).toEqual(['techno', 'sub-pressure']);
    expect(GENRE_LAB_PRESETS.map(genreLabPresetLabel)).toEqual(['techno', 'sub pressure']);
  });

  it('routes only Techno through the main world grammar', () => {
    expect(isTrackGenrePreset('techno')).toBe(true);
    expect(isTrackGenrePreset('sub-pressure')).toBe(false);
  });
});
