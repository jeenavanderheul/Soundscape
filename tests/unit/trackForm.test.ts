import { describe, expect, it } from 'vitest';

import { formFor, isPlayableOrder, TRACK_LAYERS } from '../../src/music/TrackForm';
import { ACTIVE_WORLD_GENRES } from '../../src/genres/ActiveWorlds';

/**
 * §128: every journey unique, inside a system. The two halves of that promise
 * pull against each other, so both are asserted here — variety wide enough to
 * be worth flying, and rules tight enough that no draw is a pile.
 */
describe('§128 the shape of a track is drawn, not written', () => {
  const draws = () => {
    const forms = [];
    for (let seed = 0; seed < 300; seed += 1) {
      for (const genre of ACTIVE_WORLD_GENRES) {
        for (let track = 1; track <= 6; track += 1) {
          forms.push(formFor(`journey-${seed}`, genre, track));
        }
      }
    }
    return forms;
  };

  it('never draws an order that breaks the build', () => {
    for (const form of draws()) {
      expect(`${form.order.join(',')}: ${isPlayableOrder(form.order) ? 'ok' : 'PILE'}`)
        .toBe(`${form.order.join(',')}: ok`);
      expect([...form.order].sort()).toEqual([...TRACK_LAYERS].sort());
    }
  });

  it('keeps the floor under the track: a kick is never later than the fourth rung', () => {
    // A draw once put it seventh, which is a techno track that goes six rungs
    // without a kick — unpredictable, and heard as broken rather than as a
    // variation. Every world here is built on one.
    for (const form of draws()) expect(form.order.indexOf('kick')).toBeLessThan(4);
  });

  it('is wide enough to be worth flying: hundreds of orders, every layer an opener', () => {
    const forms = draws();
    const orders = new Set(forms.map((f) => f.order.join(',')));
    const openers = new Set(forms.map((f) => f.order[0]!));
    expect(orders.size).toBeGreaterThan(300);
    expect(openers.size).toBe(6);
  });

  it('gives a journey the same tracks every time — a good flight can be found again', () => {
    // The user chose a shareable code over pure novelty: paste it back and the
    // same worlds write the same tracks.
    expect(formFor('kx7', 'techno', 3)).toEqual(formFor('kx7', 'techno', 3));
    expect(formFor('kx7', 'techno', 3)).not.toEqual(formFor('a92', 'techno', 3));
    expect(formFor('kx7', 'techno', 3)).not.toEqual(formFor('kx7', 'techno', 4));
    expect(formFor('kx7', 'techno', 3)).not.toEqual(formFor('kx7', 'void-crusher', 3));
  });

  it('keeps each world its own tempo underneath the variation', () => {
    // Per world AND per track (user decision): a track departs from its
    // world's pace, but a riot never becomes a slow burn.
    const paceOf = (genre: Parameters<typeof formFor>[1]) => {
      const all = Array.from({ length: 60 }, (_, i) => formFor(`j${i}`, genre, 1).paceScale);
      return all.reduce((a, b) => a + b, 0) / all.length;
    };
    expect(paceOf('percussion-riot')).toBeLessThan(paceOf('techno'));
    expect(paceOf('techno')).toBeLessThan(paceOf('void-crusher'));
  });
});
