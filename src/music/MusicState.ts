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

export interface GenreAffinity {
  techno: number;
  ambient: number;
  jazz: number;
  dnb: number;
  experimental: number;
}

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
