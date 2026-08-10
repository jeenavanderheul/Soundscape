import { describe, expect, it } from 'vitest';
import { tokenize } from '../../src/ui/CodeOverlay';

/**
 * The overlay renders tokens as text nodes and spans (no innerHTML), so the
 * only logic worth testing is the tokenizer: it must be lossless, and markup
 * inside the source must stay ordinary text rather than becoming structure.
 */
describe('CodeOverlay tokenizer (§11: read-only mirror, never a REPL)', () => {
  it('tokenizes the generated pattern without losing a character', () => {
    const code = 's("sbd*4").gain(0.850)';
    const tokens = tokenize(code);
    expect(tokens.map((t) => t.text).join('')).toBe(code);
    expect(tokens.find((t) => t.text === '"sbd*4"')?.kind).toBe('string');
    expect(tokens.find((t) => t.text === '0.850')?.kind).toBe('number');
    expect(tokens.find((t) => t.text === 'gain')?.kind).toBe('call');
  });

  it('treats markup as plain text, never as structure', () => {
    const hostile = 'note("<img src=x onerror=alert(1)>").gain(1)';
    const tokens = tokenize(hostile);
    expect(tokens.map((t) => t.text).join('')).toBe(hostile);
    const markup = tokens.find((t) => t.text.includes('<img'));
    expect(markup?.kind).toBe('string'); // one quoted token, rendered via textContent
  });

  it('handles the empty void', () => {
    expect(tokenize('')).toEqual([]);
  });
});
