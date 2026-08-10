import type { TrackState } from './TrackState';

/**
 * §29.7 ArrangementEngine: the track is never an endless 8-bar loop.
 * Movement becomes arrangement — rising energy builds, floating breaks it
 * down, pulsing hard again drops. Sections mute and unmute layers, so the
 * player hears WHERE they are in the song (§3.11 form).
 */

export type Section = TrackState['form'];

export interface ArrangementConfig {
  /** Minimum time in a section before it may change (musical patience). */
  minSectionMs: number;
  /** Energy above this reads as "pushing". */
  highEnergy: number;
  /** Energy below this reads as "floating". */
  lowEnergy: number;
  /** Time at high energy before the track drops. */
  buildMs: number;
  /** How long a drop holds before it settles back into the groove. */
  dropMs: number;
}

export const ARRANGEMENT_CONFIG: ArrangementConfig = {
  minSectionMs: 8000,
  highEnergy: 0.55,
  lowEnergy: 0.2,
  buildMs: 12_000,
  dropMs: 20_000,
};

/** Per-section layer gain multipliers (0 = muted for this section). */
export interface SectionMix {
  drums: number;
  bass: number;
  harmony: number;
  melody: number;
  texture: number;
  atmosphere: number;
}

const MIXES: Record<Section, SectionMix> = {
  none: { drums: 1, bass: 1, harmony: 1, melody: 1, texture: 1, atmosphere: 1 },
  intro: { drums: 0.85, bass: 0.7, harmony: 0.6, melody: 0, texture: 0.4, atmosphere: 1 },
  groove: { drums: 1, bass: 1, harmony: 0.8, melody: 0.7, texture: 0.6, atmosphere: 0.8 },
  build: { drums: 1, bass: 1, harmony: 1, melody: 0.9, texture: 1, atmosphere: 0.6 },
  drop: { drums: 1, bass: 1, harmony: 1, melody: 1, texture: 1, atmosphere: 0.5 },
  // The kick steps aside — but a break is not silence: the percussion and
  // the top end carry it, or the track stops sounding like a track (§32).
  break: { drums: 0.55, bass: 0.5, harmony: 1, melody: 0.8, texture: 0.9, atmosphere: 1 },
  return: { drums: 1, bass: 1, harmony: 0.9, melody: 0.8, texture: 0.7, atmosphere: 0.7 },
  mutation: { drums: 0.8, bass: 0.9, harmony: 0.8, melody: 1, texture: 1, atmosphere: 0.9 },
};

export function sectionMix(section: Section): SectionMix {
  return MIXES[section];
}

export class ArrangementEngine {
  private section: Section = 'none';
  private sectionSinceMs = 0;
  private highEnergyMs = 0;

  constructor(private readonly config: ArrangementConfig = ARRANGEMENT_CONFIG) {}

  get current(): Section {
    return this.section;
  }

  /**
   * `energy` blends how hard the player pushes (0..1); `layers` is how much
   * of the track exists. Deterministic given its inputs.
   */
  /**
   * §58 (user decision): height is pitch and tempo, nothing else. The form of
   * the track comes from how hard the player is flying and how long they have
   * been at it — one meaning per gesture, and nothing to learn.
   */
  tick(nowMs: number, deltaMs: number, energy: number): Section {
    const { config } = this;
    if (this.section === 'none') {
      this.enter('intro', nowMs);
      return this.section;
    }
    this.highEnergyMs = energy >= config.highEnergy ? this.highEnergyMs + deltaMs : 0;
    const inSectionMs = nowMs - this.sectionSinceMs;

    if (inSectionMs < config.minSectionMs) return this.section;

    switch (this.section) {
      case 'intro':
        this.enter('groove', nowMs);
        break;
      // §47: HEIGHT is what builds and drops. Energy only decides whether the
      // track is breathing (floating) or running — it can never hand the player
      // a build or a drop they did not fly for.
      case 'groove':
        if (this.highEnergyMs >= config.buildMs) this.enter('build', nowMs);
        else if (energy <= config.lowEnergy) this.enter('break', nowMs);
        break;
      case 'build':
        // Keep pushing and it drops; ease off and it settles back.
        if (energy >= config.highEnergy && inSectionMs >= config.minSectionMs) {
          this.enter('drop', nowMs);
        } else if (energy < config.highEnergy) {
          this.enter('groove', nowMs);
        }
        break;
      case 'drop':
        if (energy <= config.lowEnergy) this.enter('break', nowMs);
        else if (inSectionMs >= config.dropMs) this.enter('return', nowMs);
        break;
      case 'break':
        if (energy > config.lowEnergy) this.enter('groove', nowMs);
        break;
      case 'return':
        if (energy <= config.lowEnergy) this.enter('break', nowMs);
        else if (inSectionMs >= config.dropMs) this.enter('mutation', nowMs);
        break;
      case 'mutation':
        if (energy <= config.lowEnergy) this.enter('break', nowMs);
        else if (inSectionMs >= config.dropMs) this.enter('groove', nowMs);
        break;
      default:
        break;
    }
    return this.section;
  }

  reset(): void {
    this.section = 'none';
    this.sectionSinceMs = 0;
    this.highEnergyMs = 0;
  }

  private enter(section: Section, nowMs: number): void {
    this.section = section;
    this.sectionSinceMs = nowMs;
    this.highEnergyMs = 0;
  }
}
