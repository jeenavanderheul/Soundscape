import { describe, expect, it, vi } from 'vitest';

vi.mock('@strudel/web', () => ({
  initStrudel: vi.fn(),
  getSuperdoughAudioController: vi.fn(),
  samples: vi.fn(async () => undefined),
}));

// The repo has no Node types, so the one filesystem call this needs is
// reached the way the other tools in these tests reach it.
declare function require(id: string): { readFileSync(p: string, enc: string): string };
const { readFileSync } = require('node:fs');
import { SOUND_INVENTORY } from '../../src/audio/soundInventory.generated';
import { SAMPLE_MAPS } from '../../src/audio/StrudelEngine';

/**
 * §113 EVERY ELEMENT HAS TO BE AUDIBLE.
 *
 * A whole class of silence hid here for a long time: the vendored library
 * covers the drum machines and nothing else, so a checkout that had run
 * `sounds:vendor` looked complete while every sample-based INSTRUMENT was
 * missing — clavisynth in four worlds, marimba and tubularbells in PERCUSSION
 * RIOT, organ_full in VOID CRUSHER. Banks loaded, voices did not, and nothing
 * failed loudly.
 *
 * These are the two guarantees that stop it coming back.
 */

/** Built into superdough — synthesised, never fetched. */
const BUILT_IN = new Set([
  'sine', 'square', 'sawtooth', 'triangle', 'supersaw', 'pulse', 'z_saw', 'z_sine',
  'white', 'pink', 'brown', 'crackle', 'bytebeat', 'sbd',
]);

const WORLD_FILES = [
  'src/audio/worlds.ts',
  'src/audio/TechnoPreset.ts',
  'src/lab/SubPressure.ts',
];

/** Every sound name the six documents ask for, banked or bare. */
function soundsUsed(): { banked: string[]; bare: string[] } {
  const src = WORLD_FILES.map((f) => readFileSync(f, 'utf8')).join('\n');
  const banked = new Set<string>();
  const bare = new Set<string>();
  for (const m of src.matchAll(/s\("([^"]+)"\)((?:\.[a-zA-Z]+\([^)]*\))*?)\.bank\("([A-Za-z0-9]+)"\)/g)) {
    for (const token of m[1]!.match(/[a-z]+/g) ?? []) {
      banked.add(`${m[3]!.toLowerCase()}_${token}`);
    }
  }
  for (const m of src.matchAll(/\.s\("([a-z_0-9]+)"\)/g)) bare.add(m[1]!);
  for (const m of src.matchAll(/s\("([a-z]+)(?:\*\d+)?"\)(?![^`]*\.bank)/g)) bare.add(m[1]!);
  return { banked: [...banked], bare: [...bare] };
}

describe('every voice the worlds ask for can actually sound', () => {
  it('names only sounds that exist', () => {
    const { banked, bare } = soundsUsed();
    const inventory = new Set(SOUND_INVENTORY);
    const unknown = [...banked, ...bare].filter(
      (name) => !inventory.has(name) && !BUILT_IN.has(name),
    );
    expect(unknown).toEqual([]);
  });

  it('asks for instruments that only the VCSL map provides', () => {
    // If this ever goes empty the guarantee below has lost its teeth: it would
    // pass while proving nothing.
    const { bare } = soundsUsed();
    const instruments = bare.filter((n) => !BUILT_IN.has(n));
    expect(instruments.length).toBeGreaterThan(0);
  });

  it('loads the instrument libraries, not only the drum machines', () => {
    // The bug was an early return that skipped these once the local drum map
    // had loaded. The engine must always reach past the first map.
    const engine = readFileSync('src/audio/StrudelEngine.ts', 'utf8');
    expect(engine).not.toContain('if (this.localSamples) return;');
    expect(SAMPLE_MAPS.some((url) => url.includes('vcsl'))).toBe(true);
    expect(engine).toContain('SAMPLE_MAPS.slice(1)');
  });
});

describe('§114 the vendored library covers every voice, offline', () => {
  const LOCAL = 'public/samples/strudel.json';

  it('holds the instruments, not only the drum machines', () => {
    const map: Record<string, unknown> = JSON.parse(readFileSync(LOCAL, 'utf8'));
    // These live in VCSL and are nested under velocity layers, which the
    // vendor script used to drop silently — all kits, no voices.
    for (const voice of ['marimba', 'tubularbells', 'organ_full', 'clavisynth']) {
      expect(`${voice}:${voice in map}`).toBe(`${voice}:true`);
    }
  });

  it('holds every machine the six documents name', () => {
    const map: Record<string, unknown> = JSON.parse(readFileSync(LOCAL, 'utf8'));
    const have = new Set(Object.keys(map).map((k) => k.toLowerCase()));
    const { banked } = soundsUsed();
    const missing = banked.filter((name) => !have.has(name));
    expect(missing).toEqual([]);
  });

  it('flattens nested entries rather than dropping them', () => {
    const script = readFileSync('scripts/vendor-samples.mjs', 'utf8');
    expect(script).toContain('collect(value)');
    // And matches case-insensitively: the maps key `RolandTR909_bd`.
    expect(script).toContain('toLowerCase()');
  });
});
