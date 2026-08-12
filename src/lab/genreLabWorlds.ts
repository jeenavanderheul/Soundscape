import type { TrackGenre } from '../music/TrackState';

export const GENRE_LAB_WORLDS = ['techno'] as const satisfies readonly Exclude<TrackGenre, null>[];
