export type GenreLabPreset = 'techno' | 'sub-pressure';

export const GENRE_LAB_PRESETS = [
  'techno',
  'sub-pressure',
] as const satisfies readonly GenreLabPreset[];

export function genreLabPresetLabel(preset: GenreLabPreset): string {
  return preset === 'sub-pressure' ? 'sub pressure' : preset;
}

export function isTrackGenrePreset(preset: GenreLabPreset): preset is 'techno' {
  return preset === 'techno';
}
