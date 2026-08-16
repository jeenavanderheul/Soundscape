import type { InputManager } from './InputManager';
import { isDoubleTap, lookDeltaPerFrame, stickDeflection, touchZone } from './touch';

/** A touch that landed on a piece of interface (the menu button), not on the world. */
function isChromeTouch(touch: Touch): boolean {
  const target = touch.target;
  return target instanceof Element && target.closest('[data-ui-control]') !== null;
}

/** Touch hardware present — pointer lock and mouse look are skipped then. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Touch sensor layer (mobile). Translates touches into the SAME InputManager
 * the keyboard and mouse feed — one snapshot, one truth (§56). Left half of
 * the screen: one thumb that is throttle + look (see touch.ts). Right half:
 * the wind — hold to breathe, release for the timed pulse.
 */
export class TouchControls {
  private attached = false;
  private flightId: number | null = null;
  private windId: number | null = null;
  private origin = { x: 0, y: 0 };
  /** §203: the previous tap in the flight zone, for the double-tap latch. */
  private lastTap: { atMs: number; x: number; y: number } | null = null;
  private hyper = false;

  constructor(
    private readonly element: HTMLElement,
    private readonly input: InputManager,
  ) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    // The browser must not scroll, zoom or long-press-select the world.
    this.element.style.touchAction = 'none';
    this.element.addEventListener('touchstart', this.onStart, { passive: false });
    this.element.addEventListener('touchmove', this.onMove, { passive: false });
    this.element.addEventListener('touchend', this.onEnd);
    this.element.addEventListener('touchcancel', this.onEnd);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.element.removeEventListener('touchstart', this.onStart);
    this.element.removeEventListener('touchmove', this.onMove);
    this.element.removeEventListener('touchend', this.onEnd);
    this.element.removeEventListener('touchcancel', this.onEnd);
    this.releaseFlight();
    this.releaseWind();
  }

  private releaseFlight(): void {
    this.flightId = null;
    this.input.setSyntheticThrottle(false);
    this.input.setSyntheticLook(0, 0);
  }

  private releaseWind(): void {
    if (this.windId === null) return;
    this.windId = null;
    this.input.syntheticWindRelease();
  }

  private readonly onStart = (event: Event): void => {
    // §197: the menu button sits top RIGHT, which is the wind's half of the
    // screen. A touch that landed on interface chrome is not a control input,
    // and — crucially — must NOT be preventDefault'd, or the browser never
    // synthesises the click that opens the menu.
    const touches = Array.from((event as TouchEvent).changedTouches).filter(
      (touch) => !isChromeTouch(touch),
    );
    if (touches.length === 0) return;
    event.preventDefault();
    for (const touch of touches) {
      if (touchZone(touch.clientX, window.innerWidth) === 'flight') {
        if (this.flightId !== null) continue;
        this.flightId = touch.identifier;
        this.origin = { x: touch.clientX, y: touch.clientY };
        this.input.setSyntheticThrottle(true);
        this.input.setSyntheticLook(0, 0);
        // §203: two taps in the same spot latch hyper on, the next two let it
        // go. Landing the thumb is what counts, not lifting it, so it engages
        // on the way in and you keep flying through it.
        const tap = { atMs: event.timeStamp, x: touch.clientX, y: touch.clientY };
        if (isDoubleTap(this.lastTap, tap)) {
          this.hyper = !this.hyper;
          this.input.setSyntheticHyper(this.hyper);
          this.lastTap = null;
        } else {
          this.lastTap = tap;
        }
      } else if (this.windId === null) {
        this.windId = touch.identifier;
        this.input.syntheticWindPress();
      }
    }
  };

  private readonly onMove = (event: Event): void => {
    event.preventDefault();
    for (const touch of Array.from((event as TouchEvent).changedTouches)) {
      if (touch.identifier !== this.flightId) continue;
      const d = stickDeflection(this.origin.x, this.origin.y, touch.clientX, touch.clientY);
      const px = lookDeltaPerFrame(d);
      this.input.setSyntheticLook(px.x, px.y);
    }
  };

  private readonly onEnd = (event: Event): void => {
    for (const touch of Array.from((event as TouchEvent).changedTouches)) {
      if (touch.identifier === this.flightId) this.releaseFlight();
      else if (touch.identifier === this.windId) this.releaseWind();
    }
  };
}
