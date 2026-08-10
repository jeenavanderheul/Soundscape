import type { EventBus } from '../core/EventBus';
import type { TrackEvents } from '../music/TrackState';

/** §29.3: one short monospace word when a layer unlocks. No popup, no badge. */
export class LayerCue {
  private readonly root: HTMLDivElement;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly detach: () => void;

  constructor(bus: EventBus<TrackEvents>, container: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'assertive');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '38%',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'rgba(235, 245, 246, 0.92)',
      font: '28px/1 "SF Mono", ui-monospace, Menlo, monospace',
      letterSpacing: '0.5em',
      pointerEvents: 'none',
      opacity: '0',
      transition: reduced ? 'none' : 'opacity 0.5s ease',
      textShadow: '0 0 18px rgba(180, 230, 240, 0.6)',
      zIndex: '11',
    });
    container.appendChild(this.root);
    this.detach = bus.on('track:layer', ({ layer }) => this.show(layer.toUpperCase()));
  }

  private show(word: string): void {
    this.root.textContent = word;
    this.root.style.opacity = '1';
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.root.style.opacity = '0';
    }, 1600);
  }

  dispose(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.detach();
    this.root.remove();
  }
}
