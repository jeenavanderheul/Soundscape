import { describe, expect, it } from 'vitest';

import {
  GENRE_LAB_PRESETS,
  genreLabPresetLabel,
  isTrackGenrePreset,
} from '../../src/lab/genreLabWorlds';

describe('Genre Lab presets', () => {
  it('offers LOCKED GROOVE and SUB PRESSURE only', () => {
    expect(GENRE_LAB_PRESETS).toEqual(['locked-groove', 'sub-pressure', 'heavy-signal', 'broken-machine', 'percussion-riot', 'void-crusher']);
    expect(GENRE_LAB_PRESETS.map(genreLabPresetLabel)).toEqual(['locked-groove', 'sub pressure', 'heavy signal', 'broken machine', 'percussion riot', 'void crusher']);
  });

  it('routes only LOCKED GROOVE through the main world grammar', () => {
    expect(isTrackGenrePreset('locked-groove')).toBe(true);
    expect(isTrackGenrePreset('sub-pressure')).toBe(false);
  });
});
