export type Waveform = 'sine' | 'triangle' | 'square' | 'saw' | 'noise';

export interface Vec3Data {
  x: number;
  y: number;
  z: number;
}

export interface FrequencyState {
  hz: number;
  amplitude: number;
  waveform: Waveform;
  phase: number;
  velocity: number;
  position: Vec3Data;
  direction: Vec3Data;
  resonance: number;
  stability: number;
  energy: number;
}

export function createInitialFrequencyState(): FrequencyState {
  return {
    hz: 220,
    amplitude: 0,
    waveform: 'sine',
    phase: 0,
    velocity: 0,
    position: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 0, z: -1 },
    resonance: 0,
    stability: 0,
    energy: 0,
  };
}
