import { buildSubPressureGraph } from '../lab/SubPressure';
import type { GenreAffinity, MusicState } from '../music/MusicState';
import type { TrackState } from '../music/TrackState';
import {
  buildLayerGraph,
  genreGrammar,
  type LayerPatterns,
  type MusicalLayerGraph,
  type StructureVoiceSource,
} from './MusicalPrimitives';

export interface WorldLayerGraphInput {
  music: MusicState;
  affinity?: GenreAffinity | undefined;
  structures?: readonly StructureVoiceSource[] | undefined;
  track: TrackState;
  patterns?: LayerPatterns | undefined;
  motion?: number | undefined;
  energy?: number | undefined;
}

export function buildWorldLayerGraph(input: WorldLayerGraphInput): MusicalLayerGraph {
  if (input.track.genre === 'sub-pressure') {
    return buildSubPressureGraph({
      track: input.track,
      ...(input.motion === undefined ? {} : { motion: input.motion }),
    });
  }
  return buildLayerGraph(
    input.music,
    input.affinity,
    input.structures,
    input.track,
    input.patterns,
    input.motion,
    input.energy,
  );
}

export function worldBankLabel(track: Readonly<TrackState>): string {
  return track.genre === 'sub-pressure'
    ? 'EmuSP12 / AkaiMPC60'
    : genreGrammar(track.genre).drumBank;
}
