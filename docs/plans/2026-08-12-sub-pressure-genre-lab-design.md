# SUB PRESSURE Genre Lab Design

## Scope

Add SUB PRESSURE as a second isolated preset in `/genres`, next to Techno.
Do not add it to `TrackGenre`, the world map, affinities, persistence, AI
recipes, rendering palettes, or the main game.

## Architecture

The Genre Lab gets its own preset identifier type with `techno` and
`sub-pressure`. Techno continues through the existing finished-track grammar.
SUB PRESSURE uses a dedicated pure graph builder that returns a
`MusicalLayerGraph` made from guarded Strudel primitives.

This keeps the supplied composition intact without pretending it is one of the
main game's worlds. The existing `StrudelEngine` remains the only component
that evaluates Strudel source.

## Composition mapping

The builder uses the supplied fixed performance values:

- `ALT = 0.55`
- `WIND = 0.85`
- `EDGE = 0.65`
- `SEED = 1301`
- tempo: `(138 + ALT * 6) = 141.3 BPM`

The voices map to graph layers as follows:

- atmosphere: brown machine-room bed and transition riser
- drums: hats, deep hats, kick, secondary punch, snare, clap transient
- bass: sine sub, saw body, square Reese response
- harmony: square rave stab
- melody: clavisynth signal
- texture: bytebeat pressure

Every voice retains its supplied 32-cycle mask. Those masks own the arrangement
for this preset, so the generic section selector does not alter SUB PRESSURE.

## Controls

The preset selector shows `techno` and `sub pressure`.

The mix, motion, and tempo controls continue to work. Bare-parts mode removes
the Genre Lab's general performance coating so the supplied composition can be
heard directly. The fixed ALT, WIND, and EDGE values remain part of the preset;
the existing flight controls do not rewrite them.

## Safety and error handling

Each authored pattern crosses the existing `PatternGuard` boundary before
evaluation. Patterns are split into individual voices so they stay small,
reviewable, and below the guard length limit. Invalid source fails through the
existing Strudel fallback behavior; no new evaluation path is introduced.

## Testing

Test-first coverage will verify:

- the Genre Lab exposes exactly Techno and SUB PRESSURE;
- the SUB PRESSURE graph has the expected BPM and layer voices;
- defining machines and figures are present;
- every supplied 32-cycle mask is present;
- Techno output remains unchanged;
- the full test suite and production build pass;
- `/genres` renders both preset buttons without browser errors.
