import { describe, expect, it, vi } from 'vitest';

// Vite serves the file as a string; no node types needed for a browser project.
import registrySource from '../../node_modules/@strudel/soundfonts/gm.mjs?raw';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

import { SOUNDFONT_VOICES } from '../../src/audio/StrudelEngine';

/**
 * §75: the GM instruments come from a registry, not from our sample maps, so
 * the §38 audit cannot see them. This is their audit.
 *
 * The registry is READ FROM THE PACKAGE SOURCE rather than imported: importing
 * it pulls in a browser-only dependency that cannot load under Node. Reading
 * the file still checks the real thing — the names the package will register.
 */
const REGISTRY = new Set(
  [...(registrySource as string).matchAll(/\bgm_[a-z0-9_]+/g)].map((match) => match[0]),
);

describe('§75 every soundfont voice we allow really exists', () => {
  it('matches the registry the package ships', () => {
    expect(REGISTRY.size).toBeGreaterThan(100);
    const missing = [...SOUNDFONT_VOICES].filter((name) => !REGISTRY.has(name));
    expect(missing, 'these would be silence, not an error (§38)').toEqual([]);
  });

  it('covers the families our sample maps do not have', () => {
    for (const name of [
      'gm_violin', 'gm_string_ensemble_1', 'gm_trumpet', 'gm_flute',
      'gm_electric_guitar_jazz', 'gm_church_organ',
    ]) {
      expect(SOUNDFONT_VOICES.has(name), name).toBe(true);
    }
  });

  it('is a short, deliberate list — not the whole registry', () => {
    expect(SOUNDFONT_VOICES.size).toBeLessThan(60);
  });
});
