import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { exportFlight, formatFlight } from '../../src/music/FlightExport';

/**
 * §106: the export exists so that a change can be HEARD before it is believed.
 * If it drifted from what the game plays it would be worse than nothing, so
 * these check the two properties that make it trustworthy: it is the real
 * flight, and it is complete.
 */
describe('a flight can be heard without flying', () => {
  const flight = () => exportFlight({ genre: 'locked-groove', velocity: 66, seconds: 200 });

  it('walks the whole arc, one block per phase, in order', () => {
    const phases = flight().map((b) => b.phase);
    expect(phases.slice(0, 8)).toEqual([
      'ENTER BIOME', 'DISCOVERY I', 'DISCOVERY II', 'PRESSURE',
      'DROP I', 'DEEP FLIGHT', 'VOID', 'DROP II',
    ]);
  });

  it('opens on a beat and fills up across the arc (§100)', () => {
    // One lap: at full speed the arc is ~90s, and a finished track hands over
    // to the next one after DROP II — which is why a longer export shows the
    // count drop back to one. That is the journey working, not a regression.
    const blocks = exportFlight({ genre: 'locked-groove', velocity: 66, seconds: 88 });
    expect(blocks[0]!.earned).toBeGreaterThan(0);
    expect(blocks[blocks.length - 1]!.earned).toBeGreaterThan(blocks[0]!.earned);
    for (let i = 1; i < blocks.length; i += 1) {
      expect(blocks[i]!.earned).toBeGreaterThanOrEqual(blocks[i - 1]!.earned);
    }
  });

  it('shows the handover: a finished track gives way to a new one', () => {
    const earned = flight().map((b) => b.earned);
    expect(Math.max(...earned)).toBeGreaterThan(earned[earned.length - 1]!);
  });

  it('is deterministic — two exports of the same flight are identical', () => {
    expect(formatFlight({ genre: 'locked-groove', seconds: 120 }))
      .toBe(formatFlight({ genre: 'locked-groove', seconds: 120 }));
  });

  it('writes real, paste-ready Strudel with its own tempo', () => {
    const text = formatFlight({ genre: 'locked-groove', seconds: 120 });
    expect(text).toContain('setcpm(');
    expect(text).toContain('stack(');
    expect(text).toContain('// ── KICK ──');
    // The banners are the same ones the game's overlay shows (§97).
    expect(text).toContain('// ── ATMOSPHERE ──');
  });

  it('does the same for the other world', () => {
    const phases = exportFlight({ genre: 'sub-pressure', velocity: 66, seconds: 200 })
      .map((b) => b.phase);
    expect(phases[0]).toBe('ENTER BIOME');
    expect(phases).toContain('DROP II');
  });
});
