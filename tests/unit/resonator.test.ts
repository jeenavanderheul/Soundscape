import { describe, expect, it } from 'vitest';
import { createFirstResonator, createResonator } from '../../src/world/Resonator';
import type { ResonatorData } from '../../src/world/Resonator';
import { createInitialWorldState, createWorldStore } from '../../src/world/WorldState';

const validData: ResonatorData = {
  id: 'res-test',
  position: { x: 1, y: 2, z: 3 },
  baseHz: 220,
  waveform: 'triangle',
  amplitude: 0.4,
  interactionRadius: 5,
  audibleRadius: 100,
  persistenceThreshold: 4,
  materialProfile: 'glass',
  spatialProfile: 'omni',
  active: true,
};

describe('createResonator', () => {
  it('returns a copy matching the §7 ResonatorData interface exactly', () => {
    const resonator = createResonator(validData);
    expect(resonator).toEqual(validData);
    expect(resonator).not.toBe(validData);
    expect(resonator.position).not.toBe(validData.position);
    expect(Object.keys(resonator).sort()).toEqual(Object.keys(validData).sort());
  });

  it('rejects non-positive baseHz', () => {
    expect(() => createResonator({ ...validData, baseHz: 0 })).toThrowError(/baseHz/);
  });

  it('rejects amplitude outside 0..1', () => {
    expect(() => createResonator({ ...validData, amplitude: 1.5 })).toThrowError(/amplitude/);
  });

  it('rejects non-positive radii', () => {
    expect(() => createResonator({ ...validData, audibleRadius: 0 })).toThrowError(/audibleRadius/);
    expect(() => createResonator({ ...validData, interactionRadius: -1 })).toThrowError(
      /interactionRadius/,
    );
  });
});

describe('createFirstResonator (M1 single resonator)', () => {
  it('is a gentle sine near 330 Hz', () => {
    const first = createFirstResonator();
    expect(first.waveform).toBe('sine');
    expect(first.baseHz).toBe(330);
    expect(first.amplitude).toBeGreaterThan(0);
    expect(first.amplitude).toBeLessThanOrEqual(0.6);
    expect(first.active).toBe(true);
  });

  it('sits roughly 40 units from the spawn origin', () => {
    const { x, y, z } = createFirstResonator().position;
    const distance = Math.hypot(x, y, z);
    expect(distance).toBeGreaterThan(35);
    expect(distance).toBeLessThan(45);
  });

  it('is faintly audible from spawn (audibleRadius exceeds spawn distance)', () => {
    const first = createFirstResonator();
    const distance = Math.hypot(first.position.x, first.position.y, first.position.z);
    expect(first.audibleRadius).toBeGreaterThan(distance);
  });

  it('is serializable (JSON round-trips without loss)', () => {
    const first = createFirstResonator();
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});

describe('WorldState (seeded resonators, spec §7)', () => {
  const SEED = 'worldstate-test-seed';

  it('initial world contains the seeded resonators, led by the first', () => {
    const world = createInitialWorldState(SEED);
    expect(world.resonators).toHaveLength(7);
    // Same voice and place as always; only the pitch follows the world's key (§32).
    const { baseHz, ...shape } = world.resonators[0]!;
    const { baseHz: _original, ...expected } = createFirstResonator();
    expect(shape).toEqual(expected);
    expect(baseHz).toBeGreaterThan(0);
  });

  it('resonators differ clearly in frequency and timbre', () => {
    const world = createInitialWorldState(SEED);
    const hzValues = world.resonators.map((r) => r.baseHz);
    const waveforms = world.resonators.map((r) => r.waveform);
    expect(new Set(hzValues).size).toBe(7);
    expect(new Set(waveforms).size).toBeGreaterThanOrEqual(4);
  });

  it('is deterministic per seed and varies across seeds', () => {
    expect(createInitialWorldState(SEED)).toEqual(createInitialWorldState(SEED));
    const other = createInitialWorldState('another-seed');
    const positionsA = createInitialWorldState(SEED).resonators.map((r) => r.position);
    const positionsB = other.resonators.map((r) => r.position);
    expect(positionsA).not.toEqual(positionsB);
  });

  it('store holds world state and supports immutable updates', () => {
    const store = createWorldStore(SEED);
    const before = store.getState();
    store.setState((current) => ({
      ...current,
      resonators: current.resonators.map((r) => ({ ...r, active: false })),
    }));
    expect(store.getState().resonators[0]!.active).toBe(false);
    expect(before.resonators[0]!.active).toBe(true);
  });

  it('store state is frozen (no mutation possible)', () => {
    const store = createWorldStore(SEED);
    const state = store.getState();
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.resonators[0])).toBe(true);
  });
});
