import type { TrackLayerName } from '../music/TrackState';
import { zoneGenres } from '../genres/GenreZones';
import type { TrackGenre } from '../music/TrackState';

/**
 * §67/§91 the guide (user request): where to fly to get the next layer.
 *
 * It used to point at an altitude BAND, because height ran the track like a
 * tape and one band was the only place it played at its own pitch and tempo.
 * §91 took that out — height is colour now, and the track is always in tune at
 * any height — so the band had nothing left to mean. What it points at instead
 * is the thing that does have a place: the layer standing in the world (§86).
 *
 * NOT a quest arrow — §P1 keeps waypoints out of the world and §23 makes every
 * assist optional. This is a read-out at the edge of the screen, in the same
 * monospace as the HUD, that says three things and nothing more:
 *
 *   - where the layer that is on offer is, and which layer it is
 *   - the direction of the world this track belongs to, since leaving it ends
 *     the track and starts another (§54)
 *   - whether to push, because speed is what develops it (§46)
 *
 * `G` turns it off.
 */

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
  genre: TrackGenre;
  /** Compass point the orb is flying towards. */
  heading: string;
  /** 0..1 how hard the player is pushing. */
  energy: number;
  /** The layer standing in the world, and where it is relative to the flight. */
  beacon: {
    layer: TrackLayerName;
    /** Radians off the nose: negative is left, positive is right. */
    bearing: number;
    /** How far above (+) or below (−) the orb it sits, in world units. */
    rise: number;
    distance: number;
  } | null;
}

/** Where the beacon sits relative to the nose, as −1..1 for the crosshair. */
export function beaconOffset(state: GuideState): { x: number; y: number } {
  if (state.beacon === null) return { x: 0, y: 0 };
  const x = Math.max(-1, Math.min(1, state.beacon.bearing / (Math.PI / 3)));
  const y = Math.max(-1, Math.min(1, state.beacon.rise / 30));
  return { x, y };
}

/** On the nose and close enough that it will be flown through. */
export function onTarget(state: GuideState): boolean {
  if (state.beacon === null) return false;
  return Math.abs(state.beacon.bearing) < 0.16 && Math.abs(state.beacon.rise) < 7;
}

/** The advice itself, as pure text — testable without a DOM. */
export function guideLines(state: GuideState): string[] {
  const home = homePoint(state.genre);
  const target =
    state.beacon === null
      ? 'every layer earned · fly it out to the finale'
      : onTarget(state)
        ? `${state.beacon.layer} dead ahead · hold it`
        : `${state.beacon.layer} ${state.beacon.bearing < -0.16 ? 'to your left' : state.beacon.bearing > 0.16 ? 'to your right' : 'ahead'}` +
          `${state.beacon.rise > 7 ? ', climb' : state.beacon.rise < -7 ? ', dive' : ''}` +
          ` · ${Math.round(state.beacon.distance)}m`;
  const place =
    home === null
      ? 'pick a direction · any of the ten is a world'
      : state.heading.startsWith(home)
        ? `stay on ${home} · this is where your track grows`
        : `turn to ${home} · leaving ends this track`;
  const push = state.energy < 0.55 ? 'hold W · speed is what builds it' : 'pushing · it is building';
  return [target, place, push];
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
    // §91: the tick rides towards the layer standing out there and settles
    // onto the cross when it is on the nose — no numbers to read, just a
    // thing to line up.
    const offset = beaconOffset(state);
    const settled = onTarget(state);
    const marker = `${(offset.x * 46).toFixed(0)}:${(-offset.y * 46).toFixed(0)}:${settled ? 1 : 0}`;
    if (marker !== this.lastTick) {
      this.lastTick = marker;
      this.tick.style.transform =
        `translate(${(offset.x * 46).toFixed(1)}px, ${(-offset.y * 46).toFixed(1)}px)`;
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
