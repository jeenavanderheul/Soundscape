import './style.css';
import { Game } from './app/Game';

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`FREQUENCY: required element "${selector}" is missing from index.html`);
  }
  return element;
}

try {
  new Game({
    container: requireElement<HTMLElement>('#app'),
    overlay: requireElement<HTMLElement>('#unlock-overlay'),
    unlockButton: requireElement<HTMLButtonElement>('#unlock-button'),
  });
} catch (error) {
  console.error('FREQUENCY: failed to start', error);
  document.body.textContent =
    'FREQUENCY could not start. Your browser may not support WebGL 2. Please try a modern desktop browser.';
}
