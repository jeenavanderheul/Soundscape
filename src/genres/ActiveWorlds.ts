import type { TrackGenre } from '../music/TrackState';

export const ACTIVE_WORLD_GENRES = ['techno', 'sub-pressure'] as const;
export type ActiveWorldGenre = (typeof ACTIVE_WORLD_GENRES)[number];

export function isActiveWorldGenre(value: unknown): value is ActiveWorldGenre {
  return typeof value === 'string' && ACTIVE_WORLD_GENRES.includes(value as ActiveWorldGenre);
}

export function activeTrackGenre(value: TrackGenre): ActiveWorldGenre | null {
  return isActiveWorldGenre(value) ? value : null;
}
