import { applyAudibilityFloor } from './AudibilityFloor';
import {
  createEmptyLayerGraph,
  type LayerName,
  type MusicalLayerGraph,
  type PrimitiveKind,
} from './MusicalPrimitives';
import type { Performance } from '../music/Performance';
import { LEVEL_DEEP, type TrackState } from '../music/TrackState';

/**
 * §111 PRESET WORLDS — four more documents, one engine.
 *
 * §110 established that a world written as a document must BE that document:
 * its masks are the arrangement, nothing else decides presence, and the
 * overlay can therefore show the code one for one because it is the code that
 * is playing. LOCKED GROOVE proved it. These four follow the same rule.
 *
 * What is shared is only the machinery — the live ALT/WIND/EDGE, the
 * earned-gating, the trim. Everything that makes a world sound like itself
 * lives in its own spec below, in the notation it was written in.
 */

/** The seven rungs, in the vocabulary the ladder speaks. */
export type Role = 'hats' | 'kick' | 'snare' | 'bass' | 'harmony' | 'melody' | 'texture';

export interface PresetVals {
  ALT: number;
  WIND: number;
  EDGE: number;
}

export interface PresetPart {
  id: string;
  kind: PrimitiveKind;
  layer: LayerName;
  role: Role;
  /** Earned only once its rung has grown deep (§78). */
  deep: boolean;
  /** The document's own section title, for the score on screen (§110). */
  section: string;
  gain: (v: PresetVals) => number;
  code: (v: PresetVals, gain: string) => string;
}

export interface PresetWorld {
  /** `setcpm((base + ALT * lift) / 4)` exactly as the document writes it. */
  bpmBase: number;
  bpmLift: number;
  parts: readonly PresetPart[];
}

export interface PresetControls {
  track?: Readonly<TrackState>;
  motion?: number;
  performance?: Readonly<Performance>;
  energy?: number;
  mix?: Partial<Record<LayerName, number>>;
  /** Defaults the document carries, used when there is no flight (the lab). */
  defaults?: PresetVals;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const g3 = (v: number): string => String(Number(v.toFixed(3)));
/** §11: eight steps, or a drifting number re-evaluates the pattern each frame. */
const step8 = (v: number): number => Math.round(clamp01(v) * 8) / 8;

function has(track: Readonly<TrackState> | undefined, role: Role, deep: boolean): boolean {
  if (!track) return true;
  const state =
    role === 'hats' ? track.drums.hats
    : role === 'kick' ? track.drums.kick
    : role === 'snare' ? track.drums.snare
    : role === 'bass' ? track.bass
    : role === 'harmony' ? track.harmony
    : role === 'melody' ? track.melody
    : track.texture;
  if (!state.unlocked) return false;
  return deep ? state.level >= LEVEL_DEEP : true;
}

export function buildPresetGraph(
  world: PresetWorld,
  controls: PresetControls = {},
): MusicalLayerGraph {
  const track = controls.track;
  const motion = step8(controls.motion ?? 1);
  const perf = controls.performance;
  const fallback = controls.defaults ?? { ALT: 0.6, WIND: 0.85, EDGE: 0.7 };
  const v: PresetVals = {
    ALT: perf ? step8(1 - perf.weight) : fallback.ALT,
    WIND: perf ? step8((perf.push - 0.75) / 0.45) : fallback.WIND,
    EDGE: step8(controls.energy ?? fallback.EDGE),
  };
  const graph = createEmptyLayerGraph(Math.round(world.bpmBase + v.ALT * world.bpmLift));

  for (const part of world.parts) {
    // The AIR of a world is never earned (§94); everything else waits.
    const earned = part.layer === 'atmosphere' || has(track, part.role, part.deep);
    if (!earned) continue;
    const trim = Math.max(0, controls.mix?.[part.layer] ?? 1);
    const level = part.gain(v) * motion * trim;
    if (level <= 0) continue;
    graph.layers[part.layer].primitives.push({
      id: part.id,
      kind: part.kind,
      layer: part.layer,
      parameters: { code: part.code(v, g3(level)), section: part.section },
      allowedTransforms: [],
    });
  }
  // §127: nothing you earned may sit under the threshold of noticing.
  return applyAudibilityFloor(graph);
}

