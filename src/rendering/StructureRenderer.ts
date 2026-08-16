import { BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import { createRng } from '../core/rng';
import { FORM_EMERGENCE_CONFIG } from '../world/FormEmergence';
import type { StructureEvents } from '../world/FormEmergence';
import { createStructureMaterial } from './Materials';
import { buildStructureGeometry, type StructureData } from './structureGeometry';

export type { StructureEvents };

/**
 * M3 form emergence rendering (§3, §13, §20 M3): turns structure bus events
 * into persistent monochrome wireframe geometry. Rendering owns the Three.js
 * runtime objects; the serializable StructureData stays in the world stores.
 */

export const STRUCTURE_RENDER_CONFIG = {
  /** Bounded mesh pool, matching the world-side structure bound (§22). */
  maxStructures: FORM_EMERGENCE_CONFIG.maxStructures,
  /** Smooth scale-in on spawn — form emerges, never pops (§23). */
  spawnSeconds: 1.2,
  /** Eased approach rate toward the world-driven growth scale (§3.8). */
  growthEasePerSecond: 2,
  /** Emissive brightness range: young faint → permanent solid (§3.8). */
  minLevel: 0.18,
  maxLevel: 0.95,
  baseGrey: 0.85,
  /** Faint red state cue on unstable form (§3.6, §13 small accents only). */
  unstableAccentMix: 0.15,
  /** Positional jitter of unstable structures, world units × (1 - stability). */
  jitterAmplitude: 0.12,
  /** Slow wobble band — subtle drift, no strobing (§23). */
  minJitterHz: 0.4,
  maxJitterHz: 1.3,
  instabilityThreshold: 0.5,
  /** §9.1 LOCKED GROOVE world tendency: grid cell size structures organize onto. */
  gridCell: 8,
} as const;

/** Nearest grid line for the LOCKED GROOVE organization lerp (§9.1). */
export function gridSnap(value: number, cell: number = STRUCTURE_RENDER_CONFIG.gridCell): number {
  return Math.round(value / cell) * cell;
}

interface StructureBusLike {
  on<K extends keyof StructureEvents>(
    event: K,
    handler: (payload: StructureEvents[K]) => void,
  ): () => void;
}

interface Entry {
  id: string;
  mesh: Mesh;
  colors: BufferAttribute;
  ageSeconds: number;
  stability: number;
  persistence: number;
  /** World scale the geometry was built at; growth is a mesh-scale factor. */
  builtScale: number;
  scaleFactor: number;
  targetScaleFactor: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  jitterPhaseX: number;
  jitterPhaseY: number;
  jitterPhaseZ: number;
  jitterHz: number;
}

export class StructureRenderer {
  readonly group = new Group();
  private readonly material: MeshBasicMaterial = createStructureMaterial();
  /** Flat array (not a Map) so update(dt) iterates without allocating. */
  private readonly entries: Entry[] = [];

  /** Beat/onset modulation from BeatSync — already depth-capped (§23).
   * Shared material color multiplies the per-vertex persistence colors. */
  setPulse(value: number): void {
    this.material.color.setScalar(1 + value);
  }

  /** §9.1: chaos organizes into grid. 0 = free placement, 1 = full grid pull. */
  private organization = 0;

  setOrganization(amount: number): void {
    this.organization = Math.min(1, Math.max(0, amount));
  }

  /** §9.5 Experimental world tendency: mutation destabilizes ALL structures. */
  private mutation = 0;

  setMutation(amount: number): void {
    this.mutation = Math.min(1, Math.max(0, amount));
  }

  get count(): number {
    return this.entries.length;
  }

  has(id: string): boolean {
    return this.indexOf(id) !== -1;
  }

  /** Wire to the structure bus; returns a detach that removes all handlers. */
  subscribe(bus: StructureBusLike): () => void {
    const offs = [
      bus.on('structure:spawned', this.handleSpawned),
      bus.on('structure:updated', this.handleUpdated),
      bus.on('structure:removed', this.handleRemoved),
    ];
    return () => {
      for (const off of offs) off();
    };
  }

  readonly handleSpawned = (data: StructureData): void => {
    const existing = this.indexOf(data.id);
    if (existing !== -1) this.removeAt(existing);
    if (this.entries.length >= STRUCTURE_RENDER_CONFIG.maxStructures) this.evict();

    const rng = createRng(data.seed);
    const geometry = buildStructureGeometry(data, rng);
    const vertexCount = geometry.getAttribute('position')!.count;
    const colors = new BufferAttribute(new Float32Array(vertexCount * 3), 3);
    geometry.setAttribute('color', colors);

    const mesh = new Mesh(geometry, this.material);
    mesh.position.set(data.position.x, data.position.y, data.position.z);
    mesh.scale.setScalar(0); // scale-in starts from nothing (§23: no pop)
    this.group.add(mesh);

    const cfg = STRUCTURE_RENDER_CONFIG;
    const entry: Entry = {
      id: data.id,
      mesh,
      colors,
      ageSeconds: 0,
      stability: data.stability,
      persistence: data.persistence,
      builtScale: Math.max(data.scale, 0.05),
      scaleFactor: 1,
      targetScaleFactor: 1,
      baseX: data.position.x,
      baseY: data.position.y,
      baseZ: data.position.z,
      jitterPhaseX: rng.next() * Math.PI * 2,
      jitterPhaseY: rng.next() * Math.PI * 2,
      jitterPhaseZ: rng.next() * Math.PI * 2,
      jitterHz: cfg.minJitterHz + rng.next() * (cfg.maxJitterHz - cfg.minJitterHz),
    };
    this.entries.push(entry);
    this.applyLevel(entry);
  };

  /** Event-driven: growth/persistence changes never rebuild geometry (§25.8). */
  readonly handleUpdated = (data: StructureData): void => {
    const index = this.indexOf(data.id);
    if (index === -1) {
      this.handleSpawned(data);
      return;
    }
    const entry = this.entries[index]!;
    entry.persistence = data.persistence;
    entry.stability = data.stability;
    entry.targetScaleFactor = Math.max(data.scale, 0.05) / entry.builtScale;
    this.applyLevel(entry);
  };

  readonly handleRemoved = ({ id }: { id: string }): void => {
    const index = this.indexOf(id);
    if (index !== -1) this.removeAt(index);
  };

  /** Zero allocations after warm-up: plain loop, in-place vector math only. */
  update(dtSeconds: number): void {
    const cfg = STRUCTURE_RENDER_CONFIG;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i]!;
      entry.ageSeconds += dtSeconds;
      const t = Math.min(entry.ageSeconds / cfg.spawnSeconds, 1);
      const spawnEase = t * t * (3 - 2 * t); // smoothstep scale-in
      // Ease toward the world-driven growth target — growth reads as continuous.
      const blend = Math.min(dtSeconds * cfg.growthEasePerSecond, 1);
      entry.scaleFactor += (entry.targetScaleFactor - entry.scaleFactor) * blend;
      entry.mesh.scale.setScalar(spawnEase * entry.scaleFactor);

      // §9.1 LOCKED GROOVE organization: lerp the resting position toward the grid.
      const org = this.organization;
      const ox = entry.baseX + (gridSnap(entry.baseX) - entry.baseX) * org;
      const oy = entry.baseY + (gridSnap(entry.baseY) - entry.baseY) * org;
      const oz = entry.baseZ + (gridSnap(entry.baseZ) - entry.baseZ) * org;
      const unstable = entry.stability < cfg.instabilityThreshold || this.mutation > 0;
      if (unstable) {
        const amp = cfg.jitterAmplitude * Math.max(1 - entry.stability, this.mutation);
        const w = entry.ageSeconds * entry.jitterHz * Math.PI * 2;
        entry.mesh.position.set(
          ox + Math.sin(w + entry.jitterPhaseX) * amp,
          oy + Math.sin(w * 1.31 + entry.jitterPhaseY) * amp,
          oz + Math.sin(w * 0.79 + entry.jitterPhaseZ) * amp,
        );
      } else {
        entry.mesh.position.set(ox, oy, oz);
      }
    }
  }

  dispose(): void {
    while (this.entries.length > 0) this.removeAt(this.entries.length - 1);
    this.material.dispose();
  }

  /** Brightness from persistence: young faint, permanent solid (§3.8). */
  private applyLevel(entry: Entry): void {
    const cfg = STRUCTURE_RENDER_CONFIG;
    const persistence = Math.min(Math.max(entry.persistence, 0), 1);
    const level = cfg.minLevel + (cfg.maxLevel - cfg.minLevel) * persistence;
    const unstable = entry.stability < cfg.instabilityThreshold;
    const mix = unstable ? cfg.unstableAccentMix : 0;
    const grey = cfg.baseGrey;
    const r = (grey * (1 - mix) + mix) * level; // faint red bias when unstable
    const g = grey * (1 - mix) * level;
    const b = grey * (1 - mix) * level;
    const array = entry.colors.array as Float32Array;
    for (let i = 0; i < array.length; i += 3) {
      array[i] = r;
      array[i + 1] = g;
      array[i + 2] = b;
    }
    entry.colors.needsUpdate = true;
  }

  private indexOf(id: string): number {
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i]!.id === id) return i;
    }
    return -1;
  }

  /** Safety net if the world bound ever races ahead: drop the least persistent. */
  private evict(): void {
    let lowest = 0;
    for (let i = 1; i < this.entries.length; i++) {
      if (this.entries[i]!.persistence < this.entries[lowest]!.persistence) lowest = i;
    }
    this.removeAt(lowest);
  }

  private removeAt(index: number): void {
    const entry = this.entries[index]!;
    this.group.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    this.entries.splice(index, 1);
  }
}
