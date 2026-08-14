import { buildSubPressureGraph } from '../lab/SubPressure';
import { buildTechnoGraph } from './TechnoPreset';
import type { GenreAffinity, MusicState } from '../music/MusicState';
import type { Performance } from '../music/Performance';
import type { TrackState } from '../music/TrackState';
import {
  buildLayerGraph,
  genreGrammar,
  type LayerName,
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
  /**
   * §81: how the world is being flown, so a grammar that shapes itself from
   * height and wind can see it. The caller still assigns it to the finished
   * graph — this is the copy the builder reads.
   */
  performance?: Readonly<Performance> | undefined;
  /** The genre lab's per-layer trim. The game never sets it. */
  mix?: Partial<Record<LayerName, number>> | undefined;
}

/** §110: worlds written as a document arrange themselves; the arc must not. */
export function isPresetWorld(genre: MusicalLayerGraph extends never ? never : TrackState['genre']): boolean {
  return genre === 'techno' || genre === 'sub-pressure';
}

export function buildWorldLayerGraph(input: WorldLayerGraphInput): MusicalLayerGraph {
  if (input.track.genre === 'techno') {
    // §110: this world IS the MACHINE PRESSURE document — its own masks are
    // the arrangement, so nothing else may decide what is sounding.
    return buildTechnoGraph({
      track: input.track,
      ...(input.motion === undefined ? {} : { motion: input.motion }),
      ...(input.energy === undefined ? {} : { energy: input.energy }),
      ...(input.performance === undefined ? {} : { performance: input.performance }),
      ...(input.mix === undefined ? {} : { mix: input.mix }),
    });
  }
  if (input.track.genre === 'sub-pressure') {
    return buildSubPressureGraph({
      track: input.track,
      ...(input.motion === undefined ? {} : { motion: input.motion }),
      ...(input.energy === undefined ? {} : { energy: input.energy }),
      ...(input.performance === undefined ? {} : { performance: input.performance }),
      ...(input.mix === undefined ? {} : { mix: input.mix }),
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
