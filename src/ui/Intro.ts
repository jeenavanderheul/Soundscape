import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../app/Game';
import { isTouchDevice } from '../input/TouchControls';

/**
 * Headphone onboarding hint (spec M1, §23). After the unlock overlay is
 * dismissed ('audio:unlocked'), a brief non-blocking line appears and
 * fades away. aria-live polite; no animation under prefers-reduced-motion.
 */

const HINT_TEXT = 'Use headphones. Move with WASD. Listen.';
const HINT_TEXT_TOUCH = 'Use headphones. Left thumb flies. Listen.';
const VISIBLE_MS = 5000;
const FADE_MS = 2000;

export function attachIntroHint(
  events: EventBus<GameEvents>,
  parent: HTMLElement = document.body,
): () => void {
  // The live region must exist before text is inserted so it is announced.
  const hint = document.createElement('p');
  hint.setAttribute('aria-live', 'polite');
  hint.style.cssText = [
    'position:fixed',
    'left:0',
    'right:0',
    'bottom:12vh',
    'margin:0',
    'text-align:center',
    'font:400 0.9rem/1.5 var(--font-mono)',
    'letter-spacing:0.08em',
    'color:#9a9a9a',
    'pointer-events:none',
    'opacity:1',
  ].join(';');
  parent.appendChild(hint);

  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let removeTimer: ReturnType<typeof setTimeout> | undefined;

  const remove = (): void => {
    if (showTimer !== undefined) clearTimeout(showTimer);
    if (removeTimer !== undefined) clearTimeout(removeTimer);
    hint.remove();
  };

  const unsubscribe = events.on('audio:unlocked', () => {
    hint.textContent = isTouchDevice() ? HINT_TEXT_TOUCH : HINT_TEXT;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    showTimer = setTimeout(() => {
      if (reducedMotion) {
        remove();
        return;
      }
      hint.style.transition = `opacity ${FADE_MS}ms ease-out`;
      hint.style.opacity = '0';
      removeTimer = setTimeout(remove, FADE_MS);
    }, VISIBLE_MS);
  });

  return () => {
    unsubscribe();
    remove();
  };
}
