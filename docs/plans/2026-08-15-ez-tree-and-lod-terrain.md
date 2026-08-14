# Plan — procedural trees (ez-tree) + LOD terrain, in FREQUENCY's style

Stand: HEAD `a5263c0`, tag `vet-15aug`, 730 tests. Written 2026-08-15.

## 1. What the two sources actually are

### EZ-Tree — the Codrops article
`dgreenheck/ez-tree`, **MIT**, 1558⭐, last push 2026-07-16, npm
`@dgreenheck/ez-tree@1.1.0`. The Codrops piece *Fractals to Forests* is by the
same author and describes this exact library.

- A **parametric tree generator**: seed + ~40 parameters (branch levels, angle,
  children, gnarliness, taper, twist, sections, segments, leaf type/count/size)
  produce branch and leaf meshes.
- Ships presets: ash / aspen / oak / pine in small, medium, large, plus three
  bushes. `Tree` is a `THREE.Group` with `branchesMesh` and `leavesMesh`, and it
  can generate its own LODs.
- Zero runtime dependencies, peer dep `three >= 0.167` — we are on 0.185.
- Package is 23.9 MB unpacked, but that is textures and the demo app. The
  library build is 3.9 MB **of which 46 kB is code**; the rest is base64 bark
  and leaf images we would never load, because we do not render surfaces.

**Why it matters here:** it gives what neither hand-built primitives nor a
fixed model pack can — a *parameter space*. A world can have its own species,
and a tree can have growth stages, from the same seed.

### Procedural GL JS — procedural.eu
`felixpalmer/procedural-gl-js`, **MPL-2.0**, 1342⭐, **last push May 2021**.

- A complete **3D map engine**: camera, controls, UI, raster tile streaming,
  elevation tiles, overlays, markers.
- Its one genuinely interesting piece for us: a **GPU-driven level-of-detail
  system** for terrain — a quadtree of patches refined by screen-space error,
  which is what lets it hold a landscape all the way to the horizon at a fixed
  cost.

**Why we cannot adopt it:** it owns the camera, the controls and the render
loop. FREQUENCY's camera is a chase camera tied to flight, the terrain is the
collision surface (§35), and the whole look is signal geometry, not textured
maps. It is also five years unmaintained, and MPL-2.0 is file-level copyleft —
copying its files would put a third licence in a stack that already has an
unresolved Strudel AGPL question.

**So: take the idea, not the code.** A quadtree LOD terrain is ~200 lines
against our existing height field.

## 2. What we build

Both feed the same look: **the world is measured, drawn as points and lines,
and distance costs information** (§136).

### A. Trees from ez-tree, baked to point clouds
Keep the §137 pipeline; swap the source. `npm run trees:bake` stops downloading
a model pack and starts *generating*:

- one parameter set per world (six worlds), each a distinct species — the
  machine forest gets straight, low-gnarliness, few-leaf trees; the riot gets
  high branch counts and wild angles
- three growth stages per species (sapling / half / full) so a growth can
  visibly become what it is when its layer is earned, instead of only scaling
- deterministic: seed in, same forest out, exactly as now

The runtime keeps loading nothing but Float32 positions. ez-tree stays a
**devDependency**.

### B. Terrain with quadtree LOD
Today: one 360-unit patch, 96×192 lines, hard-faded at the edge. That is why
the world stops at the horizon.

Proposed: a quadtree of patches around the player, refined by distance, each
patch a scan-line grid at the same world density. Near patches dense, far
patches coarse, the whole thing out to ~2 km at roughly today's vertex count.

Non-negotiable (§35): the height function does not change. LOD changes only
*where the field is sampled for drawing*, never what the field is, so collision
is untouched. The parity test stays as it is and must keep passing.

### C. Style, everywhere
Points and lines only, no lit surfaces (§136.4, user decision), the six signal
states from §136.6 extended over the new far field, and distance dropping
information rather than adding fog.

## 3. Steps

| # | Step | Files | Gate |
|---|---|---|---|
| 1 | ez-tree as devDependency, generate one species headless in node | `scripts/bake-trees.mjs` | a .bin appears, base at y=0 |
| 2 | Six world parameter sets + three growth stages | `scripts/`, `public/trees/` | 18 clouds, each < 40 kB |
| 3 | Renderer picks species by world and stage by earned state | `ForestRenderer.ts` | grounded test still green |
| 4 | Quadtree LOD terrain | `WaveTerrain.ts` | §35 parity test green, vertex count within budget |
| 5 | Signal states over the far field | `WaveTerrain.ts` | far field fragments, never fogs |
| 6 | Perf + visual pass | — | fps measured before/after, screenshots |

## 4. Orchestration

Main agent (me) owns the contracts, the integration and the visual verification;
subagents work in isolated worktrees on files that do not overlap.

- **A · tree-bake** — steps 1-2. Touches `scripts/`, `public/trees/`, package.json.
- **B · terrain-lod** — step 4. Touches `WaveTerrain.ts`, `terrainField.ts`.
- **C · verifier** — read-only, adversarial: §35 CPU/GPU parity, the
  never-float rule, no lit material anywhere, perf budget, licence hygiene.

A and B cannot collide by construction. Steps 3, 5 and 6 are mine, after they
land.

## 5. Open questions for the user

See the conversation of 2026-08-15; nothing here is started before they are
answered.
