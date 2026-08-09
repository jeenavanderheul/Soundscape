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
