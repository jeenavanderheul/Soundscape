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
import { SAMPLE_MAPS, buildPatternCode, setSamplesLoaded } from '../../src/audio/StrudelEngine';
import { buildWorldLayerGraph } from '../../src/audio/WorldLayerGraph';
import { genreGrammar, regionBpm } from '../../src/audio/MusicalPrimitives';
import { createInitialMusicState } from '../../src/music/MusicState';
import { LEVEL_DEEP, createInitialTrackState } from '../../src/music/TrackState';
import type { Section } from '../../src/music/ArrangementEngine';
import type { TrackGenre } from '../../src/music/TrackState';

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
const LOCAL_MAP = 'public/samples/strudel.json';

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
  const LOCAL = LOCAL_MAP;

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

describe('§114 what the ENGINE renders is playable, offline, everywhere', () => {
  // The strongest form of the guarantee: not what the documents are written
  // with, but what actually comes out — including the voices the engine adds
  // itself (the finale, the tension engine, the production coats).
  const PHASES: Section[] = ['intro', 'groove', 'discovery', 'build', 'drop', 'deep', 'break', 'return'];
  const WORLDS: Exclude<TrackGenre, null>[] = [
    'techno', 'sub-pressure', 'heavy-signal',
    'broken-machine', 'percussion-riot', 'void-crusher',
  ];

  it.each(WORLDS)('%s can be heard in every phase, from disk alone', (genre) => {
    setSamplesLoaded(true);
    const map: Record<string, unknown> = JSON.parse(readFileSync(LOCAL_MAP, 'utf8'));
    const local = new Set(Object.keys(map).map((k) => k.toLowerCase()));
    const deep = { unlocked: true, level: LEVEL_DEEP };
    const unplayable = new Set<string>();

    for (const form of PHASES) {
      const track = {
        ...createInitialTrackState(),
        genre, form,
        bpm: regionBpm(genreGrammar(genre)),
        drums: { kick: deep, snare: deep, hats: deep },
        bass: deep, harmony: deep, melody: deep, texture: deep,
        rootMidi: 45, harmonyIntervals: [0, 3, 7, 10], melodyNotes: [69, 72, 76],
      } as ReturnType<typeof createInitialTrackState>;
      const music = { ...createInitialMusicState(), bpm: track.bpm, tempoConfidence: 0.6, dynamics: 0.5 };
      const code = buildPatternCode(
        buildWorldLayerGraph({ music, structures: [], track, patterns: {}, motion: 1, energy: 0.6 }),
        [],
      );
      for (const m of code.matchAll(/s\("([^"]+)"\)((?:\.[a-zA-Z]+\([^)]*\))*?)\.bank\("([A-Za-z0-9]+)"\)/g)) {
        for (const token of m[1]!.match(/[a-z]+/g) ?? []) {
          const name = `${m[3]!.toLowerCase()}_${token}`;
          if (!local.has(name)) unplayable.add(name);
        }
      }
      for (const m of code.matchAll(/\.s\("([a-z_0-9]+)"\)/g)) {
        if (!local.has(m[1]!) && !BUILT_IN.has(m[1]!)) unplayable.add(m[1]!);
      }
      for (const m of code.matchAll(/s\("([a-z]+)(?:\*\d+)?"\)(?!\s*\.bank)/g)) {
        if (!local.has(m[1]!) && !BUILT_IN.has(m[1]!)) unplayable.add(m[1]!);
      }
    }
    expect([...unplayable]).toEqual([]);
  });
});

describe('§115 every world shows its own layout, not role banners', () => {
  it('all six carry a section title on every voice', () => {
    setSamplesLoaded(true);
    const deep = { unlocked: true, level: LEVEL_DEEP };
    for (const genre of ['techno', 'sub-pressure', 'heavy-signal',
      'broken-machine', 'percussion-riot', 'void-crusher'] as Exclude<TrackGenre, null>[]) {
      const track = {
        ...createInitialTrackState(),
        genre, form: 'return' as const,
        bpm: regionBpm(genreGrammar(genre)),
        drums: { kick: deep, snare: deep, hats: deep },
        bass: deep, harmony: deep, melody: deep, texture: deep,
        rootMidi: 45, harmonyIntervals: [0, 3, 7, 10], melodyNotes: [69, 72, 76],
      } as ReturnType<typeof createInitialTrackState>;
      const music = { ...createInitialMusicState(), bpm: track.bpm, tempoConfidence: 0.6, dynamics: 0.5 };
      const graph = buildWorldLayerGraph({ music, structures: [], track, patterns: {}, motion: 1, energy: 0.6 });
      const voices = Object.values(graph.layers).flatMap((l) => l.primitives);
      const titled = voices.filter((p) => typeof p.parameters['section'] === 'string');
      expect(`${genre}: ${titled.length}/${voices.length}`).toBe(`${genre}: ${voices.length}/${voices.length}`);
    }
  });
});

describe('§116 the bench can scrub through the thirty-two cycles', () => {
  const graphFor = (offset: number) => {
    setSamplesLoaded(true);
    const deep = { unlocked: true, level: LEVEL_DEEP };
    const track = {
      ...createInitialTrackState(),
      genre: 'techno' as const, form: 'drop' as const, bpm: 134,
      drums: { kick: deep, snare: deep, hats: deep },
      bass: deep, harmony: deep, melody: deep, texture: deep,
      rootMidi: 45, harmonyIntervals: [0, 3, 7, 10], melodyNotes: [69, 72],
    } as ReturnType<typeof createInitialTrackState>;
    const music = { ...createInitialMusicState(), bpm: 134, tempoConfidence: 0.6, dynamics: 0.5 };
    const graph = buildWorldLayerGraph({ music, structures: [], track, patterns: {}, motion: 1, energy: 0.6 });
    graph.cycleOffset = offset;
    return buildPatternCode(graph, []);
  };

  it('parks the stack on the cycle you asked for', () => {
    // A document reads the cycle number in its masks, so the only way to hear
    // cycle 20 without waiting two minutes is to play the stack that early.
    expect(graphFor(20)).toContain('.early(20)');
    expect(graphFor(31)).toContain('.early(31)');
  });

  it('leaves the pattern untouched at the start', () => {
    expect(graphFor(0)).not.toContain('.early(');
    expect(graphFor(0).startsWith('stack(')).toBe(true);
  });

  it('changes nothing about which voices exist — only when they land', () => {
    const at = (n: number) => (graphFor(n).match(/^ {2}/gm) ?? []).length;
    expect(at(20)).toBe(at(0));
  });
});

describe('§117 no two worlds share a machine or a voice', () => {
  const WORLDS: Exclude<TrackGenre, null>[] = [
    'techno', 'sub-pressure', 'heavy-signal',
    'broken-machine', 'percussion-riot', 'void-crusher',
  ];
  const rendered = (genre: Exclude<TrackGenre, null>) => {
    setSamplesLoaded(true);
    const deep = { unlocked: true, level: LEVEL_DEEP };
    const track = {
      ...createInitialTrackState(),
      genre, form: 'return' as const, bpm: regionBpm(genreGrammar(genre)),
      drums: { kick: deep, snare: deep, hats: deep },
      bass: deep, harmony: deep, melody: deep, texture: deep,
      rootMidi: 45, harmonyIntervals: [0, 3, 7, 10], melodyNotes: [69, 72, 76],
    } as ReturnType<typeof createInitialTrackState>;
    const music = { ...createInitialMusicState(), bpm: track.bpm, tempoConfidence: 0.6, dynamics: 0.5 };
    return buildPatternCode(
      buildWorldLayerGraph({ music, structures: [], track, patterns: {}, motion: 1, energy: 0.6 }),
      [],
    );
  };

  it('every world has its own drum machines', () => {
    const owner = new Map<string, string[]>();
    for (const genre of WORLDS) {
      for (const m of new Set([...rendered(genre).matchAll(/\.bank\("([A-Za-z0-9]+)"\)/g)].map((x) => x[1]!))) {
        owner.set(m, [...(owner.get(m) ?? []), genre]);
      }
    }
    const shared = [...owner].filter(([, gs]) => gs.length > 1);
    expect(shared.map(([m, gs]) => `${m}: ${gs.join(', ')}`)).toEqual([]);
  });

  it('and its own instrument — the oscillators are shared, the voices are not', () => {
    // sine/square/saw are the raw material every electronic world is made of;
    // an INSTRUMENT is what gives a world a face.
    const OSCILLATORS = new Set(['sine', 'square', 'sawtooth', 'supersaw', 'pulse', 'triangle']);
    const owner = new Map<string, string[]>();
    for (const genre of WORLDS) {
      for (const v of new Set([...rendered(genre).matchAll(/\.s\("([a-z_0-9]+)"\)/g)].map((x) => x[1]!))) {
        if (OSCILLATORS.has(v)) continue;
        owner.set(v, [...(owner.get(v) ?? []), genre]);
      }
    }
    const shared = [...owner].filter(([, gs]) => gs.length > 1);
    expect(shared.map(([v, gs]) => `${v}: ${gs.join(', ')}`)).toEqual([]);
  });
});
