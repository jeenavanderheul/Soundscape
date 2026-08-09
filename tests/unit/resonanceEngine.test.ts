import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/core/EventBus';
import { createInitialFrequencyState, FrequencyState } from '../../src/player/FrequencyState';
import { createResonator, ResonatorData } from '../../src/world/Resonator';
import { ResonanceEvent } from '../../src/resonance/ResonanceEvent';
import {
  PLAYER_SOURCE_ID,
  RESONANCE_ENGINE_CONFIG,
  ResonanceEngine,
  ResonanceEvents,
} from '../../src/resonance/ResonanceEngine';

const resonator: ResonatorData = createResonator({
  id: 'resonator-a',
  position: { x: 0, y: 0, z: 0 },
  baseHz: 330,
  waveform: 'triangle',
  amplitude: 1,
  interactionRadius: 6,
  audibleRadius: 160,
  persistenceThreshold: 2,
  materialProfile: 'glass',
  spatialProfile: 'omni',
  active: true,
});

// Combined radius = playerWaveRadius (8) + interactionRadius (6) = 14.
// strength(d) = (1 - d/14)^2 with both amplitudes at 1.
const NEAR = 2; // strength ≈ 0.73 — well above enter threshold
const HOVER_IN = 9; // strength ≈ 0.128 — just above enter threshold (0.12)
const HOVER_MID = 10; // strength ≈ 0.082 — between exit (0.06) and enter (0.12)
const FAR = 20; // strength = 0 — below exit threshold

function playerAt(distance: number): FrequencyState {
  return {
    ...createInitialFrequencyState(),
    hz: 220,
    amplitude: 1,
    position: { x: distance, y: 0, z: 0 },
  };
}

function setup(config = RESONANCE_ENGINE_CONFIG) {
  const bus = createEventBus<ResonanceEvents>();
  const events: ResonanceEvent[] = [];
  bus.on('resonance:event', (event) => events.push(event));
  const engine = new ResonanceEngine(bus, config);
  return { engine, events };
}

describe('ResonanceEngine engagement', () => {
  it('emits exactly one event on entering interaction range', () => {
    const { engine, events } = setup();
    engine.tick(0, playerAt(FAR), [resonator]);
    expect(events).toHaveLength(0);
    engine.tick(100, playerAt(NEAR), [resonator]);
    expect(events).toHaveLength(1);
    // Sustaining below the persistence threshold emits nothing further.
    engine.tick(200, playerAt(NEAR), [resonator]);
    engine.tick(300, playerAt(NEAR), [resonator]);
    expect(events).toHaveLength(1);
  });

  it('fills all §8 fields coherently on the emitted event', () => {
    const { engine, events } = setup();
    engine.tick(100, playerAt(NEAR), [resonator]);
    const event = events[0]!;
    expect(event.sourceId).toBe(PLAYER_SOURCE_ID);
    expect(event.targetId).toBe('resonator-a');
    expect(event.atMs).toBe(100);
    expect(event.sourceHz).toBe(220);
    expect(event.targetHz).toBe(330);
    expect(event.ratio).toBeCloseTo(1.5, 10);
    expect(event.classification).toBe('harmonic');
    expect(event.sourceWaveform).toBe('sine');
    expect(event.targetWaveform).toBe('triangle');
    expect(event.strength).toBeGreaterThan(RESONANCE_ENGINE_CONFIG.enterStrength);
    expect(event.persistence).toBe(0);
    expect(Object.isFrozen(event)).toBe(true);
  });

  it('does not spam events when hovering at the engagement boundary (hysteresis)', () => {
    const { engine, events } = setup();
    // High persistence threshold so only engagement transitions could emit here.
    const hoverTarget = { ...resonator, persistenceThreshold: 999 };
    engine.tick(0, playerAt(HOVER_IN), [hoverTarget]);
    expect(events).toHaveLength(1);
    // Oscillate between just-above-enter and the hysteresis gap: no new events.
    for (let i = 1; i <= 20; i++) {
      engine.tick(i * 100, playerAt(i % 2 === 0 ? HOVER_IN : HOVER_MID), [hoverTarget]);
    }
    expect(events).toHaveLength(1);
  });

  it('emits an exit event and enforces a re-entry cooldown', () => {
    const { engine, events } = setup();
    engine.tick(0, playerAt(NEAR), [resonator]);
    engine.tick(100, playerAt(FAR), [resonator]);
    expect(events).toHaveLength(2); // enter + exit
    // Immediately back in range, still inside cooldown: no event.
    engine.tick(200, playerAt(NEAR), [resonator]);
    expect(events).toHaveLength(2);
    // After the cooldown a fresh approach re-engages.
    const after = 100 + RESONANCE_ENGINE_CONFIG.cooldownMs + 100;
    engine.tick(after, playerAt(NEAR), [resonator]);
    expect(events).toHaveLength(3);
  });

  it('accumulates persistence while sustained and emits once at the threshold', () => {
    const { engine, events } = setup();
    let t = 0;
    engine.tick(t, playerAt(NEAR), [resonator]); // enter
    // persistenceThreshold is 2 s; tick every 100 ms.
    for (let i = 0; i < 25; i++) {
      t += 100;
      engine.tick(t, playerAt(NEAR), [resonator]);
    }
    expect(events).toHaveLength(2); // enter + one persistence-threshold event
    const sustained = events[1]!;
    expect(sustained.persistence).toBeGreaterThanOrEqual(2);
    expect(sustained.persistence).toBeLessThan(2.2);
    // Exit reports the total accumulated persistence.
    t += 100;
    engine.tick(t, playerAt(FAR), [resonator]);
    expect(events).toHaveLength(3);
    expect(events[2]!.persistence).toBeGreaterThan(sustained.persistence);
  });

  it('ignores inactive resonators and zero-amplitude players', () => {
    const { engine, events } = setup();
    engine.tick(0, playerAt(NEAR), [{ ...resonator, active: false }]);
    const silent = { ...playerAt(NEAR), amplitude: 0 };
    engine.tick(100, silent, [resonator]);
    expect(events).toHaveLength(0);
  });
});

describe('ResonanceEngine determinism and bounds', () => {
  it('is fully deterministic given identical inputs', () => {
    const a = setup();
    const b = setup();
    const script: Array<[number, number]> = [
      [0, FAR],
      [100, NEAR],
      [3000, NEAR],
      [3100, FAR],
      [5000, NEAR],
      [5100, HOVER_MID],
    ];
    for (const [t, d] of script) {
      a.engine.tick(t, playerAt(d), [resonator]);
      b.engine.tick(t, playerAt(d), [resonator]);
    }
    expect(a.events).toEqual(b.events);
    expect(a.events.length).toBeGreaterThan(0);
  });

  it('keeps a bounded history buffer', () => {
    const config = { ...RESONANCE_ENGINE_CONFIG, cooldownMs: 0, historyLimit: 4 };
    const { engine, events } = setup(config);
    let t = 0;
    for (let i = 0; i < 10; i++) {
      engine.tick(t, playerAt(NEAR), [resonator]);
      t += 100;
      engine.tick(t, playerAt(FAR), [resonator]);
      t += 100;
    }
    expect(events.length).toBeGreaterThan(4);
    expect(engine.history).toHaveLength(4);
    // History holds the most recent events.
    expect(engine.history[3]).toBe(events[events.length - 1]);
  });

  it('clamps large tick deltas so persistence cannot jump after suspension', () => {
    const { engine, events } = setup();
    engine.tick(0, playerAt(NEAR), [resonator]); // enter
    engine.tick(60_000, playerAt(NEAR), [resonator]); // resumed tab: clamped delta
    // 2 s threshold not reached from one clamped delta (max 100 ms).
    expect(events).toHaveLength(1);
  });
});
