import type { EventBus } from '../core/EventBus';
import { createRng } from '../core/rng';
import type { Store } from '../core/stores';
import type { ResonanceEvent } from '../resonance/ResonanceEvent';
import type { ResonatorData } from './Resonator';
import {
  consonanceToStability,
  hzToDetail,
  hzToScale,
  materialProfileForWaveform,
  StructureData,
} from './StructureData';

/** Typed bus events for form emergence (spec §20 M3). */
export type StructureEvents = {
  'structure:spawned': StructureData;
  'structure:updated': StructureData;
  'structure:removed': StructureData;
};

/** The serializable store slice FormEmergence writes into (spec §6, §18). */
export interface StructuresSlice {
  structures: StructureData[];
}

export interface FormEmergenceConfig {
  /** Max seeded offset per axis from the interaction site, world units. */
  spawnOffsetUnits: number;
  /** Fraction of the hz scale cap a structure is born at. */
  initialScaleFraction: number;
  /** Asymptotic growth rate toward the scale cap while resonance continues. */
  growthRatePerSec: number;
  /** Sustained seconds mapping structure persistence 0 → 1 (§3.8 duration bands). */
  permanenceSeconds: number;
  /** Structures below this persistence decay once resonance releases. */
  persistenceFloor: number;
  /** Only structures younger than this decay away entirely. */
  youngAgeMs: number;
  /** Persistence lost per second while decaying. */
  decayPerSec: number;
  /** Persistence at which a structure becomes permanent (§3.8). */
  permanenceThreshold: number;
  /** Stability cap for structures born from dissonant resonance (§3.6). */
  unstableStabilityMax: number;
  /** Events below this strength (after engagement) end growth — engine exits. */
  releaseStrength: number;
  /** Bounded structure count (§22: no monotonic growth). */
  maxStructures: number;
  /** Clamp on a single tick delta so a resumed tab cannot jump growth (§15). */
  maxTickDeltaMs: number;
}

export const FORM_EMERGENCE_CONFIG: FormEmergenceConfig = {
  spawnOffsetUnits: 3,
  initialScaleFraction: 0.3,
  growthRatePerSec: 0.35,
  permanenceSeconds: 20,
  persistenceFloor: 0.3,
  youngAgeMs: 30_000,
  decayPerSec: 0.06,
  permanenceThreshold: 0.85,
  unstableStabilityMax: 0.3,
  releaseStrength: 0.06,
  maxStructures: 64,
  maxTickDeltaMs: 100,
};

/** Past the permanence threshold a structure never decays and resists eviction. */
export function isPermanent(
  structure: StructureData,
  config: FormEmergenceConfig = FORM_EMERGENCE_CONFIG,
): boolean {
  return structure.persistence >= config.permanenceThreshold;
}

/** Snap-to-cap tolerance so asymptotic growth settles instead of updating forever. */
const SCALE_SNAP_FRACTION = 0.001;

/**
 * M3 (spec §20): stable resonance becomes persistent geometry. Runs in the
 * lower-frequency logic loop via tick(); consumes the ResonanceEvents emitted
 * since the last tick plus the resonator list, and writes serializable
 * StructureData into the store. Deterministic given identical inputs — all
 * randomness comes from the world seed (§25.16).
 *
 * Rules:
 * - a ResonanceEvent whose persistence crosses the resonator's
 *   persistenceThreshold spawns one structure near the interaction site
 *   (sustained resonance happens inside the resonator's interaction radius,
 *   so its position stands in for the interaction midpoint; tick receives no
 *   player position — positions resolve from stores, §16);
 * - continued resonance grows persistence and scale toward hard caps
 *   (threshold bands, no unlimited growth, §5);
 * - dissonant sustained resonance spawns unstable (low-stability) form;
 * - released structures below the persistence floor AND still young decay
 *   and are removed;
 * - past the permanence threshold structures are permanent;
 * - the store is bounded: oldest non-permanent structures are evicted first.
 */
export class FormEmergence {
  /** Resonator ids whose resonance is currently sustaining growth. */
  private readonly growing = new Set<string>();
  /** Per-resonator spawn counters for deterministic structure ids. */
  private readonly spawnCounts = new Map<string, number>();
  private lastTickMs: number | null = null;

  constructor(
    private readonly bus: EventBus<StructureEvents>,
    private readonly store: Store<StructuresSlice>,
    private readonly worldSeed: string,
    private readonly config: FormEmergenceConfig = FORM_EMERGENCE_CONFIG,
  ) {}

  /**
   * §18 reload: resume spawn counters from loaded structure ids so post-load
   * spawns never reuse the id (and thus seed) of a previously saved structure.
   */
  rehydrate(structures: readonly StructureData[]): void {
    for (const structure of structures) {
      const match = /^structure-(.+)-(\d+)$/.exec(structure.id);
      if (!match) continue;
      const resonatorId = match[1]!;
      const count = Number(match[2]);
      if (count > (this.spawnCounts.get(resonatorId) ?? 0)) {
        this.spawnCounts.set(resonatorId, count);
      }
    }
  }

  tick(
    nowMs: number,
    recentEvents: readonly ResonanceEvent[],
    resonators: readonly ResonatorData[],
  ): void {
    const rawDelta = this.lastTickMs === null ? 0 : nowMs - this.lastTickMs;
    const deltaSec = Math.min(Math.max(rawDelta, 0), this.config.maxTickDeltaMs) / 1000;
    this.lastTickMs = nowMs;

    const resonatorById = new Map(resonators.map((r) => [r.id, r]));
    for (const id of this.growing) {
      if (!resonatorById.has(id)) this.growing.delete(id);
    }

    const current = this.store.getState().structures;
    const withStructure = new Set(current.map((s) => s.sourceResonatorId));

    // 1. Classify this tick's events into growth starts/stops and spawns.
    const spawns: StructureData[] = [];
    for (const event of recentEvents) {
      const resonator = resonatorById.get(event.targetId);
      if (!resonator) continue;
      // Engine exit events carry low strength after engagement: release growth.
      if (event.persistence > 0 && event.strength < this.config.releaseStrength) {
        this.growing.delete(resonator.id);
        continue;
      }
      if (event.persistence >= resonator.persistenceThreshold) {
        this.growing.add(resonator.id);
        if (!withStructure.has(resonator.id)) {
          withStructure.add(resonator.id);
          spawns.push(this.createStructure(nowMs, event, resonator));
        }
      }
    }

    // 2. Grow sustained structures; decay released young ones below the floor.
    const kept: StructureData[] = [];
    const updated: StructureData[] = [];
    const removed: StructureData[] = [];
    for (const structure of current) {
      const next = this.growing.has(structure.sourceResonatorId)
        ? this.grow(structure, deltaSec)
        : this.decay(structure, nowMs, deltaSec);
      if (next === null) {
        removed.push(structure);
        continue;
      }
      if (next !== structure) updated.push(next);
      kept.push(next);
    }

    // 3. Add spawns under the bounded count: evict oldest non-permanent first;
    //    if everything is permanent, the spawn is skipped (§22 bounds).
    const spawned: StructureData[] = [];
    for (const spawn of spawns) {
      if (kept.length >= this.config.maxStructures) {
        const victim = this.oldestNonPermanentIndex(kept);
        if (victim === -1) continue;
        removed.push(...kept.splice(victim, 1));
      }
      kept.push(spawn);
      spawned.push(spawn);
    }

    if (spawned.length === 0 && updated.length === 0 && removed.length === 0) return;

    this.store.setState((state) => ({ ...state, structures: kept }));
    for (const s of removed) this.bus.emit('structure:removed', s);
    for (const s of updated) this.bus.emit('structure:updated', s);
    for (const s of spawned) this.bus.emit('structure:spawned', s);
  }

  private createStructure(
    nowMs: number,
    event: ResonanceEvent,
    resonator: ResonatorData,
  ): StructureData {
    const count = (this.spawnCounts.get(resonator.id) ?? 0) + 1;
    this.spawnCounts.set(resonator.id, count);
    const id = `structure-${resonator.id}-${count}`;
    const seed = `${this.worldSeed}:${id}`;
    const rng = createRng(seed);
    const offset = (): number => (rng.next() * 2 - 1) * this.config.spawnOffsetUnits;

    // The player's sustained frequency shapes the form (§3.1): legible causality.
    const hz = event.sourceHz;
    const waveform = event.sourceWaveform;
    const stability = consonanceToStability(event.consonance);
    return {
      id,
      createdAtMs: nowMs,
      position: {
        x: resonator.position.x + offset(),
        y: resonator.position.y + offset(),
        z: resonator.position.z + offset(),
      },
      sourceResonatorId: resonator.id,
      hz,
      waveform,
      scale: hzToScale(hz) * this.config.initialScaleFraction,
      detailLevel: hzToDetail(hz),
      stability:
        event.classification === 'dissonant'
          ? Math.min(stability, this.config.unstableStabilityMax)
          : stability,
      persistence: Math.min(1, event.persistence / this.config.permanenceSeconds),
      seed,
      materialProfile: materialProfileForWaveform(waveform),
    };
  }

  /** Sustained resonance: persistence and scale approach their caps, never exceed them. */
  private grow(structure: StructureData, deltaSec: number): StructureData {
    if (deltaSec <= 0) return structure;
    const persistence = Math.min(
      1,
      structure.persistence + deltaSec / this.config.permanenceSeconds,
    );
    const cap = hzToScale(structure.hz);
    let scale = Math.min(
      cap,
      structure.scale + (cap - structure.scale) * Math.min(1, this.config.growthRatePerSec * deltaSec),
    );
    if (cap - scale < cap * SCALE_SNAP_FRACTION) scale = cap;
    if (persistence === structure.persistence && scale === structure.scale) return structure;
    return { ...structure, persistence, scale };
  }

  /** Released structures below the floor AND still young fade; null means removed. */
  private decay(
    structure: StructureData,
    nowMs: number,
    deltaSec: number,
  ): StructureData | null {
    if (deltaSec <= 0) return structure;
    if (isPermanent(structure, this.config)) return structure;
    if (structure.persistence >= this.config.persistenceFloor) return structure;
    if (nowMs - structure.createdAtMs >= this.config.youngAgeMs) return structure;
    const persistence = structure.persistence - this.config.decayPerSec * deltaSec;
    if (persistence <= 0) return null;
    return { ...structure, persistence };
  }

  private oldestNonPermanentIndex(structures: readonly StructureData[]): number {
    let index = -1;
    let oldestMs = Infinity;
    for (let i = 0; i < structures.length; i++) {
      const structure = structures[i];
      if (!structure || isPermanent(structure, this.config)) continue;
      if (structure.createdAtMs < oldestMs) {
        oldestMs = structure.createdAtMs;
        index = i;
      }
    }
    return index;
  }
}
