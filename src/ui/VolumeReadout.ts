import { VOLUME_STEPS } from '../audio/masterVolume';

/**
 * §145: the volume, said the way this game says everything else — eight
 * blocks, monospace, gone again in a second.
 *
 * It exists because the mouse is captured while flying: the knob has to be
 * playable from the keyboard, and a keyboard control with no feedback is a
 * guess. Not a settings panel, not a mixer (§21 UX).
 */
export function volumeBar(level: number): string {
  const filled = Math.round(Math.max(0, Math.min(1, level)) * VOLUME_STEPS);
  return `${'█'.repeat(filled)}${'░'.repeat(VOLUME_STEPS - filled)}`;
}

export class VolumeReadout {
  private readonly root: HTMLDivElement;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(container: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    Object.assign(this.root.style, {
      position: 'fixed',
      right: '18px',
      bottom: '18px',
      color: 'var(--signal-80)',
      font: '12px/1.6 var(--font-display)',
      letterSpacing: '0.24em',
      whiteSpace: 'pre',
      pointerEvents: 'none',
      opacity: '0',
      transition: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'none'
        : 'opacity 420ms linear',
      zIndex: '12',
    });
    container.appendChild(this.root);
  }

  show(level: number): void {
    this.root.textContent = `VOL ${volumeBar(level)}`;
    this.root.style.opacity = '1';
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.root.style.opacity = '0';
    }, 1200);
  }

  dispose(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.root.remove();
  }
}
