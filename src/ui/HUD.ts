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
  /**
   * §203: hyper is the one flight state you cannot see in the world — the
   * streaks lengthen, but so do they when you simply fly fast. On touch it is
   * LATCHED rather than held, so nothing in your hand tells you either. This
   * says it plainly, near the thumb that switched it on.
   */
  private readonly hyperMark: HTMLDivElement;
  private lastText = '';
  private lastHyper: boolean | null = null;

  constructor(container: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.setAttribute('aria-hidden', 'true');
    // §197: the box lives in the stylesheet so a phone can shrink it. Inline
    // styles cannot be reached by a media query — see style.css .hud-readout.
    this.root.className = 'hud-readout';
    this.root.hidden = true;
    container.appendChild(this.root);

    this.hyperMark = document.createElement('div');
    this.hyperMark.setAttribute('aria-hidden', 'true');
    this.hyperMark.className = 'hud-hyper';
    this.hyperMark.textContent = 'HYPER ×2';
    this.hyperMark.hidden = true;
    container.appendChild(this.hyperMark);
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
    const hyper = place?.hyper === true;
    if (hyper !== this.lastHyper) {
      this.lastHyper = hyper;
      this.hyperMark.hidden = !hyper;
    }
    if (text === this.lastText) return;
    this.lastText = text;
    this.root.textContent = text;
  }

  dispose(): void {
    this.root.remove();
    this.hyperMark.remove();
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
