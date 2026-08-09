import { describe, expect, it } from 'vitest';
import type { Mesh } from 'three';
import { createEventBus } from '../../src/core/EventBus';
import {
  STRUCTURE_RENDER_CONFIG,
  StructureRenderer,
  type StructureEvents,
} from '../../src/rendering/StructureRenderer';
import type { StructureData } from '../../src/rendering/structureGeometry';
import { hzToDetail, hzToScale } from '../../src/world/StructureData';

function makeStructure(overrides: Partial<StructureData> = {}): StructureData {
  const hz = overrides.hz ?? 220;
  return {
    id: 'structure-1',
    createdAtMs: 1000,
    position: { x: 3, y: 1, z: -4 },
    sourceResonatorId: 'resonator-first',
    hz,
    waveform: 'sine',
    scale: hzToScale(hz),
    detailLevel: hzToDetail(hz),
    stability: 1,
    persistence: 0.2,
    seed: 'seed-1',
    materialProfile: 'glass',
    ...overrides,
  };
}

function meshOf(renderer: StructureRenderer, index = 0): Mesh {
  return renderer.group.children[index] as Mesh;
}

describe('StructureRenderer', () => {
  it('spawns a mesh at the structure position and scales in smoothly (no pop)', () => {
    const renderer = new StructureRenderer();
    renderer.handleSpawned(makeStructure());
    expect(renderer.count).toBe(1);
    const mesh = meshOf(renderer);
    expect(mesh.position.x).toBe(3);
    expect(mesh.scale.x).toBe(0);
    renderer.update(STRUCTURE_RENDER_CONFIG.spawnSeconds / 2);
    const midScale = mesh.scale.x;
    expect(midScale).toBeGreaterThan(0);
    expect(midScale).toBeLessThan(1);
    renderer.update(STRUCTURE_RENDER_CONFIG.spawnSeconds);
    expect(mesh.scale.x).toBeCloseTo(1, 5);
    renderer.dispose();
  });

  it('respawning the same id replaces the mesh instead of duplicating it', () => {
    const renderer = new StructureRenderer();
    renderer.handleSpawned(makeStructure());
    renderer.handleSpawned(makeStructure({ hz: 2000, scale: hzToScale(2000) }));
    expect(renderer.count).toBe(1);
    renderer.dispose();
  });

  it('bounds mesh count matching the world-side structure bound', () => {
    const renderer = new StructureRenderer();
    for (let i = 0; i < STRUCTURE_RENDER_CONFIG.maxStructures + 3; i++) {
      renderer.handleSpawned(
        makeStructure({ id: `structure-${i}`, seed: `seed-${i}`, persistence: i * 0.01 }),
      );
    }
    expect(renderer.count).toBe(STRUCTURE_RENDER_CONFIG.maxStructures);
    expect(renderer.has('structure-0')).toBe(false);
    renderer.dispose();
  });

  it('removes structures and frees their slot', () => {
    const renderer = new StructureRenderer();
    renderer.handleSpawned(makeStructure());
    renderer.handleRemoved(makeStructure());
    expect(renderer.count).toBe(0);
    expect(renderer.group.children.length).toBe(0);
    renderer.dispose();
  });

  it('grows the mesh toward the updated world scale without rebuilding geometry', () => {
    const renderer = new StructureRenderer();
    const data = makeStructure();
    renderer.handleSpawned(data);
    const mesh = meshOf(renderer);
    const geometryBefore = mesh.geometry;
    renderer.update(STRUCTURE_RENDER_CONFIG.spawnSeconds * 2);
    expect(mesh.scale.x).toBeCloseTo(1, 5);
    renderer.handleUpdated({ ...data, scale: data.scale * 2 });
    for (let i = 0; i < 60; i++) renderer.update(0.1);
    expect(mesh.scale.x).toBeCloseTo(2, 2);
    expect(mesh.geometry).toBe(geometryBefore);
    renderer.dispose();
  });

  it('unstable structures jitter over time; stable structures hold still', () => {
    const renderer = new StructureRenderer();
    renderer.handleSpawned(makeStructure({ id: 'stable', stability: 0.9 }));
    renderer.handleSpawned(makeStructure({ id: 'shaky', stability: 0.2, seed: 'seed-2' }));
    renderer.update(STRUCTURE_RENDER_CONFIG.spawnSeconds);
    const stable = meshOf(renderer, 0);
    const shaky = meshOf(renderer, 1);
    const stableBefore = stable.position.clone();
    const shakyBefore = shaky.position.clone();
    renderer.update(0.35);
    expect(stable.position.distanceTo(stableBefore)).toBe(0);
    const moved = shaky.position.distanceTo(shakyBefore);
    expect(moved).toBeGreaterThan(0);
    // Subtle drift, never a strobe-scale jump (§23).
    expect(moved).toBeLessThan(1);
    renderer.dispose();
  });

  it('persistence updates brighten the structure (young faint → permanent solid)', () => {
    const renderer = new StructureRenderer();
    renderer.handleSpawned(makeStructure({ persistence: 0 }));
    const colors = meshOf(renderer).geometry.getAttribute('color')!;
    const faint = colors.getX(0);
    renderer.handleUpdated(makeStructure({ persistence: 1 }));
    const solid = colors.getX(0);
    expect(faint).toBeGreaterThan(0);
    expect(solid).toBeGreaterThan(faint);
    renderer.dispose();
  });

  it('subscribes to structure bus events and detaches cleanly', () => {
    const bus = createEventBus<StructureEvents>();
    const renderer = new StructureRenderer();
    const detach = renderer.subscribe(bus);
    bus.emit('structure:spawned', makeStructure());
    expect(renderer.count).toBe(1);
    bus.emit('structure:removed', makeStructure());
    expect(renderer.count).toBe(0);
    detach();
    bus.emit('structure:spawned', makeStructure());
    expect(renderer.count).toBe(0);
    renderer.dispose();
  });

  it('dispose empties the group and frees every mesh', () => {
    const renderer = new StructureRenderer();
    renderer.handleSpawned(makeStructure());
    renderer.dispose();
    expect(renderer.count).toBe(0);
    expect(renderer.group.children.length).toBe(0);
  });
});
