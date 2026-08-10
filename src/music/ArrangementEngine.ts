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
  /** Vertical rate (units/s) that counts as deliberately climbing or diving. */
  climbRate: number;
  /** Time climbing before the track starts building (user decision). */
  climbMs: number;
  /** Quiet after a drop before climbing can build another one. */
  dropCooldownMs: number;
}

export const ARRANGEMENT_CONFIG: ArrangementConfig = {
  minSectionMs: 8000,
  highEnergy: 0.55,
  lowEnergy: 0.2,
  buildMs: 12_000,
  dropMs: 20_000,
  climbRate: 3,
  climbMs: 2500,
  dropCooldownMs: 12_000,
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
  private climbMs = 0;
  private lastDropMs = -Infinity;

  constructor(private readonly config: ArrangementConfig = ARRANGEMENT_CONFIG) {}

  get current(): Section {
    return this.section;
  }

  /**
   * `energy` blends how hard the player pushes (0..1); `layers` is how much
   * of the track exists. Deterministic given its inputs.
   */
  /**
   * `climb` is the orb's vertical speed in units/s: a sustained climb builds the
   * track up, and diving out of that build IS the drop. A drop has to be earned
   * by a climb and cannot be repeated straight away, so it keeps its weight.
   *
   * §47 (user decision): the form belongs to the FLIGHT, not to how much of the
   * track exists. Climbing and diving build and drop whether you have one layer
   * or seven — height is the arrangement, full stop.
   */
  tick(nowMs: number, deltaMs: number, energy: number, climb = 0): Section {
    const { config } = this;
    if (this.section === 'none') {
      this.enter('intro', nowMs);
      return this.section;
    }
    this.highEnergyMs = energy >= config.highEnergy ? this.highEnergyMs + deltaMs : 0;
    this.climbMs = climb >= config.climbRate ? this.climbMs + deltaMs : 0;
    const inSectionMs = nowMs - this.sectionSinceMs;

    // Height is the arrangement (user decision). Climbing lifts the track into
    // a build; dropping out of the sky is the drop. Both bypass the patience
    // timer, because the player asked for them with the stick.
    const climbing = this.climbMs >= config.climbMs;
    const diving = climb <= -config.climbRate;
    if (this.section === 'build' && diving) {
      this.lastDropMs = nowMs;
      this.climbMs = 0;
      this.enter('drop', nowMs);
      return this.section;
    }
    if (
      climbing &&
      this.section !== 'build' &&
      this.section !== 'drop' &&
      this.section !== 'intro' &&
      nowMs - this.lastDropMs >= config.dropCooldownMs
    ) {
      this.enter('build', nowMs);
      return this.section;
    }

    if (inSectionMs < config.minSectionMs) return this.section;

    switch (this.section) {
      case 'intro':
        this.enter('groove', nowMs);
        break;
      case 'groove':
        if (this.highEnergyMs >= config.buildMs) this.enter('build', nowMs);
        else if (energy <= config.lowEnergy) this.enter('break', nowMs);
        break;
      case 'build':
        if (energy >= config.highEnergy) this.enter('drop', nowMs);
        else this.enter('groove', nowMs);
        break;
      case 'drop':
        if (energy <= config.lowEnergy) this.enter('break', nowMs);
        else if (inSectionMs >= config.dropMs) this.enter('return', nowMs);
        break;
      case 'break':
        if (energy >= config.highEnergy) this.enter('drop', nowMs);
        break;
      case 'return':
        if (energy <= config.lowEnergy) this.enter('break', nowMs);
        else if (this.highEnergyMs >= config.buildMs) this.enter('mutation', nowMs);
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
    this.climbMs = 0;
    this.lastDropMs = -Infinity;
  }

  private enter(section: Section, nowMs: number): void {
    this.section = section;
    this.sectionSinceMs = nowMs;
    this.highEnergyMs = 0;
  }
}
