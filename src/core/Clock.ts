// Spec §15: clamp large frame deltas after tab suspension.
export const MAX_DELTA_MS = 100;

export class Clock {
  private lastMs: number | null = null;
  elapsedMs = 0;

  // Returns the clamped delta since the previous tick, in ms.
  tick(nowMs: number): number {
    if (this.lastMs === null) {
      this.lastMs = nowMs;
      return 0;
    }
    const delta = Math.min(Math.max(nowMs - this.lastMs, 0), MAX_DELTA_MS);
    this.lastMs = nowMs;
    this.elapsedMs += delta;
    return delta;
  }
}
