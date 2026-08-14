import type { FrequencyState } from '../player/FrequencyState';

/** §36: where the player is, in the world's own words. */
export interface HudPlace {
  /** Compass point you are flying towards, and the grammar that lies there. */
  heading: string;
  /** The grammar you are actually IN right now. */
  biome: string;
  /** 0..1 how fast the track is developing right now (§46). */
  speed: number;
  /** §129: the hyper boost is being held — twice the speed the bar shows. */
  hyper?: boolean;
  /** Which track of the endless journey is playing, its grammar, and how full. */
  track: number;
  /** §47: the track keeps the grammar it was born in — which is not always `here`. */
  trackGenre: string;
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
        : `\n\nspeed ${bar(place.speed)}${place.hyper === true ? '  HYPER ×2' : ''}` +
          `\ntrack ${String(place.track).padStart(2, '0')} · ${place.trackGenre} · ${place.layers}/${place.maxLayers} layers` +
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

/**
 * Five blocks, each split into four quarters (§51): a tap moves the bar by a
 * visible amount and letting go walks it back down quarter by quarter.
 */
const QUARTERS = ['\u2591', '\u258e', '\u258c', '\u258a', '\u2588'] as const;

/**
 * §120: nine blocks, not five.
 *
 * The bar read a NORMALISED throttle — 0 to 1 — so when §119 doubled the top
 * speed it could not show it: full gas filled the same five blocks it always
 * had, and the half of the throttle that now carries you through a track in a
 * minute was invisible. Nine blocks, and the last four are the range that
 * only opened up at the top.
 */
export const SPEED_BLOCKS = 9;

function bar(value: number): string {
  const quarters = Math.round(Math.min(1, Math.max(0, value)) * SPEED_BLOCKS * 4);
  let out = '';
  for (let block = 0; block < SPEED_BLOCKS; block++) {
    out += QUARTERS[Math.min(4, Math.max(0, quarters - block * 4))]!;
  }
  return out;
}
