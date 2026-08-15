import { describe, expect, it } from 'vitest';

import { advanceSmoke, SMOKE_START, type SmokeInput } from '../../src/rendering/smokeState';

/**
 * §154: the smoke belongs to the arrangement. These are the claims that keep
 * it musical instead of atmospheric — an intro is clear air, a drop is one
 * hit on the beat, and a break empties the room.
 */

const base: SmokeInput = {
  section: 'groove',
  intensity: 0.5,
  sinceKick: 9,
  layerEarned: false,
  trackChanged: false,
};

function run(input: SmokeInput, seconds: number, from = SMOKE_START) {
  let state = from;
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) state = advanceSmoke(state, input, dt);
  return state;
}

describe('§154 smoke follows the arrangement', () => {
  it('keeps the air clear in an intro and thick in a drop', () => {
    const intro = run({ ...base, section: 'intro' }, 8).density;
    const groove = run({ ...base, section: 'groove' }, 8).density;
    const drop = run({ ...base, section: 'drop', sinceKick: 5 }, 8).density;
    expect(intro).toBeLessThan(groove);
    expect(groove).toBeLessThan(drop);
    expect(intro).toBeLessThan(0.15);
  });

  it('empties the room in a break, and faster than it filled it', () => {
    const thick = run({ ...base, section: 'drop', sinceKick: 5 }, 8);
    const cleared = run({ ...base, section: 'break' }, 2, thick);
    expect(cleared.density).toBeLessThan(thick.density * 0.35);
    // Clearing is faster than filling: two seconds out, but not two seconds in.
    const filling = run({ ...base, section: 'drop', sinceKick: 5 }, 2);
    expect(filling.density).toBeLessThan(thick.density * 0.95);
  });

  it('fires the big blast once, on the beat, at the top of a drop', () => {
    // Off the beat: nothing, however long it waits.
    expect(run({ ...base, section: 'drop', sinceKick: 0.5 }, 3).blast).toBe(0);

    let state = advanceSmoke(SMOKE_START, { ...base, section: 'drop', sinceKick: 0.01 }, 1 / 60);
    expect(state.blast).toBe(1);
    // And only once: the drop does not keep firing every beat.
    state = advanceSmoke(state, { ...base, section: 'drop', sinceKick: 0.01 }, 1 / 60);
    expect(state.blast).toBe(0);
  });

  it('fires more often as a build gets louder', () => {
    const count = (intensity: number) => {
      let state = SMOKE_START;
      let blasts = 0;
      for (let i = 0; i < 60 * 12; i++) {
        // A beat every half second, which is what a build sounds like.
        const sinceKick = (i % 30) / 60;
        state = advanceSmoke(state, { ...base, section: 'build', intensity, sinceKick }, 1 / 60);
        if (state.blast > 0) blasts++;
      }
      return blasts;
    };
    expect(count(1)).toBeGreaterThan(count(0.1));
    expect(count(0.1)).toBeGreaterThan(0);
  });

  it('breathes when a layer is earned, on any beat', () => {
    const state = advanceSmoke(SMOKE_START, { ...base, layerEarned: true }, 1 / 60);
    expect(state.blast).toBeGreaterThan(0.4);
  });

  it('clears the room when a new track starts', () => {
    const thick = run({ ...base, section: 'drop', sinceKick: 5 }, 8);
    const fresh = advanceSmoke(thick, { ...base, trackChanged: true }, 1 / 60);
    expect(fresh.density).toBeLessThan(thick.density * 0.3);
    expect(fresh.blast).toBe(0);
  });

  it('never leaves the 0..1 range', () => {
    const hot = run({ ...base, section: 'drop', intensity: 1, sinceKick: 0 }, 20);
    expect(hot.density).toBeLessThanOrEqual(1);
    expect(hot.density).toBeGreaterThanOrEqual(0);
    expect(hot.blast).toBeLessThanOrEqual(1);
  });
});
