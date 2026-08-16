import { describe, expect, it } from 'vitest';
import {
  DEMO_CONFIG,
  gustsForLeg,
  pilotCommand,
  targetAltitude,
  targetBearing,
  windAt,
  worldIndex,
} from '../../src/app/demoFlight';
import { SECTORS, worldForHeading } from '../../src/genres/GenreZones';
import { AIR_ALTITUDE } from '../../src/music/Performance';

const LEG = DEMO_CONFIG.legMs;
const TOUR = LEG * 6;
/** Sample the whole tour at 100 ms; fine enough to see every gust and arc. */
const STEP = 100;

function samples(fromMs: number, toMs: number, step = STEP): number[] {
  const out: number[] = [];
  for (let t = fromMs; t < toMs; t += step) out.push(t);
  return out;
}

describe('the demo tour visits every world', () => {
  it('settles on a different one of the six sectors in each leg', () => {
    const visited = [0, 1, 2, 3, 4, 5].map((leg) =>
      worldForHeading(targetBearing(leg * LEG + LEG * 0.75)),
    );
    expect(new Set(visited).size).toBe(6);
    expect(new Set(visited)).toEqual(new Set(SECTORS));
  });

  it('walks the compass one sector at a time, never jumping', () => {
    for (let leg = 1; leg < 6; leg++) {
      expect(worldIndex(leg * LEG)).toBe((worldIndex((leg - 1) * LEG) + 1) % 6);
    }
  });

  it('starts the round again after the sixth world, forever', () => {
    expect(worldIndex(TOUR + LEG * 0.5)).toBe(worldIndex(LEG * 0.5));
    expect(worldIndex(TOUR * 3 + LEG * 2.5)).toBe(worldIndex(LEG * 2.5));
    expect(worldForHeading(targetBearing(TOUR + LEG * 0.75))).toBe(
      worldForHeading(targetBearing(LEG * 0.75)),
    );
  });

  it('does not swing away from the first world at the start', () => {
    expect(targetBearing(0)).toBeCloseTo(0, 2);
    expect(worldForHeading(targetBearing(0))).toBe(SECTORS[0]);
  });
});

describe('the turn between worlds is a lean, not a snap', () => {
  it('eases across the border instead of stepping', () => {
    const before = targetBearing(LEG - 1);
    const after = targetBearing(LEG + 1);
    // A snap would move a whole 60° sector inside 2 ms.
    expect(Math.abs(after - before)).toBeLessThan(0.02);
  });

  it('never asks for more than a human turn rate', () => {
    let worst = 0;
    for (const t of samples(0, TOUR, 16)) {
      const rate = Math.abs(targetBearing(t + 16) - targetBearing(t)) / 0.016;
      worst = Math.max(worst, rate);
    }
    expect(worst).toBeLessThan(0.6); // rad/s
  });

  it('is never a dead straight line, even mid-leg', () => {
    const mid = samples(LEG * 0.4, LEG * 0.9, 250).map(targetBearing);
    const spread = Math.max(...mid) - Math.min(...mid);
    expect(spread).toBeGreaterThan(0.01);
  });
});

describe('the demo flies low and high', () => {
  it('spans skimming height and well above the open-filter altitude', () => {
    const heights = samples(0, TOUR).map(targetAltitude);
    expect(Math.min(...heights)).toBeLessThan(80);
    expect(Math.max(...heights)).toBeGreaterThan(AIR_ALTITUDE * 1.5);
  });

  it('stays inside the flyable band', () => {
    for (const t of samples(0, TOUR * 2, 250)) {
      const h = targetAltitude(t);
      expect(h).toBeGreaterThanOrEqual(DEMO_CONFIG.minAltitude);
      expect(h).toBeLessThanOrEqual(DEMO_CONFIG.maxAltitude);
    }
  });

  it('moves in arcs rather than steps or a held level', () => {
    const leg = samples(0, LEG, 200).map(targetAltitude);
    const jumps = leg.slice(1).map((h, i) => Math.abs(h - leg[i]!));
    expect(Math.max(...jumps)).toBeLessThan(15); // no cliffs
    expect(Math.max(...leg) - Math.min(...leg)).toBeGreaterThan(60); // no plateau
  });

  it('gives each world its own arc', () => {
    const shapes = [0, 1, 2, 3, 4, 5].map((leg) => {
      const arc = samples(leg * LEG, (leg + 1) * LEG, 200).map(targetAltitude);
      return `${Math.round(Math.min(...arc))}-${Math.round(Math.max(...arc))}`;
    });
    expect(new Set(shapes).size).toBe(6);
  });
});

describe('the wind comes in irregular gusts', () => {
  it('breathes several times in every world', () => {
    for (let leg = 0; leg < 6; leg++) {
      expect(gustsForLeg(leg).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('never repeats the same hold or the same gap', () => {
    const gusts = [0, 1, 2, 3, 4, 5].flatMap((leg) =>
      gustsForLeg(leg).map((g) => ({ ...g, startMs: g.startMs + leg * LEG })),
    );
    const holds = gusts.map((g) => g.durationMs);
    const gaps = gusts.slice(1).map((g, i) => g.startMs - (gusts[i]!.startMs + gusts[i]!.durationMs));
    expect(new Set(holds.map((h) => Math.round(h))).size).toBe(holds.length);
    expect(new Set(gaps.map((g) => Math.round(g))).size).toBe(gaps.length);
    // A metronome would have every gap the same; this one wanders by seconds.
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(1500);
  });

  it('holds short to medium — a breath, never a lean on the button', () => {
    for (const gust of [0, 1, 2, 3, 4, 5].flatMap(gustsForLeg)) {
      expect(gust.durationMs).toBeGreaterThan(200);
      expect(gust.durationMs).toBeLessThan(1600);
    }
  });

  it('is off far more often than on', () => {
    const held = samples(0, TOUR).filter(windAt).length;
    expect(held / (TOUR / STEP)).toBeLessThan(0.35);
    expect(held).toBeGreaterThan(0);
  });

  it('repeats exactly on the next round, so every demo is the same one', () => {
    for (const t of samples(0, LEG * 2, 250)) {
      expect(windAt(TOUR + t)).toBe(windAt(t));
    }
  });
});

describe('the pilot command', () => {
  const level = { heading: 0, altitude: 200, climbRate: 0 };

  it('holds the throttle wide open the whole tour — one constant speed', () => {
    for (const t of samples(0, TOUR * 2, 250)) {
      const command = pilotCommand(t, level);
      expect(command.axes.moveZ).toBe(1);
      expect(command.axes.moveX).toBe(0);
    }
  });

  it('turns toward the world it is heading for', () => {
    // Facing north while the tour wants east: it steers, and it steers back.
    const right = pilotCommand(LEG * 1.5, { ...level, heading: 0 });
    expect(right.look.x).toBeGreaterThan(0);
    const left = pilotCommand(LEG * 1.5, { ...level, heading: right.targetBearing + 0.5 });
    expect(left.look.x).toBeLessThan(0);
    const there = pilotCommand(LEG * 1.5, { ...level, heading: right.targetBearing });
    expect(there.look.x).toBeCloseTo(0, 6);
  });

  it('never spends more look than a hand could', () => {
    for (const t of samples(0, TOUR, 250)) {
      for (const sense of [level, { heading: 3, altitude: 20, climbRate: -40 }]) {
        const command = pilotCommand(t, sense);
        expect(Math.abs(command.look.x)).toBeLessThanOrEqual(DEMO_CONFIG.maxLookPx.x);
        expect(Math.abs(command.look.y)).toBeLessThanOrEqual(DEMO_CONFIG.maxLookPx.y);
      }
    }
  });

  it('pitches up when it is below its arc and down when it is above', () => {
    const t = LEG * 0.5;
    const want = targetAltitude(t);
    // Mouse y is inverted: negative pixels pitch the nose up.
    expect(pilotCommand(t, { heading: 0, altitude: want - 300, climbRate: 0 }).look.y)
      .toBeLessThan(0);
    expect(pilotCommand(t, { heading: 0, altitude: want + 300, climbRate: 0 }).look.y)
      .toBeGreaterThan(0);
  });

  it('is pure: the same moment always gives the same command', () => {
    const a = pilotCommand(LEG * 2.3, level);
    const b = pilotCommand(LEG * 2.3, level);
    expect(a).toEqual(b);
  });
});
