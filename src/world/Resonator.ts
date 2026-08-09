import type { Vec3Data, Waveform } from '../player/FrequencyState';

/** Serializable resonator data, spec §7. Audio/visual runtime lives outside stores. */
export interface ResonatorData {
  id: string;
  position: Vec3Data;
  baseHz: number;
  waveform: Waveform;
  amplitude: number;
  interactionRadius: number;
  audibleRadius: number;
  persistenceThreshold: number;
  materialProfile: string;
  spatialProfile: string;
  active: boolean;
}

/** Validates and returns a defensive copy so callers cannot alias mutable input. */
export function createResonator(data: ResonatorData): ResonatorData {
  if (!(data.baseHz > 0)) throw new Error(`Resonator ${data.id}: baseHz must be > 0`);
  if (data.amplitude < 0 || data.amplitude > 1) {
    throw new Error(`Resonator ${data.id}: amplitude must be within 0..1`);
  }
  if (!(data.interactionRadius > 0)) {
    throw new Error(`Resonator ${data.id}: interactionRadius must be > 0`);
  }
  if (!(data.audibleRadius > 0)) throw new Error(`Resonator ${data.id}: audibleRadius must be > 0`);
  return { ...data, position: { ...data.position } };
}

/**
 * The single M1 resonator: a gentle sine ~330 Hz roughly 40 units from spawn,
 * audible faintly from the origin so it pulls the player by curiosity (spec §20 M1 gate).
 */
export function createFirstResonator(): ResonatorData {
  return createResonator({
    id: 'resonator-first',
    position: { x: 28, y: 4, z: -28 }, // ~39.8 units from spawn
    baseHz: 330,
    waveform: 'sine',
    amplitude: 0.5,
    interactionRadius: 6,
    audibleRadius: 160,
    persistenceThreshold: 4,
    materialProfile: 'glass',
    spatialProfile: 'omni',
    active: true,
  });
}
