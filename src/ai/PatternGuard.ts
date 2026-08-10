/**
 * §30: the AI may write real Strudel patterns, and this file is why that is
 * safe. Strudel's `evaluate()` runs JavaScript in the page, so generated code
 * is validated against an ALLOWLIST GRAMMAR before it ever reaches the engine:
 * only Strudel pattern functions, numbers, and mini-notation strings pass.
 *
 * Everything that makes arbitrary JS possible — assignment, arrow functions,
 * template literals, `new`, property access on unknown identifiers, any
 * identifier not in the list — is rejected. The player keeps the musical
 * freedom of real Strudel; the page keeps its integrity.
 */

/** Strudel pattern vocabulary the AI is allowed to use (§11 whitelist rule). */
export const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
  // sources
  's', 'sound', 'note', 'n', 'stack', 'cat', 'seq', 'silence',
  // shaping
  'gain', 'pan', 'speed', 'attack', 'decay', 'sustain', 'release', 'adsr',
  'lpf', 'hpf', 'bpf', 'cutoff', 'resonance', 'shape', 'coarse', 'crush',
  'room', 'size', 'delay', 'delaytime', 'delayfeedback', 'orbit', 'vowel',
  // time
  'slow', 'fast', 'ply', 'off', 'late', 'early', 'rev', 'palindrome',
  'iter', 'chunk', 'every', 'when', 'sometimes', 'sometimesBy', 'often',
  'rarely', 'almostAlways', 'almostNever', 'degrade', 'degradeBy', 'struct',
  'euclid', 'euclidLegato', 'mask', 'segment', 'range', 'jux', 'superimpose',
  'layer', 'add', 'sub', 'mul', 'div', 'scale', 'transpose', 'legato',
  // sample handling (strudel.cc/learn/samples)
  'bank', 'begin', 'end', 'loop', 'chop', 'striate', 'clip', 'fit',
  // synth shaping (strudel.cc/learn/synths)
  'detune', 'unison', 'spread', 'penv', 'pattack', 'pdecay', 'hold', 'noise',
  'fm', 'fmh', 'fmattack', 'fmdecay', 'velocity',
  // effects (strudel.cc/learn/effects)
  'phaser', 'dry', 'postgain', 'compressor', 'distort', 'hcutoff', 'ftype',
  // documented shorthands (strudel.cc/workshop/recap)
  'dec', 'att', 'rel', 'sus', 'lpa', 'lpd', 'lps', 'lpenv', 'lpq', 'hpq', 'bpq', 'delayfb', 'delayt',
  'vib', 'vibmod', 'hurry', 'ribbon', 'punchcard',
  // chords and voicings (strudel.cc/understand/voicings)
  'voicing', 'chord', 'anchor', 'mode', 'dict', 'rootNotes', 'arp', 'arpWith',
]);

/** Characters allowed inside a mini-notation string literal. */
const STRING_CHARSET = /^[a-zA-Z0-9 ~*/<>[\],.:!@?#\-_%'|()]*$/;

export type GuardResult =
  | { ok: true; code: string }
  | { ok: false; reason: string };

const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;
const DIGIT = /[0-9]/;
const PUNCTUATION = new Set(['.', ',', '(', ')', '[', ']', '+', '-', '*', '/']);

/**
 * Validate generated Strudel source. Returns the code only when every token
 * is pattern language. Pure and synchronous — no evaluation happens here.
 */
export function guardPattern(code: string, maxLength = 600): GuardResult {
  if (typeof code !== 'string' || code.trim() === '') {
    return { ok: false, reason: 'empty pattern' };
  }
  if (code.length > maxLength) {
    return { ok: false, reason: `pattern longer than ${maxLength} characters` };
  }
  if (/[`;={}\\]/.test(code)) {
    return { ok: false, reason: 'contains disallowed syntax (`, ;, =, {, } or \\)' };
  }

  let i = 0;
  let depth = 0;
  while (i < code.length) {
    const char = code[i]!;

    if (char === ' ' || char === '\n' || char === '\t' || char === '\r') {
      i += 1;
      continue;
    }

    // String literal: only mini-notation characters may appear inside.
    if (char === '"' || char === "'") {
      const quote = char;
      const end = code.indexOf(quote, i + 1);
      if (end === -1) return { ok: false, reason: 'unterminated string' };
      const body = code.slice(i + 1, end);
      if (!STRING_CHARSET.test(body)) {
        return { ok: false, reason: `illegal characters in string "${body.slice(0, 24)}"` };
      }
      i = end + 1;
      continue;
    }

    if (DIGIT.test(char) || (char === '.' && DIGIT.test(code[i + 1] ?? ''))) {
      i += 1;
      while (i < code.length && (DIGIT.test(code[i]!) || code[i] === '.')) i += 1;
      continue;
    }

    if (IDENTIFIER_START.test(char)) {
      let j = i + 1;
      while (j < code.length && IDENTIFIER_PART.test(code[j]!)) j += 1;
      const word = code.slice(i, j);
      if (!ALLOWED_FUNCTIONS.has(word)) {
        return { ok: false, reason: `unknown identifier "${word}"` };
      }
      // An allowed word must be used as a call or a chain, never as a value
      // that could be handed somewhere else.
      const next = code.slice(j).trimStart()[0];
      if (next !== '(') {
        return { ok: false, reason: `"${word}" is not called as a function` };
      }
      i = j;
      continue;
    }

    if (PUNCTUATION.has(char)) {
      if (char === '(' || char === '[') depth += 1;
      if (char === ')' || char === ']') {
        depth -= 1;
        if (depth < 0) return { ok: false, reason: 'unbalanced brackets' };
      }
      i += 1;
      continue;
    }

    return { ok: false, reason: `illegal character "${char}"` };
  }

  if (depth !== 0) return { ok: false, reason: 'unbalanced brackets' };
  return { ok: true, code: code.trim() };
}

/** Guard a whole layer map; unsafe entries are dropped, never executed. */
export function guardPatternMap(
  patterns: Readonly<Record<string, unknown>>,
): { accepted: Record<string, string>; rejected: Array<{ layer: string; reason: string }> } {
  const accepted: Record<string, string> = {};
  const rejected: Array<{ layer: string; reason: string }> = [];
  for (const [layer, value] of Object.entries(patterns)) {
    if (typeof value !== 'string') continue;
    const result = guardPattern(value);
    if (result.ok) accepted[layer] = result.code;
    else rejected.push({ layer, reason: result.reason });
  }
  return { accepted, rejected };
}
