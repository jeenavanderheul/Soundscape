import { describe, expect, it } from 'vitest';
import { menuButtonVisible } from '../../src/ui/MenuButton';

/**
 * §197: the touch entrance to the menu. The rule is small on purpose — the
 * button is a door to the overlay Escape already opens, not a second menu — so
 * what is worth pinning down is exactly when the door is on screen.
 */
describe('menuButtonVisible', () => {
  const state = { touch: true, unlocked: true, paused: false };

  it('is there on a phone once the world is playing', () => {
    expect(menuButtonVisible(state)).toBe(true);
  });

  it('never appears on a desk — Escape is the entrance there', () => {
    expect(menuButtonVisible({ ...state, touch: false })).toBe(false);
  });

  it('stays away before the audio is unlocked: there is nothing to pause yet', () => {
    expect(menuButtonVisible({ ...state, unlocked: false })).toBe(false);
  });

  it('steps aside while the overlay is open — the overlay IS the menu', () => {
    expect(menuButtonVisible({ ...state, paused: true })).toBe(false);
  });
});
