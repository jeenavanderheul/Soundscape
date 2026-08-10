import { AIR_ALTITUDE, PITCH_STEPS } from '../music/Performance';
import { zoneGenres } from '../genres/GenreZones';
import type { TrackGenre } from '../music/TrackState';

/**
 * §67 the guide (user request): where to fly, and how high, to hear this track
 * at its best.
 *
 * NOT a quest arrow — §P1 keeps waypoints out of the world and §23 makes every
 * assist optional. This is a read-out at the edge of the screen, in the same
 * monospace as the HUD, that says three things and nothing more:
 *
 *   - the altitude band where the track plays at its OWN pitch and tempo,
 *     because height is a tape (§58) and every other band is a version of it
 *   - the direction of the world this track belongs to, since leaving it ends
 *     the track and starts another (§54)
 *   - whether to push, because speed is what develops it (§46)
 *
 * `G` turns it off.
 */

/** Altitude band where the track runs untransposed and at its region tempo. */
export function trueAltitudeBand(): { low: number; high: number } {
  const index = PITCH_STEPS.indexOf(0);
  const bands = PITCH_STEPS.length;
  return {
    low: (index / bands) * AIR_ALTITUDE,
    high: ((index + 1) / bands) * AIR_ALTITUDE,
  };
}

/** The compass point this grammar lives at, or null while nothing is playing. */
export function homePoint(genre: TrackGenre): string | null {
  if (genre === null) return null;
  const zones = zoneGenres();
  const labels: Record<keyof typeof zones, string> = {
    north: 'N',
    northNorthEast: 'NNE',
    eastNorthEast: 'ENE',
    eastSouthEast: 'ESE',
    southSouthEast: 'SSE',
    south: 'S',
    southSouthWest: 'SSW',
    westSouthWest: 'WSW',
    westNorthWest: 'WNW',
    northNorthWest: 'NNW',
  };
  for (const [key, value] of Object.entries(zones) as [keyof typeof zones, TrackGenre][]) {
    if (value === genre) return labels[key];
  }
  return null;
}

/**
 * §67b: where the ideal band sits relative to the orb, as −1..1 for the
 * crosshair. Positive means the band is ABOVE you, so the tick rides above the
 * cross and you climb towards it; 0 means you are in it.
 */
export function bandOffset(altitude: number): number {
  const band = trueAltitudeBand();
  const centre = (band.low + band.high) / 2;
  if (altitude >= band.low && altitude <= band.high) return 0;
  // Half the band's own width is one "notch"; the tick saturates after eight.
  const notch = Math.max(1, (band.high - band.low) / 2);
  return Math.max(-1, Math.min(1, (centre - altitude) / (notch * 8)));
}

export function inBand(altitude: number): boolean {
  const band = trueAltitudeBand();
  return altitude >= band.low && altitude <= band.high;
}

export interface GuideState {
  /** Height above the terrain right under the orb. */
  altitude: number;
  genre: TrackGenre;
  /** Compass point the orb is flying towards. */
  heading: string;
  /** 0..1 how hard the player is pushing. */
  energy: number;
}

/** The advice itself, as pure text — testable without a DOM. */
export function guideLines(state: GuideState): string[] {
  const band = trueAltitudeBand();
  const home = homePoint(state.genre);
  const altitude =
    state.altitude < band.low
      ? `climb to ${Math.round(band.low)}-${Math.round(band.high)} · you are running slow and deep`
      : state.altitude > band.high
        ? `drop to ${Math.round(band.low)}-${Math.round(band.high)} · you are running fast and high`
        : `hold this height · the track is at its own pitch`;
  const place =
    home === null
      ? 'pick a direction · any of the ten is a world'
      : state.heading.startsWith(home)
        ? `stay on ${home} · this is where your track grows`
        : `turn to ${home} · leaving ends this track`;
  const push = state.energy < 0.55 ? 'hold LMB · speed is what builds it' : 'pushing · it is building';
  return [altitude, place, push];
}

export class Guide {
  private readonly root: HTMLDivElement;
  /** §67b: the crosshair, and the tick that shows where the good height is. */
  private readonly cross: HTMLDivElement;
  private readonly tick: HTMLDivElement;
  private last = '';
  private lastTick = '';

  constructor(container: HTMLElement = document.body) {
    this.cross = document.createElement('div');
    this.cross.setAttribute('aria-hidden', 'true');
    Object.assign(this.cross.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      width: '13px',
      height: '13px',
      marginLeft: '-6.5px',
      marginTop: '-6.5px',
      pointerEvents: 'none',
      zIndex: '10',
      // A cross of two hairlines: the smallest thing that reads as "here".
      background:
        'linear-gradient(rgba(210,225,228,.5),rgba(210,225,228,.5)) 50% 0/1px 100% no-repeat,' +
        'linear-gradient(rgba(210,225,228,.5),rgba(210,225,228,.5)) 0 50%/100% 1px no-repeat',
      transition: 'opacity .2s ease',
    });
    this.tick = document.createElement('div');
    this.tick.setAttribute('aria-hidden', 'true');
    Object.assign(this.tick.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      width: '26px',
      height: '1px',
      marginLeft: '-13px',
      pointerEvents: 'none',
      zIndex: '10',
      background: 'rgba(210, 225, 228, 0.75)',
    });
    container.appendChild(this.cross);
    container.appendChild(this.tick);
    this.cross.hidden = true;
    this.tick.hidden = true;
    this.root = document.createElement('div');
    this.root.setAttribute('aria-hidden', 'true');
    Object.assign(this.root.style, {
      position: 'fixed',
      right: '18px',
      bottom: '16px',
      textAlign: 'right',
      color: 'rgba(200, 216, 220, 0.55)',
      font: '11px/1.9 "SF Mono", ui-monospace, Menlo, monospace',
      letterSpacing: '0.06em',
      whiteSpace: 'pre',
      pointerEvents: 'none',
      zIndex: '10',
    });
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    this.cross.hidden = this.root.hidden;
    this.tick.hidden = this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    this.cross.hidden = false;
    this.tick.hidden = false;
  }

  update(state: GuideState): void {
    if (this.root.hidden) return;
    // §67b: the tick rides above the cross while the good height is above you
    // and settles onto it when you are there — no numbers to read, just a
    // thing to line up.
    const offset = bandOffset(state.altitude);
    const settled = inBand(state.altitude);
    const marker = `${(-offset * 46).toFixed(0)}:${settled ? 1 : 0}`;
    if (marker !== this.lastTick) {
      this.lastTick = marker;
      this.tick.style.transform = `translateY(${(-offset * 46).toFixed(1)}px)`;
      this.tick.style.opacity = settled ? '0.95' : '0.6';
      this.tick.style.width = settled ? '13px' : '26px';
      this.tick.style.marginLeft = settled ? '-6.5px' : '-13px';
      this.cross.style.opacity = settled ? '1' : '0.45';
    }
    const text = guideLines(state).join('\n');
    if (text === this.last) return;
    this.last = text;
    this.root.textContent = text;
  }

  dispose(): void {
    this.root.remove();
    this.cross.remove();
    this.tick.remove();
  }
}
