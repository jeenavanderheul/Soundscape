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

/**
 * Insert a banner above each run of voices that share a label. The engine
 * emits exactly one indented line per primitive, in layer order, so the labels
 * line up one for one.
 */
export function sectioned(code: string, labels: readonly string[]): string {
  const lines = code.split('\n');
  const out: string[] = [];
  let voice = 0;
  let last = '';
  for (const line of lines) {
    if (!line.startsWith('  ')) {
      out.push(line);
      continue;
    }
    const label = labels[voice] ?? '';
    voice += 1;
    if (label !== '' && label !== last) {
      if (last !== '') out.push('');
      out.push(`  // ── ${label} ──`);
      last = label;
    }
    out.push(line);
  }
  return out.join('\n');
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

  /**
   * §97: the score, grouped the way the preset that inspired it is grouped —
   * one banner per role, appearing as that role arrives. A track is not a flat
   * stack of lines; it is ATMOSPHERE, then HATS, then KICK, and being able to
   * read it that way is what makes the code on screen mean anything.
   *
   * `labels` runs parallel to the voice lines the engine emitted, so what you
   * read is always the code that is actually sounding — never a copy of a
   * preset that has drifted away from it.
   */
  update(code: string, labels: readonly string[] = [], header = ''): void {
    const grouped = labels.length > 0 ? sectioned(code, labels) : code;
    // §109: the header is live state, so it changes far more often than the
    // pattern does — but it is cheap, and comparing the whole thing keeps the
    // "only redraw on change" rule in one place.
    const annotated = header === '' ? grouped : `${header}${grouped}`;
    if (annotated === this.lastCode) return;
    this.lastCode = annotated;
    if (this.visible) this.render(annotated);
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
