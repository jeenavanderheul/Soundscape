# SUB PRESSURE Genre Lab Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the supplied SUB PRESSURE composition as an isolated second preset in `/genres`, beside Techno.

**Architecture:** Keep the main `TrackGenre` system unchanged. Add a lab-only preset registry and a pure SUB PRESSURE graph builder whose individual guarded Strudel voices retain the supplied fixed performance values and 32-cycle masks; route the Genre Lab selector through that builder only for `sub-pressure`.

**Tech Stack:** TypeScript, Vite, Vitest, `@strudel/web`, existing `MusicalLayerGraph` and `PatternGuard` pipeline.

---

### Task 1: Expand the lab-only preset registry

**Files:**
- Modify: `src/lab/genreLabWorlds.ts`
- Modify: `tests/unit/genreLab.test.ts`

**Step 1: Write the failing test**

Change the test to require both IDs and their UI labels:

```ts
import { GENRE_LAB_PRESETS, genreLabPresetLabel } from '../../src/lab/genreLabWorlds';

it('offers Techno and SUB PRESSURE only', () => {
  expect(GENRE_LAB_PRESETS).toEqual(['techno', 'sub-pressure']);
  expect(GENRE_LAB_PRESETS.map(genreLabPresetLabel)).toEqual(['techno', 'sub pressure']);
});
```

**Step 2: Run the test and verify RED**

Run: `npm test -- tests/unit/genreLab.test.ts`

Expected: FAIL because `GENRE_LAB_PRESETS` and `genreLabPresetLabel` do not exist.

**Step 3: Implement the registry**

```ts
export type GenreLabPreset = 'techno' | 'sub-pressure';

export const GENRE_LAB_PRESETS = ['techno', 'sub-pressure'] as const satisfies readonly GenreLabPreset[];

export function genreLabPresetLabel(preset: GenreLabPreset): string {
  return preset === 'sub-pressure' ? 'sub pressure' : preset;
}
```

**Step 4: Run the test and verify GREEN**

Run: `npm test -- tests/unit/genreLab.test.ts`

Expected: 1 test passes.

**Step 5: Commit only these files**

```bash
git add src/lab/genreLabWorlds.ts tests/unit/genreLab.test.ts
git commit -m "feat: add SUB PRESSURE lab preset"
```

### Task 2: Build the guarded SUB PRESSURE graph

**Files:**
- Create: `src/lab/SubPressure.ts`
- Create: `tests/unit/subPressure.test.ts`

**Step 1: Write failing graph tests**

Mock `@strudel/web` as in `tests/unit/trackDepth.test.ts`, then assert the pure graph and rendered code:

```ts
const graph = buildSubPressureGraph();
const code = buildPatternCode(graph);

expect(graph.bpm).toBeCloseTo(141.3);
expect(trackParts(graph)).toHaveLength(14);
expect(code).toContain('s("hh ~ hh [hh hh] ~ hh ~ [hh hh]").bank("EmuSP12")');
expect(code).toContain('s("bd ~ bd ~ ~ bd [bd ~] ~").bank("AkaiMPC60")');
expect(code).toContain('note("~ c1 ~ c1 ~ ~ bb0 db1").s("sine")');
expect(code).toContain('note("~ c2 ~ c2 ~ ~ bb1 db2").s("sawtooth")');
expect(code).toContain('note("<~ [c3,db3,g3] ~ ~ ~ [bb2,db3,gb3] ~ ~>").s("square")');
expect(code).toContain('s("bytebeat").slow(2).bpf(1300).crush(5)');
```

Assert the complete unique mask set:

```ts
for (const mask of [
  '<1!24 0!4 1!4>', '<0!8 1!16 0!4 1!4>',
  '<0!4 1!20 0!4 1!4>', '<0!12 1!12 0!4 1!4>',
  '<0!16 1!8 0!4 1!4>', '<0!20 1!4 0!4 1!4>',
  '<0!15 1 0!15 1>',
]) expect(code).toContain(`mask("${mask}")`);
```

Add a motion/mix assertion:

```ts
expect(buildPatternCode(buildSubPressureGraph({ motion: 0 }))).toContain('.gain(0)');
expect(buildPatternCode(buildSubPressureGraph({ mix: { bass: 0.5 } })))
  .toContain('.gain(.4865)');
```

**Step 2: Run the test and verify RED**

Run: `npm test -- tests/unit/subPressure.test.ts`

Expected: FAIL because `src/lab/SubPressure.ts` does not exist.

**Step 3: Implement the graph builder**

Create a pure module with:

```ts
export interface SubPressureControls {
  motion?: number;
  mix?: Partial<Record<LayerName, number>>;
}

const ALT = 0.55;
const WIND = 0.85;
const EDGE = 0.65;
export const SUB_PRESSURE_BPM = 138 + ALT * 6;

export function buildSubPressureGraph(controls: SubPressureControls = {}): MusicalLayerGraph {
  const graph = createEmptyLayerGraph(SUB_PRESSURE_BPM);
  const motion = clamp01(controls.motion ?? 1);
  const voice = (
    id: string,
    kind: PrimitiveKind,
    layer: LayerName,
    code: string,
  ): MusicalPrimitive => ({
    id,
    kind,
    layer,
    parameters: { code },
    allowedTransforms: [],
  });
  const gain = (layer: LayerName, value: number): string =>
    formatGain(value * motion * Math.max(0, controls.mix?.[layer] ?? 1));

  graph.layers.atmosphere.primitives = [
    voice('sub-pressure-atmosphere', 'texture', 'atmosphere',
      `s("brown").clip(1).lpf(645).gain(${gain('atmosphere', 0.05625)}).room(.8).orbit(3)`),
    voice('sub-pressure-rise', 'texture', 'atmosphere',
      `s("white").clip(1).hpf(3500).attack(.4).release(.3).room(.55).gain(${gain('atmosphere', 0.09)}).mask("<0!15 1 0!15 1>")`),
  ];
```

Populate the remaining layers as individual voices using the supplied source
and these precomputed fixed values:

- hats: HPF 7410, gain 0.1525; deep degrade 0.4525, gain 0.04125
- kick: shape 0.4125, distort 0.59, gain 1.022; secondary gain 0.225
- snare: shape 0.337, distort 0.3775, gain 0.822; transient gain 0.1755
- sub: gain 0.973
- body: LPF 379, LPQ 10.6, distort 2.21, gain 0.522
- Reese: LPF 865, distort 2.575, gain 0.172
- stab: LPF 1130, distort 0.855, gain 0.144
- signal: distort 0.625, gain 0.06125
- texture: distort 1.15, gain 0.02775

Assign the supplied mask to every corresponding voice. Return `graph` with no
new runtime or evaluator path.

**Step 4: Run the test and verify GREEN**

Run: `npm test -- tests/unit/subPressure.test.ts`

Expected: all SUB PRESSURE tests pass and every pattern passes `PatternGuard` through `buildPatternCode`.

**Step 5: Commit only the graph and its tests**

```bash
git add src/lab/SubPressure.ts tests/unit/subPressure.test.ts
git commit -m "feat: build SUB PRESSURE lab graph"
```

### Task 3: Route the Genre Lab UI to the new graph

**Files:**
- Modify: `src/lab/genreLab.ts`
- Modify: `tests/unit/genreLab.test.ts`

**Step 1: Write the failing routing test**

Extract and test a pure preset builder from `genreLab.ts` only if needed;
prefer exporting this small function from `genreLabWorlds.ts` to avoid DOM setup:

```ts
expect(isTrackGenrePreset('techno')).toBe(true);
expect(isTrackGenrePreset('sub-pressure')).toBe(false);
```

**Step 2: Run the test and verify RED**

Run: `npm test -- tests/unit/genreLab.test.ts`

Expected: FAIL because `isTrackGenrePreset` does not exist.

**Step 3: Implement routing**

In `genreLab.ts`:

- replace `genre` with `preset: GenreLabPreset`;
- render `GENRE_LAB_PRESETS` using `genreLabPresetLabel`;
- when `preset === 'sub-pressure'`, call `buildSubPressureGraph` with current
  motion and per-layer mix values;
- otherwise keep the existing Techno `finishedTrack` → `buildLayerGraph` path;
- apply the existing performance and BPM ratio after either branch;
- use `sub pressure · 141 bpm · EmuSP12 / AkaiMPC60` in the status line;
- leave the generic section value untouched but ignore it in the SUB PRESSURE branch.

**Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/unit/genreLab.test.ts tests/unit/subPressure.test.ts tests/unit/trackDepth.test.ts`

Expected: all focused tests pass.

**Step 5: Commit only the routing files**

```bash
git add src/lab/genreLab.ts src/lab/genreLabWorlds.ts tests/unit/genreLab.test.ts
git commit -m "feat: play SUB PRESSURE in genre lab"
```

### Task 4: Full verification and browser handoff

**Files:**
- No production changes unless verification reveals a regression.

**Step 1: Verify formatting and diff scope**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intended files and the user's pre-existing Techno changes are listed.

**Step 2: Run the complete test suite**

Run: `npm test`

Expected: all tests pass.

**Step 3: Run the production build**

Run: `npm run build`

Expected: exit 0. Existing Vite, chunk-size, and dependency warnings may remain; no TypeScript or build errors.

**Step 4: Verify `/genres` in the browser**

Reload `http://127.0.0.1:5174/genres/` and confirm:

- exactly `techno` and `sub pressure` appear as preset buttons;
- selecting SUB PRESSURE changes the pressed state;
- pressing play produces rendered source containing `AkaiMPC60`, `EmuSP12`,
  `bytebeat`, and the supplied masks;
- no console errors appear.

**Step 5: Final review**

Review the diff for accidental changes to `TrackGenre`, world zones,
persistence, affinities, or main-game rendering. None are allowed by the
approved scope.
