/**
 * Minimal Esc pause overlay (spec §5 Esc = pause/settings, MVP item 13).
 * English, keyboard-accessible, deliberately not DAW-like: resume, save track,
 * export the Strudel code, or leave for a new journey.
 * The Game owns pause semantics; this module only owns the DOM.
 */

export interface PauseOverlayCallbacks {
  onResume(): void;
  /** Flush the world/track to storage; returns what to tell the player. */
  onSaveTrack(): string;
  /** §32 export: hand the track back as Strudel source; returns confirmation. */
  onExportTrack(): string;
  /** Clears every form the player's sound made and starts an empty void. */
  onNewJourney(): void;
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

    // Announced politely so keyboard/screen-reader users get confirmation.
    this.status = document.createElement('p');
    this.status.setAttribute('aria-live', 'polite');

    this.resumeButton = this.button('Resume', () => callbacks.onResume());
    const saveButton = this.button('Save track', () => {
      this.status.textContent = callbacks.onSaveTrack();
    });
    const exportButton = this.button('Export Strudel code', () => {
      this.status.textContent = callbacks.onExportTrack();
    });
    const newButton = this.button('New journey', () => {
      callbacks.onNewJourney();
      this.status.textContent = 'New journey. The void is empty again.';
    });

    this.root.append(title, this.resumeButton, saveButton, exportButton, newButton, this.status);
    parent.appendChild(this.root);
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
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
