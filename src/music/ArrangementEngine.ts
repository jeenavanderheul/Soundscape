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
   * §64: a drop needs something to drop. §92 moved that guarantee into the arc
   * itself — it hands out the rungs, so by PRESSURE there is a floor by
   * construction — and these are kept only as the documented thresholds the
   * arc's own `rungsDueAt('build')` has to stay at or above.
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
  // §92 ENTER BIOME: the air of the world and nothing else. When the first
  // rhythm arrives on cycle 4 it has to be an EVENT, and it cannot be one if
  // a kick was already playing underneath it.
  intro: { drums: 0, bass: 0, harmony: 0, melody: 0, texture: 0, atmosphere: 1 },
  // DISCOVERY I: the first rhythmic layer, alone with the air.
  groove: { drums: 0.85, bass: 0.9, harmony: 0.7, melody: 0.7, texture: 0.6, atmosphere: 0.7 },
  // DISCOVERY II: the kit fills out — kick, snare and percussion together.
  discovery: { drums: 1, bass: 0.9, harmony: 0.75, melody: 0.7, texture: 0.7, atmosphere: 0.6 },
  // §92 PRESSURE: the SUB ARRIVES. This used to be a classic build that took
  // the floor away — which meant the bass you had just earned disappeared and
  // came back two phases later, and the whole thing read as a mess rather
  // than as one track being assembled. Nothing leaves here any more.
  build: { drums: 0.95, bass: 1, harmony: 0.8, melody: 0.8, texture: 0.8, atmosphere: 0.8 },
  // DROP I: the body, the drums and the musical identity, with the air gone.
  drop: { drums: 1, bass: 1, harmony: 0.9, melody: 1, texture: 0.7, atmosphere: 0.3 },
  // DEEP FLIGHT: the first evolution at its fullest.
  deep: { drums: 1, bass: 1, harmony: 1, melody: 1, texture: 0.9, atmosphere: 0.35 },
  // §92 VOID is the ONE place anything is taken away, which is what makes it
  // land. Drums and bass gone; what is left is what you built on top of them.
  break: { drums: 0, bass: 0, harmony: 1, melody: 0.8, texture: 0.9, atmosphere: 1 },
  // DROP II: everything back, and the loudest the track ever gets.
  return: { drums: 1, bass: 1, harmony: 1, melody: 1, texture: 0.9, atmosphere: 0.5 },
  mutation: { drums: 0.8, bass: 0.9, harmony: 0.8, melody: 1, texture: 1, atmosphere: 0.9 },
};

/**
 * §92: how many rungs of the world's ladder are DUE by each phase — the
 * cumulative count, so the build-up is the same shape every flight.
 *
 * The ladder used to run on its own clock while the arc ran on another, so a
 * bass could arrive during DISCOVERY and a kick during PRESSURE: two systems
 * deciding what plays, neither aware of the other. The arc decides now. What
 * behaviour and beacons still do is let you take a rung the MOMENT its phase
 * opens instead of waiting out the phase — they buy time, never order.
 */
const RUNGS_DUE: Record<Section, number> = {
  none: 0,
  intro: 0,      // ENTER BIOME — the air only
  groove: 1,     // DISCOVERY I — the first rhythmic layer
  discovery: 3,  // DISCOVERY II — the kit fills out
  build: 4,      // PRESSURE — the sub arrives
  drop: 6,       // DROP I — the body and the identity
  deep: 7,       // DEEP FLIGHT — everything the track has
  break: 7,
  return: 7,
  mutation: 7,
};

export function rungsDueAt(section: Section): number {
  return RUNGS_DUE[section];
}

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
  // Ambient and Breakbeat: nothing is taken away, everything is opened up.
  swell: {
    build: { drums: 0.7, bass: 1, harmony: 1, melody: 0.9, texture: 1, atmosphere: 1 },
    drop: { drums: 0.7, bass: 0.9, harmony: 1, melody: 1, texture: 0.9, atmosphere: 0.9 },
    break: { drums: 0.2, bass: 0.5, harmony: 1, melody: 0.6, texture: 1, atmosphere: 1 },
  },
  // Jazz: the band plays louder and busier, it does not filter itself.
  dynamic: {
    build: { drums: 0.9, bass: 1, harmony: 1, melody: 1, texture: 0.7, atmosphere: 0.5 },
    drop: { drums: 1, bass: 0.95, harmony: 1, melody: 1, texture: 0.5, atmosphere: 0.3 },
    break: { drums: 0.4, bass: 0.7, harmony: 0.9, melody: 0.5, texture: 0.6, atmosphere: 0.8 },
  },
  // Dub: the build empties the room, the drop is the bass and the skank
  // walking back in while the echo is still talking.
  echo: {
    build: { drums: 0.6, bass: 1, harmony: 0.8, melody: 0.7, texture: 0.9, atmosphere: 1 },
    drop: { drums: 0.9, bass: 1, harmony: 0.9, melody: 0.6, texture: 0.7, atmosphere: 0.7 },
    break: { drums: 0.25, bass: 0.35, harmony: 1, melody: 0.9, texture: 1, atmosphere: 1 },
  },
  // Experimental: it drops by removing what you expected to stay.
  mutant: {
    build: { drums: 1, bass: 1, harmony: 0.6, melody: 0.9, texture: 1, atmosphere: 0.8 },
    drop: { drums: 0.8, bass: 1, harmony: 0.4, melody: 1, texture: 1, atmosphere: 0.2 },
    break: { drums: 0.6, bass: 0.3, harmony: 1, melody: 0.4, texture: 1, atmosphere: 0.9 },
  },
};

/**
 * §84 THE FLIGHT ARC — thirty-two cycles that ARE the flight.
 *
 * The arrangement used to be a state machine reacting to energy, which meant
 * a player could never learn the shape of a track: the same flight produced a
 * different form every time and nothing ever paid off. The arc is the shape,
 * and it is the same shape every time, so it can be recognized — eight phases
 * of four cycles, walked on the PACED clock, so flying harder carries you
 * through the production faster instead of changing what the production is.
 *
 *   00–03 ENTER BIOME   atmosphere
 *   04–07 DISCOVERY I   the first rhythmic layer
 *   08–11 DISCOVERY II  kick, snare, percussion
 *   12–15 PRESSURE      the sub arrives; a riser on the last cycle
 *   16–19 DROP I        bass body, drums, the musical identity
 *   20–23 DEEP FLIGHT   Reese, acid, signal — the first evolution at full
 *   24–27 VOID          drums and bass gone, atmosphere left standing
 *   28–31 DROP II       everything back, and only here the DEEP layers
 *
 * After DROP II the arc returns to DISCOVERY I: you have already entered the
 * biome, so a second lap is a second track being built, not a second arrival.
 */
export const ARC_PHASES = 8;
export const CYCLES_PER_PHASE = 4;

const ARC: readonly Section[] = [
  'intro', 'groove', 'discovery', 'build', 'drop', 'deep', 'break', 'return',
];

/**
 * §61 a phase means something different in each grammar, so a world may fly a
 * different order through it. Ambient has no floor to take away, so its VOID
 * comes before the peak and it ends on the swell rather than on a slam.
 */
const ARC_OVERRIDES: Partial<Record<SectionStyle, readonly Section[]>> = {
  swell: ['intro', 'groove', 'discovery', 'break', 'build', 'drop', 'deep', 'return'],
  // Experimental drops by removing what you expected to stay, so its void
  // lands in the middle of the peak instead of before it.
  mutant: ['intro', 'groove', 'discovery', 'build', 'drop', 'break', 'deep', 'return'],
};

export function arcFor(style: SectionStyle = 'driven'): readonly Section[] {
  return ARC_OVERRIDES[style] ?? ARC;
}

/** The word the player reads for a phase (§83: it must match what sounds). */
const LABELS: Record<Section, string> = {
  none: '',
  intro: 'ENTER BIOME',
  groove: 'DISCOVERY I',
  discovery: 'DISCOVERY II',
  build: 'PRESSURE',
  drop: 'DROP I',
  deep: 'DEEP FLIGHT',
  break: 'VOID',
  return: 'DROP II',
  mutation: 'MUTATION',
};

/**
 * §85: DROP II is the only phase where parts arrive that were impossible
 * before it. Everything else is the same material, mixed differently.
 */
export function isFinale(section: Section): boolean {
  return section === 'return';
}

export function sectionLabel(section: Section): string {
  return LABELS[section];
}

export function sectionMix(section: Section, style: SectionStyle = 'driven'): SectionMix {
  const base = MIXES[section];
  const override = STYLE_OVERRIDES[style][section];
  return override === undefined ? base : { ...base, ...override };
}

export class ArrangementEngine {
  private section: Section = 'none';
  private highEnergyMs = 0;
  /** §84: paced time flown into the arc, in cycles of one bar. */
  private arcMs = 0;
  private style: SectionStyle = 'driven';
  /** Set for one tick when the cycle before a drop begins (§84: the riser). */
  private riserDue = false;

  constructor(private readonly config: ArrangementConfig = ARRANGEMENT_CONFIG) {}

  get current(): Section {
    return this.section;
  }

  /** Which of the thirty-two cycles the flight is in (§84). */
  get cycle(): number {
    return this.cycleAt(this.arcMs);
  }

  /**
   * True on the tick where a riser should be thrown: the last cycle of the
   * phase before a drop, so the lift is heard leading INTO the floor landing
   * rather than on top of it.
   */
  takeRiser(): boolean {
    const due = this.riserDue;
    this.riserDue = false;
    return due;
  }

  /** The arc a world flies depends on what its sections mean (§61). */
  setStyle(style: SectionStyle): void {
    this.style = style;
  }

  private cycleAt(ms: number): number {
    return Math.floor(ms / this.barMs);
  }

  private barMs = 1800;

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
  /**
   * §84: the arc advances on the PACED delta, so speed decides how quickly the
   * flight moves through the production — never what the production is.
   *
   * `ready` is §64: does this track have a floor to take away yet. The arc
   * holds at the end of PRESSURE until it does, because a drop with nothing
   * under it is not a drop; everything before that is discovery and can always
   * be flown. `barMs` is one cycle at the track's current tempo.
   */
  tick(_nowMs: number, deltaMs: number, energy: number, ready = true, barMs?: number): Section {
    const { config } = this;
    if (barMs !== undefined && barMs > 0) this.barMs = barMs;
    if (this.section === 'none') {
      this.arcMs = 0;
      this.enter('intro');
      return this.section;
    }
    this.highEnergyMs = energy >= config.highEnergy ? this.highEnergyMs + deltaMs : 0;

    const arc = arcFor(this.style);
    const phaseMs = this.barMs * CYCLES_PER_PHASE;
    const lapMs = phaseMs * ARC_PHASES;
    const before = this.cycleAt(this.arcMs);
    let next = this.arcMs + Math.max(0, deltaMs);
    // §64: hold at the very end of PRESSURE — the arc waits for the player,
    // it does not skip the payoff.
    const peakStart = arc.indexOf('drop') * phaseMs;
    if (!ready && peakStart >= 0 && next >= peakStart) next = peakStart - 1;
    this.arcMs = next % lapMs;
    // A second lap starts at DISCOVERY I: the biome has already been entered.
    if (next >= lapMs) this.arcMs = phaseMs + (this.arcMs % (lapMs - phaseMs));

    const cycle = this.cycleAt(this.arcMs);
    if (cycle !== before) {
      const nextPhase = arc[Math.floor((cycle + 1) / CYCLES_PER_PHASE) % ARC_PHASES];
      const thisPhase = arc[Math.floor(cycle / CYCLES_PER_PHASE) % ARC_PHASES];
      // The lift belongs to the cycle BEFORE the floor lands.
      if (thisPhase !== nextPhase && (nextPhase === 'drop' || nextPhase === 'return')) {
        this.riserDue = true;
      }
    }

    const phase = arc[Math.floor(cycle / CYCLES_PER_PHASE) % ARC_PHASES] ?? 'groove';
    if (phase !== this.section) this.enter(phase);
    return this.section;
  }

  reset(): void {
    this.section = 'none';
    this.highEnergyMs = 0;
    this.arcMs = 0;
    this.riserDue = false;
  }

  private enter(section: Section): void {
    this.section = section;
    this.highEnergyMs = 0;
  }
}
