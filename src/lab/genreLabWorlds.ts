export type GenreLabPreset = Exclude<import('../music/TrackState').TrackGenre, null>;

export const GENRE_LAB_PRESETS = [
  'techno', 'sub-pressure', 'heavy-signal', 'broken-machine',
  'percussion-riot', 'void-crusher',
] as const satisfies readonly GenreLabPreset[];

const LABELS: Record<GenreLabPreset, string> = {
  techno: 'techno',
  'sub-pressure': 'sub pressure',
  'heavy-signal': 'heavy signal',
  'broken-machine': 'broken machine',
  'percussion-riot': 'percussion riot',
  'void-crusher': 'void crusher',
};

export function genreLabPresetLabel(preset: GenreLabPreset): string {
  return LABELS[preset];
}

export function isTrackGenrePreset(preset: GenreLabPreset): preset is 'techno' {
  return preset === 'techno';
}
