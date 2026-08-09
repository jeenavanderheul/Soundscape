/**
 * Minimal Esc pause overlay (spec §5 Esc = pause/settings, MVP item 13).
 * English, keyboard-accessible, deliberately not DAW-like: a title, resume,
 * and a 'Reset world' button that clears every form the player's sound made.
 * The Game owns pause semantics; this module only owns the DOM.
 */

export interface PauseOverlayCallbacks {
  onResume(): void;
  onResetWorld(): void;
}

export class PauseOverlay {
  private readonly root: HTMLElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly status: HTMLElement;

  constructor(
    callbacks: PauseOverlayCallbacks,
    parent: HTMLElement = document.body,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'pause-overlay';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'pause-title');
    this.root.hidden = true;

    const title = document.createElement('h2');
    title.id = 'pause-title';
    title.textContent = 'PAUSED';

    this.resumeButton = document.createElement('button');
    this.resumeButton.type = 'button';
    this.resumeButton.textContent = 'Resume';
    this.resumeButton.addEventListener('click', () => callbacks.onResume());

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.textContent = 'Reset world';
    resetButton.addEventListener('click', () => {
      callbacks.onResetWorld();
      this.status.textContent = 'World reset. The void is empty again.';
    });

    // Announced politely so keyboard/screen-reader users get confirmation.
    this.status = document.createElement('p');
    this.status.setAttribute('aria-live', 'polite');

    this.root.append(title, this.resumeButton, resetButton, this.status);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.status.textContent = '';
    this.root.hidden = false;
    this.resumeButton.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.root.remove();
  }
}
