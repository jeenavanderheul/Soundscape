/**
 * §30: "describe the world you want to fly through". One line of input on the
 * unlock screen, and again on P during play. The API key lives only in this
 * browser (localStorage) and is stated as such — no key, no AI, the seeded
 * void still plays.
 */

export interface PromptOverlayHandlers {
  onSubmit(description: string, apiKey: string): Promise<void>;
  onSkip(): void;
}

const LABEL = 'describe the world you want to fly through';

export class PromptOverlay {
  private readonly root: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly keyInput: HTMLInputElement;
  private readonly status: HTMLParagraphElement;
  private busy = false;

  constructor(
    private readonly handlers: PromptOverlayHandlers,
    storedKey: string | null,
    container: HTMLElement = document.body,
  ) {
    this.root = document.createElement('div');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Describe your world');
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '14px',
      background: 'rgba(2, 2, 2, 0.88)',
      color: 'rgba(215, 228, 230, 0.9)',
      font: '13px/1.7 "SF Mono", ui-monospace, Menlo, monospace',
      letterSpacing: '0.08em',
      zIndex: '20',
    });

    const label = document.createElement('label');
    label.textContent = LABEL;
    label.htmlFor = 'world-prompt-input';

    this.input = document.createElement('input');
    this.input.id = 'world-prompt-input';
    this.input.type = 'text';
    this.input.placeholder = 'a rusted cathedral in fog, slow and heavy';
    this.input.autocomplete = 'off';
    styleField(this.input, '46ch');

    const keyLabel = document.createElement('label');
    keyLabel.textContent = 'anthropic api key — stays in this browser';
    keyLabel.htmlFor = 'world-prompt-key';
    keyLabel.style.opacity = '0.6';

    this.keyInput = document.createElement('input');
    this.keyInput.id = 'world-prompt-key';
    this.keyInput.type = 'password';
    this.keyInput.placeholder = 'sk-ant-...';
    this.keyInput.autocomplete = 'off';
    this.keyInput.value = storedKey ?? '';
    styleField(this.keyInput, '46ch');

    const buttons = document.createElement('div');
    buttons.style.display = 'flex';
    buttons.style.gap = '12px';

    const build = document.createElement('button');
    build.type = 'button';
    build.textContent = 'build this world';
    styleButton(build);
    build.addEventListener('click', () => void this.submit());

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = 'enter the void instead';
    styleButton(skip);
    skip.addEventListener('click', () => {
      this.hide();
      this.handlers.onSkip();
    });

    this.status = document.createElement('p');
    this.status.setAttribute('role', 'status');
    this.status.style.minHeight = '1.7em';
    this.status.style.margin = '0';
    this.status.style.opacity = '0.75';

    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void this.submit();
    });

    buttons.append(build, skip);
    this.root.append(label, this.input, keyLabel, this.keyInput, buttons, this.status);
    container.appendChild(this.root);
  }

  get isVisible(): boolean {
    return this.root.style.display === 'flex';
  }

  show(): void {
    this.root.style.display = 'flex';
    this.status.textContent = '';
    this.input.focus();
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  dispose(): void {
    this.root.remove();
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.setStatus('composing your world…');
    try {
      await this.handlers.onSubmit(this.input.value, this.keyInput.value);
      this.hide();
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      this.busy = false;
    }
  }
}

function styleField(field: HTMLInputElement, width: string): void {
  Object.assign(field.style, {
    width,
    maxWidth: '80vw',
    padding: '10px 12px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(150, 200, 210, 0.35)',
    color: 'inherit',
    font: 'inherit',
    outline: 'none',
  });
}

function styleButton(button: HTMLButtonElement): void {
  Object.assign(button.style, {
    padding: '9px 16px',
    background: 'transparent',
    border: '1px solid rgba(150, 200, 210, 0.5)',
    color: 'inherit',
    font: 'inherit',
    letterSpacing: '0.1em',
    cursor: 'pointer',
  });
}
