import { createStore } from '../core/stores';
import type { Store } from '../core/stores';
import { createFirstResonator } from './Resonator';
import type { ResonatorData } from './Resonator';

/** Serializable world slice (spec §6, §16). No Three.js objects or AudioNodes. */
export interface WorldState {
  resonators: ResonatorData[];
}

export function createInitialWorldState(): WorldState {
  return { resonators: [createFirstResonator()] };
}

export function createWorldStore(): Store<WorldState> {
  return createStore(createInitialWorldState());
}
