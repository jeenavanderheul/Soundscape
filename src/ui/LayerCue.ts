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
    const offs = [
      // §83: layers are NOT announced here either. A layer is unlocked in the
      // middle of a bar but only becomes audible when the graph is applied at
      // the next bar, so the Game holds the word until then — reading KICK a
      // beat before the kick exists is the screen lying about the music.
      // §29.5/§29.7: entering a region announces itself the same way — one
      // word, then gone.
      bus.on('track:genre', ({ genre }) => {
        if (genre) this.show(genre.toUpperCase());
      }),
      // §60: sections are NOT announced here. The Game holds the word until
      // the bar boundary where the music actually changes, so what you read
      // and what you hear arrive together.
      // The journey never stops: the next track announces itself the same way.
      bus.on('track:new', ({ number }) => this.show(`TRACK ${String(number).padStart(2, '0')}`)),
    ];
    this.detach = () => {
      for (const off of offs) off();
    };
  }

  /** Say a word now — used for anything the Game times itself (§60). */
  announce(word: string): void {
    this.show(word);
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
