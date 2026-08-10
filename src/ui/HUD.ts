import type { FrequencyState } from '../player/FrequencyState';

/**
 * Poster-style minimal readout (user decision): freq / amp / wave in
 * monospace, top-left. Feedback, never a DAW (§21 UX).
 */
export class HUD {
  private readonly root: HTMLDivElement;
  private lastText = '';

  constructor(container: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.setAttribute('aria-hidden', 'true');
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '16px',
      left: '18px',
      color: 'rgba(220, 230, 232, 0.82)',
      font: '12px/1.7 "SF Mono", ui-monospace, Menlo, monospace',
      letterSpacing: '0.08em',
      whiteSpace: 'pre',
      pointerEvents: 'none',
      textShadow: '0 0 6px rgba(160, 220, 230, 0.35)',
      zIndex: '10',
    });
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  show(): void {
    this.root.hidden = false;
  }

  /**
   * Logic-loop rate is plenty; skips DOM writes when nothing changed.
   * §33: the heading line tells the player which region they are flying into,
   * so a direction is never just "away".
   */
  update(state: Readonly<FrequencyState>, heading?: string): void {
    const compass = heading === undefined ? '' : `\nhead: ${heading}`;
    const text = `freq: ${state.hz.toFixed(0)} hz\namp:  ${state.amplitude.toFixed(2)}\nwave: ${state.waveform}${compass}`;
    if (text === this.lastText) return;
    this.lastText = text;
    this.root.textContent = text;
  }

  dispose(): void {
    this.root.remove();
  }
}
