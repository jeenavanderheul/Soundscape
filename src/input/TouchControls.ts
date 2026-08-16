import type { InputManager } from './InputManager';
import { stickDeflection, touchZone } from './touch';

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
    this.input.setTouchThrottle(false);
    this.input.setTouchLook(0, 0);
  }

  private releaseWind(): void {
    if (this.windId === null) return;
    this.windId = null;
    this.input.touchWindRelease();
  }

  private readonly onStart = (event: Event): void => {
    event.preventDefault();
    for (const touch of Array.from((event as TouchEvent).changedTouches)) {
      if (touchZone(touch.clientX, window.innerWidth) === 'flight') {
        if (this.flightId !== null) continue;
        this.flightId = touch.identifier;
        this.origin = { x: touch.clientX, y: touch.clientY };
        this.input.setTouchThrottle(true);
        this.input.setTouchLook(0, 0);
      } else if (this.windId === null) {
        this.windId = touch.identifier;
        this.input.touchWindPress();
      }
    }
  };

  private readonly onMove = (event: Event): void => {
    event.preventDefault();
    for (const touch of Array.from((event as TouchEvent).changedTouches)) {
      if (touch.identifier !== this.flightId) continue;
      const d = stickDeflection(this.origin.x, this.origin.y, touch.clientX, touch.clientY);
      this.input.setTouchLook(d.x, d.y);
    }
  };

  private readonly onEnd = (event: Event): void => {
    for (const touch of Array.from((event as TouchEvent).changedTouches)) {
      if (touch.identifier === this.flightId) this.releaseFlight();
      else if (touch.identifier === this.windId) this.releaseWind();
    }
  };
}
