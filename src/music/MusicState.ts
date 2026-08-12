export type FormPhase =
  | 'void' | 'intro' | 'build' | 'peak'
  | 'break' | 'return' | 'mutation';

export interface MusicState {
  bpm: number;
  tempoConfidence: number;
  pitchCenter: number;
  pitchSpread: number;
  dynamics: number;
  rhythmDensity: number;
  rhythmicRegularity: number;
  syncopation: number;
  durationAverage: number;
  harmonicComplexity: number;
  dissonance: number;
  melodicActivity: number;
  timbreBrightness: number;
  timbreNoise: number;
  meterConfidence: number;
  meter?: string;
  textureDensity: number;
  spatiality: number;
  repetition: number;
  variation: number;
  lowEndEnergy: number;
  transientDensity: number;
  formPhase: FormPhase;
}

/**
 * §34: ten grammars. Eight lie on the compass, two on the vertical axis —
 * experimental above (mutation), dub below (echo).
 */
export interface GenreAffinity {
  techno: number;
  ambient: number;
  jazz: number;
  /** §73: hard rolling bass music — what used to be the drum & bass slot. */
  bass: number;
  garage: number;
  house: number;
  trap: number;
  breakbeat: number;
  dub: number;
  experimental: number;
}

/** Every grammar, in one place (§34) — the list all validation reads from. */
export const GENRE_NAMES: readonly (keyof GenreAffinity)[] = [
  'techno',
  'ambient',
  'jazz',
  'bass',
  'garage',
  'house',
  'trap',
  'breakbeat',
  'dub',
  'experimental',
];

export function createInitialMusicState(): MusicState {
  return {
    bpm: 0,
    tempoConfidence: 0,
    pitchCenter: 220,
    pitchSpread: 0,
    dynamics: 0,
    rhythmDensity: 0,
    rhythmicRegularity: 0,
    syncopation: 0,
    durationAverage: 0,
    harmonicComplexity: 0,
    dissonance: 0,
    melodicActivity: 0,
    timbreBrightness: 0,
    timbreNoise: 0,
    meterConfidence: 0,
    textureDensity: 0,
    spatiality: 0,
    repetition: 0,
    variation: 0,
    lowEndEnergy: 0,
    transientDensity: 0,
    formPhase: 'void',
  };
}
