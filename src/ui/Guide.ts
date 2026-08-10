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
  private last = '';

  constructor(container: HTMLElement = document.body) {
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
  }

  show(): void {
    this.root.hidden = false;
  }

  update(state: GuideState): void {
    if (this.root.hidden) return;
    const text = guideLines(state).join('\n');
    if (text === this.last) return;
    this.last = text;
    this.root.textContent = text;
  }

  dispose(): void {
    this.root.remove();
  }
}
