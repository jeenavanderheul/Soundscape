/**
 * §145 THE VOLUME KNOB.
 *
 * One number the player owns, 0..1, in eight steps so it can be driven from
 * the keyboard while flying and still land on the same values every time.
 *
 * It is applied AFTER the analyser tap on purpose (see `AudioEngine`): the
 * picture is drawn from how loud the music IS, not from how loud you have
 * chosen to hear it, so turning the volume down must never darken the world.
 */

export const VOLUME_STEPS = 8;

/** Where a fresh player starts: loud enough to be the point, short of full. */
export const DEFAULT_VOLUME = 0.75;

const STORAGE_KEY = 'frequency:volume';

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Snap to the nearest step, so the keyboard and the slider agree. */
export function quantizeVolume(level: number): number {
  return Math.round(clamp01(level) * VOLUME_STEPS) / VOLUME_STEPS;
}

/** One notch up or down. */
export function stepVolume(level: number, direction: 1 | -1): number {
  return quantizeVolume(quantizeVolume(level) + direction / VOLUME_STEPS);
}

/**
 * Perceived loudness is not the amplitude. A linear knob spends its whole top
 * half doing almost nothing audible and then falls off a cliff at the bottom,
 * so the level is squared before it reaches the gain: half way now sounds like
 * half.
 */
export function volumeToGain(level: number): number {
  const v = clamp01(level);
  return v * v;
}

interface VolumeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Reads the stored level; anything unreadable or out of range is the default. */
export function loadVolume(storage: VolumeStorage | null = safeStorage()): number {
  if (!storage) return DEFAULT_VOLUME;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_VOLUME;
    return quantizeVolume(parsed);
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function saveVolume(level: number, storage: VolumeStorage | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, String(quantizeVolume(level)));
  } catch {
    // A full or blocked storage is not a reason to interrupt a flight.
  }
}

function safeStorage(): VolumeStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
