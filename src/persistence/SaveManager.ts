import { migrate } from './migrations';
import { serialize, validate } from './WorldSerializer';
import type { SerializableWorld, WorldSave } from './WorldSerializer';

export const PRIMARY_KEY = 'frequency:save:v';
export const PREV_KEY = 'frequency:save:prev';

/** Minimal localStorage-shaped contract so tests can inject memory storage. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * localStorage-backed persistence (spec §18, MVP item 13). Every save moves
 * the previous valid snapshot to the prev key for recovery; load falls back
 * to it when the primary fails parsing, migration or validation. Storage
 * failures (quota, disabled) are a system boundary (spec §25.17): caught and
 * returned as typed results, never thrown.
 */
export class SaveManager {
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly storage: StorageLike,
    private readonly now: () => number = Date.now,
  ) {}

  save(world: SerializableWorld): SaveResult {
    try {
      const json = JSON.stringify(serialize(world, this.now()));
      const previous = this.storage.getItem(PRIMARY_KEY);
      if (previous !== null) this.storage.setItem(PREV_KEY, previous);
      this.storage.setItem(PRIMARY_KEY, json);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: message(error) };
    }
  }

  /** Debounced save: rapid calls coalesce; the latest state wins (spec §18). */
  autosave(world: SerializableWorld, delayMs: number): void {
    this.cancelAutosave();
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      this.save(world);
    }, delayMs);
  }

  /** Validated save, or null. Primary first, prev snapshot as fallback. */
  load(): WorldSave | null {
    return this.loadKey(PRIMARY_KEY) ?? this.loadKey(PREV_KEY);
  }

  /** Backs up the primary to prev (recoverable), then clears the primary. */
  reset(): SaveResult {
    this.cancelAutosave();
    try {
      const primary = this.storage.getItem(PRIMARY_KEY);
      if (primary !== null) this.storage.setItem(PREV_KEY, primary);
      this.storage.removeItem(PRIMARY_KEY);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: message(error) };
    }
  }

  dispose(): void {
    this.cancelAutosave();
  }

  private cancelAutosave(): void {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  private loadKey(key: string): WorldSave | null {
    try {
      const json = this.storage.getItem(key);
      if (json === null) return null;
      const migrated = migrate(JSON.parse(json));
      if (!migrated.ok) return null;
      const validated = validate(migrated.raw);
      return validated.ok ? validated.save : null;
    } catch {
      return null;
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
