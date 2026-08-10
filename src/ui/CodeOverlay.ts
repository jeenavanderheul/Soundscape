/**
 * The pattern source the world is writing, shown read-only (spec §11: the
 * player never gets an editable REPL). Press C to reveal what your flight
 * just composed — the code is a mirror of the track, never an input.
 *
 * Rendering builds text nodes and spans directly: no innerHTML, so the
 * overlay cannot become an injection surface even if a template ever grew a
 * dynamic field.
 */

export type CodeTokenKind = 'string' | 'number' | 'call' | 'plain';

export interface CodeToken {
  text: string;
  kind: CodeTokenKind;
}

const TOKEN_COLORS: Record<CodeTokenKind, string> = {
  string: 'rgba(140, 235, 190, 0.95)',
  number: 'rgba(235, 200, 130, 0.9)',
  call: 'rgba(150, 190, 245, 0.9)',
  plain: 'rgba(205, 220, 224, 0.8)',
};

// One pass, ordered: strings win over anything inside them.
const TOKEN_RE =
  /("[^"]*")|(\b\d+\.?\d*\b)|(\b(?:stack|note|gain|decay|sustain|hpf|bpf|lpf|slow|fast|late|degradeBy|add|s)\b)/g;

/** Split our generated pattern code into coloured tokens. Pure. */
export function tokenize(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let index = 0;
  for (const match of code.matchAll(TOKEN_RE)) {
    const start = match.index;
    if (start > index) tokens.push({ text: code.slice(index, start), kind: 'plain' });
    const kind: CodeTokenKind = match[1] ? 'string' : match[2] ? 'number' : 'call';
    tokens.push({ text: match[0], kind });
    index = start + match[0].length;
  }
  if (index < code.length) tokens.push({ text: code.slice(index), kind: 'plain' });
  return tokens;
}

export class CodeOverlay {
  private readonly root: HTMLPreElement;
  // §11/§38: the score is ON by default — a player should always be able to
  // see what their flight is writing. C hides it.
  private visible = true;
  private lastCode = '';
  private lastStatus = '';

  constructor(container: HTMLElement = document.body) {
    this.root = document.createElement('pre');
    this.root.setAttribute('aria-hidden', 'true');
    Object.assign(this.root.style, {
      position: 'fixed',
      right: '18px',
      top: '16px',
      margin: '0',
      maxWidth: 'min(44ch, 34vw)',
      maxHeight: '60vh',
      overflow: 'hidden',
      color: TOKEN_COLORS.plain,
      font: '11px/1.65 "SF Mono", ui-monospace, Menlo, monospace',
      letterSpacing: '0.02em',
      whiteSpace: 'pre-wrap',
      // Pattern code has no spaces to break at: wrap anywhere rather than clip.
      overflowWrap: 'anywhere',
      pointerEvents: 'none',
      textShadow: '0 0 6px rgba(120, 200, 215, 0.25)',
      borderLeft: '1px solid rgba(150, 200, 210, 0.25)',
      paddingLeft: '10px',
      zIndex: '10',
    });
    this.root.hidden = !this.visible;
    container.appendChild(this.root);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.hidden = !this.visible;
    if (this.visible) this.render(this.lastCode);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Logic-loop rate; touches the DOM only when the pattern actually changed. */
  /**
   * §41: a one-line truth about what is actually playing — whether the real
   * kit loaded, which region's grammar is running, on which machine, at what
   * tempo. "I hear no difference" becomes checkable in one glance.
   */
  setStatus(text: string): void {
    if (text === this.lastStatus) return;
    this.lastStatus = text;
    if (this.visible) this.render(this.lastCode);
  }

  update(code: string): void {
    if (code === this.lastCode) return;
    this.lastCode = code;
    if (this.visible) this.render(code);
  }

  private render(code: string): void {
    this.root.replaceChildren();
    const header = document.createElement('span');
    header.style.opacity = '0.5';
    header.textContent =
      code.trim() === ''
        ? `// the void is silent\n${this.lastStatus ? `// ${this.lastStatus}\n` : ''}`
        : `// your world is playing\n${this.lastStatus ? `// ${this.lastStatus}\n` : ''}`;
    this.root.appendChild(header);
    for (const token of tokenize(code)) {
      if (token.kind === 'plain') {
        this.root.appendChild(document.createTextNode(token.text));
        continue;
      }
      const span = document.createElement('span');
      span.style.color = TOKEN_COLORS[token.kind];
      span.textContent = token.text;
      this.root.appendChild(span);
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
