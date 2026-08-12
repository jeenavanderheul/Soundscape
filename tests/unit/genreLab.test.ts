import { describe, expect, it } from 'vitest';

import { GENRE_LAB_WORLDS } from '../../src/lab/genreLabWorlds';

describe('Genre Lab worlds', () => {
  it('offers only Techno', () => {
    expect(GENRE_LAB_WORLDS).toEqual(['techno']);
  });
});
