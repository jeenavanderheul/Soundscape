import { createRng } from '../core/rng';
import { createStore } from '../core/stores';
import type { Store } from '../core/stores';
import type { ResonatorData } from './Resonator';
import { createInitialResonators } from './resonators';
import type { StructureData } from './StructureData';

/** Serializable world slice (spec §6, §16). No Three.js objects or AudioNodes. */
export interface WorldState {
  resonators: ResonatorData[];
  /** M3 (§20): persistent forms born from stable resonance. */
  structures: StructureData[];
}

/** M2 (spec §7): three seeded resonators with clearly different frequency, timbre and location. */
export function createInitialWorldState(seed: string): WorldState {
  return { resonators: createInitialResonators(createRng(seed)), structures: [] };
}

export function createWorldStore(seed: string): Store<WorldState> {
  return createStore(createInitialWorldState(seed));
}
