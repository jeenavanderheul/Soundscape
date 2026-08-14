import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { createEventBus } from '../../src/core/EventBus';
import { createStore } from '../../src/core/stores';
import { CRUISE_SPEED, FULL_SPEED } from '../../src/player/FrequencyController';
import { TrackBuilder } from '../../src/music/TrackBuilder';
import { createInitialTrackState, type TrackEvents } from '../../src/music/TrackState';

/**
 * §119: the top speed doubled, and the music did not. Flying harder has meant
 * "get further into the arc" since §46 — but only up to a point, or the whole
 * production goes by unheard, which is exactly what §87 had to undo.
 */
describe('the top of the throttle is travel, not tempo', () => {
  const builder = () => new TrackBuilder(createStore(createInitialTrackState()), createEventBus<TrackEvents>());

  it('flies twice as fast as it used to', () => {
    expect(FULL_SPEED).toBe(132);
    expect(FULL_SPEED / CRUISE_SPEED).toBeGreaterThan(9);
  });

  it('but the arc walks no faster past the old top speed', () => {
    const b = builder();
    expect(b.pace(FULL_SPEED)).toBe(b.pace(66));
    expect(b.pace(FULL_SPEED * 4)).toBe(b.pace(66));
  });

  it('and still speeds up over the range that matters', () => {
    const b = builder();
    expect(b.pace(66)).toBeGreaterThan(b.pace(CRUISE_SPEED));
    expect(b.pace(CRUISE_SPEED)).toBeGreaterThan(b.pace(0));
  });
});
