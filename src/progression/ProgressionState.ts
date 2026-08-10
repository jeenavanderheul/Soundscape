import type { ResonanceEvent } from '../resonance/ResonanceEvent';

/**
 * §17: progression records discovered causal laws — not XP. The world becomes
 * editable as the player demonstrates understanding: after enough discovery
 * the resonance pulse can *create* resonators in empty space (composer reveal).
 */
export interface ProgressionState {
  /** Legacy field (v2 saves); kept for compatibility, unused for unlock. */
  controlsRevealed: number;
  resonanceClassesSeen: string[];
  structuresCreated: number;
  permanentStructures: number;
  genresSeen: string[];
  playerResonatorsCreated: number;
}

export function createInitialProgression(): ProgressionState {
  return {
    controlsRevealed: 0,
    resonanceClassesSeen: [],
    structuresCreated: 0,
    permanentStructures: 0,
    genresSeen: [],
    playerResonatorsCreated: 0,
  };
}

export function recordResonance(state: ProgressionState, event: ResonanceEvent): ProgressionState {
  if (state.resonanceClassesSeen.includes(event.classification)) return state;
  return {
    ...state,
    resonanceClassesSeen: [...state.resonanceClassesSeen, event.classification],
  };
}

export function recordStructure(state: ProgressionState, persistence: number): ProgressionState {
  const permanent = persistence >= 1 ? 1 : 0;
  return {
    ...state,
    structuresCreated: state.structuresCreated + 1,
    permanentStructures: state.permanentStructures + permanent,
  };
}

export function recordGenre(state: ProgressionState, dominant: string | null): ProgressionState {
  if (dominant === null || state.genresSeen.includes(dominant)) return state;
  return { ...state, genresSeen: [...state.genresSeen, dominant] };
}

export function recordPlayerResonator(state: ProgressionState): ProgressionState {
  return { ...state, playerResonatorsCreated: state.playerResonatorsCreated + 1 };
}

/**
 * The reveal follows demonstrated causal understanding (§17, §20 M7+):
 * multiple resonance classes heard, form made and a genre discovered.
 */
export function isComposerUnlocked(state: ProgressionState): boolean {
  return (
    state.resonanceClassesSeen.length >= 3 &&
    state.structuresCreated >= 1 &&
    state.genresSeen.length >= 1
  );
}
