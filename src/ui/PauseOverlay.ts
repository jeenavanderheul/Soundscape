import { quantizeVolume, VOLUME_STEPS } from '../audio/masterVolume';

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
  /** §195: hand the controls to the autopilot and watch the six worlds. */
  onDemoFlight(): void;
  /** §145: the volume, 0..1. Called on every drag, so it must be cheap. */
  onVolume(level: number): void;
  /** What the knob should read when the overlay opens. */
  volume(): number;
}

export class PauseOverlay {
  private readonly root: HTMLElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly volume: HTMLInputElement;
  private readonly readVolume: () => number;

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
    const demoButton = this.button('Demo flight', () => callbacks.onDemoFlight());
    /**
     * §200 (user): the genre lab reachable from the menu. It opens in its own
     * tab rather than navigating away, because navigating away tears down the
     * AudioContext and the flight with it — you would lose the track you are
     * standing in to go and look at how its world is written.
     */
    const labLink = document.createElement('a');
    labLink.href = '/genres/';
    labLink.target = '_blank';
    labLink.rel = 'noopener';
    labLink.textContent = 'Genre lab';
    labLink.className = 'pause-link';
    const newButton = this.button('New journey', () => {
      callbacks.onNewJourney();
      this.status.textContent = 'New journey. The void is empty again.';
    });

    // §145: the mouse is captured while flying, so this is where a pointer can
    // reach the volume at all. The keyboard owns it everywhere else.
    this.readVolume = callbacks.volume;
    const volumeRow = document.createElement('label');
    volumeRow.className = 'volume-row';
    const volumeLabel = document.createElement('span');
    volumeLabel.className = 'label';
    volumeLabel.textContent = 'volume';
    this.volume = document.createElement('input');
    this.volume.type = 'range';
    this.volume.min = '0';
    this.volume.max = '1';
    this.volume.step = String(1 / VOLUME_STEPS);
    this.volume.addEventListener('input', () => {
      callbacks.onVolume(quantizeVolume(Number(this.volume.value)));
    });
    volumeRow.append(volumeLabel, this.volume);

    this.root.append(
      title,
      this.resumeButton,
      saveButton,
      exportButton,
      demoButton,
      labLink,
      newButton,
      volumeRow,
      this.status,
    );
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
    this.volume.value = String(this.readVolume());
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
