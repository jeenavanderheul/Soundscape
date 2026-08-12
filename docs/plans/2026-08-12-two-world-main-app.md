# Two-World Main App Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Techno and SUB PRESSURE the only active worlds in the main app, split across northern and southern halves, while keeping dormant genre code available for future reactivation.

**Architecture:** Introduce one active-world registry, add `sub-pressure` to the domain types and required records, replace ten active compass wedges with a soft two-half affinity model, and route live SUB PRESSURE tracks through the progressive custom graph. Existing inactive grammars remain compiled but are filtered from dominance, recipes, and new world state.

**Tech Stack:** TypeScript, Vite, Vitest, Three.js world rendering, existing TrackBuilder, GenreAffinityEngine, StrudelEngine, serializer, and AI recipe validation.

---

### Task 1: Add the active-world domain registry

**Files:**
- Create: `src/genres/ActiveWorlds.ts`
- Modify: `src/music/MusicState.ts`
- Modify: `src/music/TrackState.ts`
- Modify: `src/audio/MusicalPrimitives.ts`
- Modify: test affinity literals reported by TypeScript
- Create: `tests/unit/activeWorlds.test.ts`

**Step 1: Write failing registry tests**

```ts
import { ACTIVE_WORLD_GENRES, isActiveWorldGenre } from '../../src/genres/ActiveWorlds';

it('activates only Techno and SUB PRESSURE', () => {
  expect(ACTIVE_WORLD_GENRES).toEqual(['techno', 'sub-pressure']);
  expect(isActiveWorldGenre('techno')).toBe(true);
  expect(isActiveWorldGenre('sub-pressure')).toBe(true);
  expect(isActiveWorldGenre('ambient')).toBe(false);
});
```

**Step 2: Run and verify RED**

Run: `npm test -- tests/unit/activeWorlds.test.ts`

Expected: FAIL because `ActiveWorlds.ts` does not exist.

**Step 3: Implement the domain additions**

Add `sub-pressure: number` to `GenreAffinity`, `'sub-pressure'` to `GENRE_NAMES`,
and `'sub-pressure'` to `TrackGenre`.

Create:

```ts
export const ACTIVE_WORLD_GENRES = ['techno', 'sub-pressure'] as const;
export type ActiveWorldGenre = (typeof ACTIVE_WORLD_GENRES)[number];

export function isActiveWorldGenre(value: unknown): value is ActiveWorldGenre {
  return typeof value === 'string' && ACTIVE_WORLD_GENRES.includes(value as ActiveWorldGenre);
}
```

Add `sub-pressure` metadata to the exhaustive grammar and throw records. Its
grammar has 141.3 BPM, AkaiMPC60/EmuSP12/OberheimDMX machines, driven section
style, layer energy style, and mix values matching the approved preset. The
generic grammar is metadata/fallback only; live audio uses `SubPressure.ts`.

Add `sub-pressure: 0` to all complete `GenreAffinity` literals surfaced by
`npm run build`. Do not remove dormant keys.

**Step 4: Verify GREEN and type completeness**

Run: `npm test -- tests/unit/activeWorlds.test.ts && npm run build`

Expected: registry test passes and TypeScript reports no missing exhaustive keys.

**Step 5: Commit**

```bash
git add src/genres/ActiveWorlds.ts src/music/MusicState.ts src/music/TrackState.ts \
  src/audio/MusicalPrimitives.ts tests
git commit -m "feat: register Techno and SUB PRESSURE worlds"
```

### Task 2: Replace compass wedges with two soft world halves

**Files:**
- Modify: `src/genres/GenreZones.ts`
- Modify: `src/genres/GenreAffinityEngine.ts`
- Modify: `src/genres/ZonePalette.ts`
- Modify: `tests/unit/worldTravel.test.ts`
- Modify: `tests/unit/zonePalette.test.ts`
- Modify: `tests/unit/technoProfile.test.ts`

**Step 1: Write failing topology tests**

Replace the ten-world expectations with:

```ts
expect(regionFlying({ x: 0, z: -120 }, COMPASS.N)).toBe('techno');
expect(regionFlying({ x: 0, z: -120 }, COMPASS.NNE)).toBe('techno');
expect(regionFlying({ x: 0, z: 120 }, COMPASS.S)).toBe('sub-pressure');
expect(regionFlying({ x: 0, z: 120 }, COMPASS.SSW)).toBe('sub-pressure');
```

At the east/west border assert both affinities are non-zero and neither dormant
genre has affinity:

```ts
const border = zoneAffinity({ x: 120, y: 6, z: 0 }, Math.PI / 2);
expect(border.techno).toBeGreaterThan(0);
expect(border['sub-pressure']).toBeGreaterThan(0);
expect(border.ambient).toBe(0);
expect(border.bass).toBe(0);
```

Add a GenreAffinityEngine test proving a strong dormant behavioural score cannot
be dominant when active-world filtering is applied.

**Step 2: Run and verify RED**

Run: `npm test -- tests/unit/worldTravel.test.ts tests/unit/zonePalette.test.ts tests/unit/technoProfile.test.ts`

Expected: old ten-zone assertions fail and SUB PRESSURE is absent.

**Step 3: Implement the two-half model**

Keep `ZONE_CONFIG.neutralRadius`. Beyond it, derive north/south weights from the
heading's north component:

```ts
const northness = Math.cos(heading);
const blendWidth = 0.25;
const techno = clamp01((northness + blendWidth) / (blendWidth * 2));
const subPressure = 1 - techno;
affinity.techno = influence * techno;
affinity['sub-pressure'] = influence * subPressure;
```

This yields dominant halves and a soft east/west transition. Make `zoneGenres`
and `headingLabel` report Techno for northern compass points and SUB PRESSURE for
southern points only. `setZoneGenres` may accept only active genres.

Filter GenreAffinityEngine raw and smoothed dominance to
`ACTIVE_WORLD_GENRES`; set dormant raw values to zero before smoothing and choose
dominance only from active entries.

**Step 4: Verify GREEN**

Run the three focused test files again.

Expected: the two-half, border, HUD, and active-dominance assertions pass.

**Step 5: Commit**

```bash
git add src/genres/GenreZones.ts src/genres/GenreAffinityEngine.ts \
  src/genres/ZonePalette.ts tests/unit/worldTravel.test.ts \
  tests/unit/zonePalette.test.ts tests/unit/technoProfile.test.ts
git commit -m "feat: split world between Techno and SUB PRESSURE"
```

### Task 3: Make SUB PRESSURE a progressive main-app track

**Files:**
- Modify: `src/lab/SubPressure.ts`
- Modify: `src/music/GenreLadder.ts`
- Modify: `tests/unit/subPressure.test.ts`
- Modify: `tests/unit/genreGrammar.test.ts`

**Step 1: Write failing progression tests**

Add a `track?: TrackState` option to the wished-for API and assert layer growth:

```ts
const empty = createInitialTrackState();
empty.genre = 'sub-pressure';
expect(trackParts(buildSubPressureGraph({ track: empty }))).toHaveLength(0);

empty.texture = { unlocked: true, level: 1 };
expect(ids(buildSubPressureGraph({ track: empty }))).toEqual([
  'sub-pressure-atmosphere', 'sub-pressure-rise', 'sub-pressure-texture',
]);

empty.drums.hats = { unlocked: true, level: 1 };
expect(ids(buildSubPressureGraph({ track: empty }))).toContain('sub-pressure-hats');
```

Continue for kick, snare, bass (sub only), harmony (body, Reese, stab), and
melody (signal). Keep the no-track Genre Lab assertion at fourteen voices.

Assert the ladder order:

```ts
expect(GENRE_LADDERS['sub-pressure'].map((step) => step.layer)).toEqual([
  'texture', 'hats', 'kick', 'snare', 'bass', 'harmony', 'melody',
]);
```

**Step 2: Run and verify RED**

Run: `npm test -- tests/unit/subPressure.test.ts tests/unit/genreGrammar.test.ts`

Expected: FAIL because graph controls have no track and the ladder is missing.

**Step 3: Implement minimal progressive filtering**

Add `track?: Readonly<TrackState>` to `SubPressureControls`. When absent, include
all fourteen voices for Genre Lab. When present, gate voice arrays by the mapping
in the approved design. Do not duplicate pattern source.

Add the SUB PRESSURE ladder with timings consistent with the existing journey:
texture 3s, hats 7s, kick 11s, snare 15s, bass 20s, harmony 27s, melody 35s.

**Step 4: Verify GREEN**

Run the two focused test files again.

Expected: all progression and existing full-preset tests pass.

**Step 5: Commit**

```bash
git add src/lab/SubPressure.ts src/music/GenreLadder.ts \
  tests/unit/subPressure.test.ts tests/unit/genreGrammar.test.ts
git commit -m "feat: grow SUB PRESSURE through its main-app ladder"
```

### Task 4: Route live SUB PRESSURE tracks through the custom graph

**Files:**
- Modify: `src/app/Game.ts`
- Create or modify: `tests/unit/audioChain.integration.test.ts`

**Step 1: Write a failing pure routing test**

Extract a small pure function if necessary so the test can assert:

```ts
const graph = buildWorldLayerGraph({ ...inputs, track: subPressureTrack });
expect(buildPatternCode(graph)).toContain('AkaiMPC60');
expect(buildPatternCode(graph)).toContain('bytebeat');

const techno = buildWorldLayerGraph({ ...inputs, track: technoTrack });
expect(buildPatternCode(techno)).toContain('RolandTR909');
```

**Step 2: Run and verify RED**

Run the new/focused integration test.

Expected: SUB PRESSURE still routes through generic `buildLayerGraph`.

**Step 3: Implement routing**

In `Game.updateStrudelGraph`, branch on `track.genre === 'sub-pressure'` and call
`buildSubPressureGraph({ track, motion: this.motionLevel })`; otherwise keep the
existing `buildLayerGraph` call. Apply performance, tempo ratio, variations,
diffing, and beat/bar boundary logic after the branch exactly once.

Update the status bank label for SUB PRESSURE to `EmuSP12 / AkaiMPC60` rather
than relying on a single generic grammar bank.

**Step 4: Verify GREEN**

Run the focused integration test plus `tests/unit/trackBuilder.test.ts`.

Expected: both worlds produce their intended source and existing routing passes.

**Step 5: Commit**

```bash
git add src/app/Game.ts tests/unit/audioChain.integration.test.ts
git commit -m "feat: play SUB PRESSURE in the main app"
```

### Task 5: Add visuals, persistence, and active AI recipes

**Files:**
- Modify: `src/genres/ZonePalette.ts`
- Modify: `src/rendering/ForestEcology.ts`
- Modify: `src/persistence/WorldSerializer.ts`
- Modify: `src/ai/WorldRecipe.ts`
- Modify: `src/ai/WorldPromptClient.ts`
- Modify: `tests/unit/zonePalette.test.ts`
- Modify: `tests/unit/forestEcology.test.ts`
- Modify: `tests/unit/worldSerializer.test.ts`
- Modify: `tests/unit/aiWorldPrompt.test.ts`

**Step 1: Write failing boundary tests**

Assert:

- `GENRE_LOOKS['sub-pressure']` is dark, high-relief, and distinct from Techno;
- `ECOLOGIES['sub-pressure'].name === 'SUB PRESSURE FOREST'` and uses heavy
  pillar/root/shard growth;
- serialized SUB PRESSURE snapshots and tracks round-trip;
- inactive saved dominant genres normalize to `null` or an active zone default;
- recipe schema enums contain exactly `techno` and `sub-pressure`;
- invalid/dormant recipe zones fall back by hemisphere: northern fields to
  Techno, southern fields to SUB PRESSURE.

**Step 2: Run and verify RED**

Run the four focused test files.

Expected: missing record entries and old recipe enums fail.

**Step 3: Implement the boundaries**

Add the approved visual identity. Add `sub-pressure` to serializer affinity and
track validation. Use `isActiveWorldGenre` when accepting dominant/new zone
values so dormant data remains readable but cannot reactivate a world.

Make WorldRecipe's genre enum derive from `ACTIVE_WORLD_GENRES`, and replace its
ten defaults with the north/south active assignment. Update the model prompt to
describe only the two currently active worlds.

**Step 4: Verify GREEN**

Run the four focused test files and `npm run build`.

Expected: all boundary tests pass and TypeScript exhaustive records are complete.

**Step 5: Commit**

```bash
git add src/genres/ZonePalette.ts src/rendering/ForestEcology.ts \
  src/persistence/WorldSerializer.ts src/ai/WorldRecipe.ts \
  src/ai/WorldPromptClient.ts tests
git commit -m "feat: give SUB PRESSURE a persistent world identity"
```

### Task 6: Full regression, browser verification, and branch completion

**Files:**
- No production changes unless verification exposes a defect.

**Step 1: Static scope review**

Run: `git diff main...HEAD --check && git status --short`

Confirm dormant genre source still exists but `ACTIVE_WORLD_GENRES`, recipe
enums, spatial affinity, and dominance expose only the two active worlds.

**Step 2: Complete tests**

Run: `npm test`

Expected: all tests pass.

**Step 3: Production build**

Run: `npm run build`

Expected: exit 0; only documented pre-existing Vite/dependency warnings.

**Step 4: Browser verification**

Run the feature worktree on a free localhost port. Verify:

- `/genres` has exactly Techno and SUB PRESSURE;
- the main app HUD reports only `techno`, `sub pressure`, or `the void`;
- travelling north and south changes the visible world identity accordingly;
- SUB PRESSURE source contains its AkaiMPC60 kick, sine sub, and bytebeat;
- no browser console errors occur.

**Step 5: Finish the feature branch**

Invoke `finishing-a-development-branch`, present merge/keep/discard options, and
only integrate after the user chooses.
