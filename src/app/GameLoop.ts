import { Clock } from '../core/Clock';

export type TickHandler = (deltaMs: number, elapsedMs: number) => void;

/**
 * requestAnimationFrame render loop driven by the core Clock (spec §15).
 * The Clock clamps deltas, so restarting after tab suspension never
 * produces a large delta jump. raf/caf are injectable for tests.
 */
export class GameLoop {
  private frameId: number | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly onTick: TickHandler,
    private readonly raf: (cb: (nowMs: number) => void) => number = (cb) =>
      requestAnimationFrame(cb),
    private readonly caf: (id: number) => void = (id) => cancelAnimationFrame(id),
  ) {}

  get running(): boolean {
    return this.frameId !== null;
  }

  start(): void {
    if (this.frameId !== null) return;
    this.frameId = this.raf(this.frame);
  }

  stop(): void {
    if (this.frameId === null) return;
    this.caf(this.frameId);
    this.frameId = null;
  }

  private readonly frame = (nowMs: number): void => {
    if (this.frameId === null) return;
    this.frameId = this.raf(this.frame);
    const deltaMs = this.clock.tick(nowMs);
    this.onTick(deltaMs, this.clock.elapsedMs);
  };
}

/**
 * Fixed-interval gate for the lower-frequency logical loop (spec §15):
 * accumulates render-frame deltas and fires at most once per call when the
 * interval elapses. Clock deltas are already clamped, so the remainder
 * carry-over cannot burst after tab suspension.
 */
export class LogicInterval {
  private accumulatedMs = 0;

  constructor(private readonly stepMs: number) {}

  shouldStep(deltaMs: number): boolean {
    this.accumulatedMs += deltaMs;
    if (this.accumulatedMs < this.stepMs) return false;
    this.accumulatedMs %= this.stepMs;
    return true;
  }
}
