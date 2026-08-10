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
  /**
   * §64: a drop needs something to drop. Below this many earned layers — and
   * below `peakMinTrackMs` of track — the arrangement stays in intro, groove
   * and break, because a build takes the FLOOR away and there is no floor yet.
   */
  peakMinLayers: number;
  peakMinTrackMs: number;
  /** How long a drop holds before it settles back into the groove. */
  dropMs: number;
}

export const ARRANGEMENT_CONFIG: ArrangementConfig = {
  minSectionMs: 8000,
  highEnergy: 0.55,
  lowEnergy: 0.2,
  buildMs: 12_000,
  peakMinLayers: 4,
  peakMinTrackMs: 60_000,
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
  intro: { drums: 0.8, bass: 0.6, harmony: 0.55, melody: 0, texture: 0.35, atmosphere: 1 },
  // §60: the sections have to be TOLD APART by ear. Groove is the baseline it
  // all reads against, so it sits deliberately below full.
  groove: { drums: 0.9, bass: 0.85, harmony: 0.7, melody: 0.6, texture: 0.5, atmosphere: 0.7 },
  // A build takes the FLOOR away: the bass all but disappears, the top end
  // pushes, and everything leans forward waiting for the bottom to come back.
  build: { drums: 0.8, bass: 0.28, harmony: 0.9, melody: 0.85, texture: 1, atmosphere: 0.9 },
  // And the drop is that floor slamming back in at full, with the air gone.
  drop: { drums: 1, bass: 1, harmony: 0.85, melody: 1, texture: 0.55, atmosphere: 0.25 },
  // The kick steps aside — but a break is not silence: the percussion and
  // the top end carry it, or the track stops sounding like a track (§32).
  break: { drums: 0.55, bass: 0.5, harmony: 1, melody: 0.8, texture: 0.9, atmosphere: 1 },
  return: { drums: 1, bass: 1, harmony: 0.9, melody: 0.8, texture: 0.7, atmosphere: 0.7 },
  mutation: { drums: 0.8, bass: 0.9, harmony: 0.8, melody: 1, texture: 1, atmosphere: 0.9 },
};

/**
 * §61: a section means something different in each grammar. Techno drops by
 * slamming the floor back in; Ambient has no floor to slam, so it swells and
 * opens instead; Dub drops by letting the echo answer; Jazz plays dynamics,
 * not filters. Same seven sections, five ways of meaning them.
 */
export type SectionStyle = 'driven' | 'swell' | 'dynamic' | 'echo' | 'mutant';

const STYLE_OVERRIDES: Record<SectionStyle, Partial<Record<Section, Partial<SectionMix>>>> = {
  // The classic: the bottom leaves and comes back.
  driven: {},
  // Ambient and Classical: nothing is taken away, everything is opened up.
  swell: {
    build: { drums: 0.5, bass: 0.75, harmony: 1, melody: 0.9, texture: 1, atmosphere: 1 },
    drop: { drums: 0.7, bass: 0.9, harmony: 1, melody: 1, texture: 0.9, atmosphere: 0.9 },
    break: { drums: 0.2, bass: 0.5, harmony: 1, melody: 0.6, texture: 1, atmosphere: 1 },
  },
  // Jazz: the band plays louder and busier, it does not filter itself.
  dynamic: {
    build: { drums: 0.9, bass: 0.8, harmony: 1, melody: 1, texture: 0.7, atmosphere: 0.5 },
    drop: { drums: 1, bass: 0.95, harmony: 1, melody: 1, texture: 0.5, atmosphere: 0.3 },
    break: { drums: 0.4, bass: 0.7, harmony: 0.9, melody: 0.5, texture: 0.6, atmosphere: 0.8 },
  },
  // Dub: the build empties the room, the drop is the bass and the skank
  // walking back in while the echo is still talking.
  echo: {
    build: { drums: 0.35, bass: 0.2, harmony: 0.8, melody: 0.7, texture: 0.9, atmosphere: 1 },
    drop: { drums: 0.9, bass: 1, harmony: 0.9, melody: 0.6, texture: 0.7, atmosphere: 0.7 },
    break: { drums: 0.25, bass: 0.35, harmony: 1, melody: 0.9, texture: 1, atmosphere: 1 },
  },
  // Experimental: it drops by removing what you expected to stay.
  mutant: {
    build: { drums: 1, bass: 0.5, harmony: 0.6, melody: 0.9, texture: 1, atmosphere: 0.8 },
    drop: { drums: 0.8, bass: 1, harmony: 0.4, melody: 1, texture: 1, atmosphere: 0.2 },
    break: { drums: 0.6, bass: 0.3, harmony: 1, melody: 0.4, texture: 1, atmosphere: 0.9 },
  },
};

export function sectionMix(section: Section, style: SectionStyle = 'driven'): SectionMix {
  const base = MIXES[section];
  const override = STYLE_OVERRIDES[style][section];
  return override === undefined ? base : { ...base, ...override };
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
  /**
   * `ready` is §64: does this track have a floor to take away yet. It is the
   * only thing standing between groove and a build.
   */
  tick(nowMs: number, deltaMs: number, energy: number, ready = true): Section {
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
      // §58: energy and time carry the form. Height is pitch and tempo only.
      case 'groove':
        if (ready && this.highEnergyMs >= config.buildMs) this.enter('build', nowMs);
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
