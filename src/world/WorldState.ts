import { createRng } from '../core/rng';
import { createStore } from '../core/stores';
import type { Store } from '../core/stores';
import type { ResonatorData } from './Resonator';
import { createInitialResonators } from './resonators';

/** Serializable world slice (spec §6, §16). No Three.js objects or AudioNodes. */
export interface WorldState {
  resonators: ResonatorData[];
}

/** M2 (spec §7): three seeded resonators with clearly different frequency, timbre and location. */
export function createInitialWorldState(seed: string): WorldState {
  return { resonators: createInitialResonators(createRng(seed)) };
}

export function createWorldStore(seed: string): Store<WorldState> {
  return createStore(createInitialWorldState(seed));
}
