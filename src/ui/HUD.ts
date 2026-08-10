import type { FrequencyState } from '../player/FrequencyState';

/** §36: where the player is, in the world's own words. */
export interface HudPlace {
  /** Compass point you are flying towards, and the grammar that lies there. */
  heading: string;
  /** The grammar you are actually IN right now. */
  biome: string;
  /** 0..1 how fast the track is developing right now (§46). */
  speed: number;
  /** Which track of the endless journey is playing, and how full it is. */
  track: number;
  layers: number;
  maxLayers: number;
}

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
  update(state: Readonly<FrequencyState>, place?: HudPlace): void {
    const where =
      place === undefined
        ? ''
        : `\n\nspeed ${bar(place.speed)}` +
          `\ntrack ${String(place.track).padStart(2, '0')} · ${place.layers}/${place.maxLayers} layers` +
          `\n\nflying: ${place.heading}\nhere:   ${place.biome}`;
    const text = `freq: ${state.hz.toFixed(0)} hz\namp:  ${state.amplitude.toFixed(2)}\nwave: ${state.waveform}${where}`;
    if (text === this.lastText) return;
    this.lastText = text;
    this.root.textContent = text;
  }

  dispose(): void {
    this.root.remove();
  }
}

/** Five notches: how fast the world is going past, and the track with it. */
function bar(value: number): string {
  const filled = Math.round(Math.min(1, Math.max(0, value)) * 5);
  let out = '';
  for (let i = 1; i <= 5; i++) out += i <= filled ? '\u2588' : '\u2591';
  return out;
}
