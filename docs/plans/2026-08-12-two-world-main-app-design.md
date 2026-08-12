# Two-World Main App Design

## Scope

Make Techno and SUB PRESSURE the only active worlds in the main app. Split the
ground plane into a northern Techno half and a southern SUB PRESSURE half, with
the existing neutral spawn radius and a soft transition around the east/west
boundary.

Keep the old genre implementations dormant. They must not become dominant,
appear in the HUD, be assigned to new world recipes, or start new tracks, but
retaining their code avoids destructive removal and makes future world work
incremental.

## Active world registry

Add one authoritative `ACTIVE_WORLD_GENRES` registry containing:

- `techno`
- `sub-pressure`

All surfaces that choose or expose a world read this registry or the two-world
zone assignment. Adding another active world later should require an explicit
registry change plus that world's music, look, ecology, and placement.

## World topology

The world keeps its neutral radius around spawn. Beyond it:

- headings in the northern half pull toward Techno;
- headings in the southern half pull toward SUB PRESSURE;
- headings near east and west blend both affinities smoothly.

This replaces the ten compass wedges as the active placement model. Compass
labels may remain directional, but their world label resolves to one of the two
active worlds only.

## SUB PRESSURE domain integration

Add `sub-pressure` to `TrackGenre` and `GenreAffinity`, serializers, validation,
world recipes, palettes, and forest ecology.

SUB PRESSURE uses the approved isolated graph as its musical source. Extend the
builder with a track-progression input so the main app reveals voices according
to the existing seven-layer track state:

1. texture unlock: atmosphere and transition texture
2. hats unlock: core and deep hats
3. kick unlock: core and secondary kick
4. snare unlock: snare and clap transient
5. bass unlock: sine sub
6. harmony unlock: saw body, Reese, and rave stab
7. melody unlock: clavisynth signal

The Genre Lab passes a fully unlocked track so its preset remains the complete
fourteen-voice composition. The main app passes its live `TrackState`, preserving
the gradual discovery model.

## Main audio routing

When the live track genre is SUB PRESSURE, the main graph construction path uses
`buildSubPressureGraph` instead of the generic grammar renderer. It still
receives motion, per-layer state, performance coating, tempo, and production
through the same `StrudelEngine`; no second evaluator or audio context is added.

Techno continues through the existing generic grammar path unchanged.

## Affinity and world generation

Spatial affinity may produce only Techno and SUB PRESSURE. Behavioural scoring
for dormant genres remains in source but is filtered out before dominance.

New AI world recipes may assign only active genres. Existing persisted old
world data remains readable, but inactive saved genre assignments normalize to
the two-world defaults rather than reactivating an old world.

## Visual identity

Techno keeps its machine-red look and machine forest.

SUB PRESSURE gets a darker seismic identity derived from the supplied music:

- deep near-black blue/violet colour with electric low-frequency accents;
- high relief and dense haze;
- heavy pillars, roots, shards, and low irregular motion;
- the visible name `SUB PRESSURE`.

## Testing

Test-first coverage will verify:

- the active registry contains exactly two worlds;
- north and south resolve to the correct worlds with a blended east/west border;
- no dormant genre can become spatially or behaviourally dominant;
- SUB PRESSURE is serializable and valid in world recipes;
- its seven-step ladder and progressive graph reveal the intended voices;
- the Genre Lab still renders the full preset;
- its palette, ecology, HUD label, and heading labels exist;
- all existing tests and the production build pass;
- browser verification shows only Techno and SUB PRESSURE in both relevant UI
  and runtime state.
