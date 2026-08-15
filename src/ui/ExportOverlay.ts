/**
 * §32: the flight, handed back as source. Press E and the track you just flew
 * appears as a numbered, commented Strudel block — and lands on the clipboard,
 * so it can be pasted straight into strudel.cc.
 *
 * Text nodes only, never innerHTML: the block contains generated pattern code
 * and must never be parsed as markup.
 */

const PANEL_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  inset: '0',
  display: 'none',
  zIndex: '40',
  padding: '6vh 6vw',
  boxSizing: 'border-box',
  background: 'rgba(6, 8, 14, 0.94)',
  color: 'rgba(228, 236, 255, 0.92)',
  font: '12px/1.7 var(--font-mono)',
  letterSpacing: '0.02em',
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

export class ExportOverlay {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly body: HTMLElement;
  private visible = false;

  constructor(container: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.setAttribute('aria-hidden', 'true');
    Object.assign(this.root.style, PANEL_STYLE);

    this.status = document.createElement('div');
    Object.assign(this.status.style, {
      marginBottom: '1.4em',
      color: 'rgba(150, 220, 255, 0.9)',
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      fontSize: '10px',
    });

    this.body = document.createElement('pre');
    Object.assign(this.body.style, {
      margin: '0',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      font: 'inherit',
    });

    this.root.append(this.status, this.body);
    container.append(this.root);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Show the score and try to put it on the clipboard. */
  show(code: string): void {
    this.body.replaceChildren(document.createTextNode(code));
    this.setStatus('your track · E to close');
    this.visible = true;
    this.root.style.display = 'block';
    this.root.scrollTop = 0;
    void this.copy(code);
  }

  hide(): void {
    this.visible = false;
    this.root.style.display = 'none';
  }

  toggle(code: string): void {
    if (this.visible) this.hide();
    else this.show(code);
  }

  dispose(): void {
    this.root.remove();
  }

  private setStatus(text: string): void {
    this.status.replaceChildren(document.createTextNode(text));
  }

  /** Clipboard access can be denied or unavailable; the code stays readable either way. */
  private async copy(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.setStatus('copied to clipboard · paste into strudel.cc · E to close');
    } catch {
      this.setStatus('select and copy · E to close');
    }
  }
}
