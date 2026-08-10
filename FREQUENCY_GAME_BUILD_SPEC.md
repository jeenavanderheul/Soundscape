# FREQUENCY

## AI Coding Agent Master Build Specification

> **For the coding agent:** this file is the normative product, architecture and implementation source. Read it completely before changing code. Build one milestone at a time. Do not change non-negotiable product rules or the locked stack without explicit approval.

**Goal:** build an explorable musical instrument disguised as a fully 3D world.  
**Architecture:** player input changes typed frequency and music state. A resonance engine derives shared music/world events. Strudel generates patterns, native Web Audio handles playback, spatialization and analysis, and Three.js turns the same musical causes into form.  
**Locked MVP stack:** TypeScript, Vite, Three.js, GLSL, `@strudel/web`, native Web Audio, custom typed stores/event bus, IndexedDB/localStorage.  
**Primary payoff:** “Holy shit, I made this music myself.”

---

## 0. Non-negotiable product principle

FREQUENCY is not “a 3D world with generative music.”

FREQUENCY is **music generating a 3D world**.

```text
PLAYER
  ↕
MUSIC
  ↕
WORLD
```

The canonical loop is:

```text
SOUND ⇄ FORM
```

Every meaningful player action must create a musical consequence. Every important musical event must create a perceivable visual or spatial consequence. Never add a visual object only because it looks good. Never add a musical element only because it sounds good. Both need a systemic relationship.

When forced to choose between graphical fidelity and stable musical timing, choose stable musical timing.

---

## 1. High-level concept

The player does not control a human, bird, spaceship or conventional avatar. The player **is a frequency**, physically manifested as wind.

The player is represented through:

- particles and waveform trails;
- wind, ripples and interference;
- spatial distortion and light;
- deformation of nearby geometry;
- audible pitch, amplitude, movement and resonance.

The experience starts inside an almost empty sonic void. Movement changes sound. Waves meet other waves. Repeated interaction creates resonance and interference. Stable resonance becomes form. Form becomes a world. Genres emerge from the musical behavior of that world. Eventually the player realizes:

> I am not discovering a pre-existing world. I am composing it.

### Experience arc

```text
SINGLE TONE → MOVEMENT → COLLISION → INTERFERENCE → RESONANCE
→ FORM → WORLD → MUSICAL ELEMENTS → GENRE EMERGENCE
→ GENRE HYBRIDIZATION → COMPOSITION → PERSONAL SONIC WORLD
```

There is no XP, score, health, enemy, game-over or conventional failure state. Curiosity, listening and experimentation are progression.

---

## 2. Design pillars

### P1 — Sound is the waypoint

Remote resonators are found primarily through spatial audio. Do not use minimap waypoints, quest arrows or floating icons. Optional visual assistance exists for accessibility, but is secondary by default.

### P2 — The world is the instrument

Frequency, amplitude, phase, waveform, movement, duration and resonance are world-building actions, not decorative audio controls.

### P3 — Genres are attractors, not levels

Techno, Ambient, Jazz, Drum & Bass and Experimental are not menu choices, portals or pre-authored levels. They emerge from the current musical state, can overlap, and influence how the world organizes itself.

### P4 — Safe creativity with legible causality

The game constrains ranges, transitions and pattern transforms so experimentation remains musically useful. The player must still understand what they caused.

### P5 — One shared event drives music and form

A `ResonanceEvent` must drive both audio and visual/world responses. Never generate unrelated parallel reactions.

### P6 — Reveal control gradually

The beginning is mostly listening and discovery. The end is deliberate composition. The game moves from approximately 90% world / 10% control to 30% world / 70% control without exposing a traditional DAW.

---

## 3. The eleven elements of music are the physics system

The following elements are physical laws, not UI sliders.

### 3.1 Pitch = space and scale

Low frequencies produce mass, large geometry, slow motion and sparse structures. High frequencies produce detail, particles, fine geometry and sharper events. Use logarithmic, smoothed mapping rather than literal 1:1 Hz mapping.

```text
20–80 Hz      → enormous mass / terrain / monoliths
80–300 Hz     → medium structures
300 Hz–2 kHz  → surface and moving detail
2–8 kHz       → particles / edges
8 kHz+        → air / sparks / shimmer
```

### 3.2 Dynamics = force and sensitivity

Amplitude controls interaction strength, displacement and loudness. High amplitude creates strong deformation; low amplitude can reveal delicate resonances unavailable at high force. Louder is not automatically better.

### 3.3 Rhythm = repetition

Repeated pulses or collisions build rhythmic confidence. Unstable timing remains expressive at first. As regularity rises, the system gradually remembers and quantizes the pattern.

### 3.4 Tempo = world clock

Tempo is inferred from repeated behavior using temporal averaging and confidence. Once stable, BPM synchronizes Strudel, object motion, shaders, particles and world pulses. One anomalous input must never cause an abrupt tempo jump.

### 3.5 Melody = remembered movement through pitch

Movement through pitch space becomes a pitch history. Recurring trajectories become melodic phrases and leave visible trails.

### 3.6 Harmony = connection

Compatible frequency relationships stabilize and connect structures. Dissonance creates deformation, asymmetry and tension. Dissonance is creative material, not failure.

### 3.7 Timbre = matter

| Timbre | Matter tendency |
|---|---|
| Sine | Glass, liquid, soft light, smooth forms |
| Triangle | Faceted but soft structures |
| Square | Digital, blocky, pixel, rigid geometry |
| Saw | Metallic, sharp, spiked surfaces |
| Noise | Fog, dust, particles, unstable matter |
| Sample-based | Complex organic or hybrid material |

### 3.8 Duration = memory

Short sounds create sparks and ripples. Medium sounds create temporary objects. Long sounds create architecture and persistent world structures. The longer a sound remains stable, the more physically persistent it may become.

### 3.9 Meter = spatial gravity

Meter influences grouping, spacing and recurring motion. 4/4 tends toward stable grids, 3/4 toward circular/triangular motion, irregular meters toward asymmetric repetition. Avoid overly literal visualization.

### 3.10 Texture = world complexity

Monophony produces sparse clear space. Homophony produces a primary form with support. Polyphony produces independent systems, dense ecologies and more complex particles.

### 3.11 Form = world structure over time

Form tracks large-scale phases such as void, intro, build, peak, break, return and mutation. Musical form changes region layout and persistence. Form is the architecture of the world across time.

### Global visual grammar

```text
LOW FREQUENCY → MASS              HIGH FREQUENCY → DETAIL
AMPLITUDE → FORCE/DISPLACEMENT    RHYTHM → REPETITION
TEMPO → MOVEMENT SPEED            HARMONY → CONNECTION/SYMMETRY
DISSONANCE → DEFORMATION          TIMBRE → MATERIAL
DURATION → PERSISTENCE            METER → SPATIAL GROUPING
TEXTURE → DENSITY                 FORM → WORLD ARCHITECTURE
```

This grammar is global. Genre attractors may style it, but may not contradict it.

---

## 4. Core loop and first-ten-minute emergence

```text
LISTEN → LOCATE → MOVE → COLLIDE → RESONATE
   ↑                                      ↓
COMPOSE ← REPEAT ← OBSERVE FORM ← INTERFERE
```

The first ten minutes must expose this causal sequence:

1. one controllable tone;
2. movement changes the sound;
3. a remote resonator is located by listening;
4. the waves meet;
5. a `ResonanceEvent` changes both audio and visuals;
6. persistent interference creates a form;
7. repeated behavior becomes a pattern;
8. the player recognizes: “I made that.”

Do not add genre content until this chain is emotionally clear.

---

## 5. Controls and movement-to-music mapping

### Desktop MVP controls

| Input | Action | Musical meaning |
|---|---|---|
| Mouse | Look / wind direction | Spatial focus and direction |
| WASD | Move in 3D | Energy, spatial phrase and collision path |
| Mouse wheel | Shift frequency focus | Pitch/frequency space |
| Left mouse hold | Build wind/amplitude | Force and sensitivity |
| Left mouse release | Release pulse | Timed excitation event |
| Shift | Accelerate | Energy and event density |
| Space | Resonance pulse | Broad wave interaction |
| Right mouse | Optional resonance focus | Narrow listening/interaction cone |
| Esc | Pause/settings | Audio, controls and accessibility |

Exact bindings may change after playtesting. Do not overbind the player. Essential controls must be remappable before public release.

### Movement model

- Use vector acceleration, drag and maximum speed. No physics engine in MVP.
- The player has a wave/interaction radius, not a visible collision mesh.
- “Collision” means wave meets wave; use distance, phase and frequency relations.
- Camera motion must remain comfortable. Avoid strong roll, head bob and unrequested shake.

### Continuous mappings

Raw input must be smoothed, rate-limited and constrained before it reaches music.

| Source | Derived parameter | Rule |
|---|---|---|
| Frequency focus | `hz`, pitch center | logarithmic mapping |
| Wind hold | amplitude | bounded with attack/release smoothing |
| Speed | energy/density | no pattern recompilation per frame |
| Acceleration | transient strength | threshold + cooldown |
| Trajectory | melody history | sample at a musical/control rate |
| Repetition timing | BPM/regularity | confidence-weighted averaging |
| Distance | spatial gain/filter | perceptually useful falloff |
| Phase/frequency ratio | consonance/dissonance | simplified perceptual model |
| Duration | persistence | threshold bands, not unlimited growth |

---

## 6. Typed state model

Rendering code must not bind directly to input events. Input updates typed state; systems consume snapshots and emit discrete events.

```ts
export type Waveform = 'sine' | 'triangle' | 'square' | 'saw' | 'noise';

export interface Vec3Data {
  x: number;
  y: number;
  z: number;
}

export interface FrequencyState {
  hz: number;
  amplitude: number;
  waveform: Waveform;
  phase: number;
  velocity: number;
  position: Vec3Data;
  direction: Vec3Data;
  resonance: number;
  stability: number;
  energy: number;
}

export type FormPhase =
  | 'void' | 'intro' | 'build' | 'peak'
  | 'break' | 'return' | 'mutation';

export interface MusicState {
  bpm: number;
  tempoConfidence: number;
  pitchCenter: number;
  pitchSpread: number;
  dynamics: number;
  rhythmDensity: number;
  rhythmicRegularity: number;
  syncopation: number;
  durationAverage: number;
  harmonicComplexity: number;
  dissonance: number;
  melodicActivity: number;
  timbreBrightness: number;
  timbreNoise: number;
  meterConfidence: number;
  meter?: string;
  textureDensity: number;
  spatiality: number;
  repetition: number;
  variation: number;
  lowEndEnergy: number;
  transientDensity: number;
  formPhase: FormPhase;
}

export interface GenreAffinity {
  techno: number;
  ambient: number;
  jazz: number;
  dnb: number;
  experimental: number;
}
```

State contains only serializable primitives and plain objects. Three.js objects, `AudioNode`s and Strudel runtime values stay outside stores.

---

## 7. Sound beacons and remote resonators

The void contains remote frequencies. The player locates them primarily through PannerNode-based spatial sound and the camera/player listener orientation.

Do not use minimap markers, floating arrows or quest icons. Sound becomes louder, clearer and more layered with proximity. Optional visual assist may provide an abstract directional edge cue in mono/hearing-accessibility mode.

```ts
export interface ResonatorData {
  id: string;
  position: Vec3Data;
  baseHz: number;
  waveform: Waveform;
  amplitude: number;
  interactionRadius: number;
  audibleRadius: number;
  persistenceThreshold: number;
  materialProfile: string;
  spatialProfile: string;
  active: boolean;
}
```

The initial world contains three remote resonators with clearly different frequency, timbre and location.

---

## 8. Collision, resonance and interference

### Wave interaction

When the player wave intersects a resonator, calculate source and target frequency, ratio, phase difference, amplitude, velocity, waveform, duration, distance and musical context.

```ts
export type ResonanceClass =
  | 'harmonic'
  | 'dissonant'
  | 'amplification'
  | 'cancellation'
  | 'complex';

export interface ResonanceEvent {
  id: string;
  atMs: number;
  sourceId: string;
  targetId: string;
  sourceHz: number;
  targetHz: number;
  ratio: number;
  consonance: number;
  dissonance: number;
  amplitude: number;
  velocity: number;
  phaseDifference: number;
  sourceWaveform: Waveform;
  targetWaveform: Waveform;
  strength: number;
  persistence: number;
  classification: ResonanceClass;
}
```

### Resonance engine

```text
PLAYER INPUT → FREQUENCY STATE → WAVE INTERACTION → RESONANCE ENGINE
                                                      ↙          ↘
                                               MUSIC STATE    WORLD STATE
                                                      ↓          ↓
                                                   STRUDEL    THREE.JS
```

The Resonance Engine is the heart of the game. It emits the same immutable event to music and world systems.

### Interference

Overlapping waves create procedural lines, surfaces, topology, light and particle density. Use simplified, perceptually believable math rather than physically accurate acoustic simulation. When an interference pattern stays stable long enough, form emerges and may become persistent.

---

## 9. Genre affinity engine

Genres emerge from `MusicState`. Evaluate affinity approximately 4–10 times per second using smoothed temporal history, never every render frame. Affinities range from 0 to 1 and are not shown as percentages to the player.

```ts
export interface GenreSnapshot {
  atMs: number;
  affinity: GenreAffinity;
  dominant: keyof GenreAffinity | null;
  confidence: number;
}
```

Genres may overlap. `techno: 0.55` plus `ambient: 0.48` can create an atmospheric, repetitive world. No fixed hybrid label is required. The outcome is the player’s sound.

### 9.1 Techno attractor — REPETITION

Signals: high repetition, stable pulse, strong low end, synthetic timbre, medium/high texture, cyclical form and commonly a 120–145 BPM tendency. BPM alone never determines genre.

World tendency: chaos organizes into grid, machine and brutal repeated architecture. Pulses synchronize lights, structures and motion.

### 9.2 Ambient attractor — SPACE

Signals: long duration, high spatiality, slow interaction, low transient density, sustained harmony, sparse rhythm and large reverb/space.

World tendency: fog, floating mass, enormous scale, soft particles, distant forms and reduced-gravity motion.

### 9.3 Jazz attractor — CONVERSATION / IMPROVISATION

Signals: harmonic complexity, syncopation, variation, responsive phrases, changing dynamics and lower repetition.

World tendency: organic asymmetric structures and musical agents. Player emits a phrase; the world answers with a procedurally constrained response derived from rhythm cells, contour and harmony. No runtime language model is required.

### 9.4 Drum & Bass attractor — VELOCITY

Signals: high velocity, transient density, strong sub energy, break complexity, fast tempo tendency and repeated near-miss events.

World tendency: tunnels, flow corridors and aerial canyons. Near miss creates transient, dive excites sub, sharp turn mutates break, acceleration increases density.

### 9.5 Experimental attractor — MUTATION

Signals: conflicting genre affinities, irregular meter, complex phase behavior, dissonance, high variation and unexpected timbre combinations.

World tendency: desynchronization, broken symmetry, controlled gravity changes, time distortion and shader mutation. Controls must remain trustworthy even when the world appears unstable.

---

## 10. Rhythm, melody, harmony and form analysis

- `RhythmDetector` tracks inter-onset intervals, confidence and gradual quantization.
- `MelodyTracker` samples pitch trajectory at a bounded control rate and recognizes recurring phrases.
- `HarmonyEngine` scores simplified frequency ratios and current pitch context.
- `MeterDetector` proposes grouping only after sufficient rhythmic evidence.
- `FormTracker` observes longer energy, density and recurrence windows.
- All analyzers use bounded history buffers and seeded randomness where choices must be reproducible.
- Expensive music analysis runs in a lower-frequency logical loop, not `requestAnimationFrame`.

---

## 11. Strudel architecture

Use Strudel as the pattern/composition engine through **`@strudel/web`**. Do not expose the full REPL in the game. Do not generate arbitrary Strudel source every frame. Do not allow world data to contain executable code.

All concrete Strudel imports and runtime calls are isolated in `StrudelEngine.ts`. Pin the package version and validate calls against that installed version. Later migration to finer packages such as `@strudel/core`, `@strudel/webaudio`, `@strudel/tonal` or `@strudel/mini` requires a demonstrated need and an architecture decision.

```ts
export interface StrudelEnginePort {
  initialize(audioContext: AudioContext): Promise<void>;
  start(): Promise<void>;
  stop(): void;
  setLayerGraph(graph: MusicalLayerGraph, boundary?: 'beat' | 'bar'): void;
  setParameter(name: MusicParameter, value: number): void;
  schedule(event: MusicalAction, boundary: 'beat' | 'bar'): void;
  getOutputNode(): AudioNode;
  dispose(): void;
}
```

### Typed musical primitives

Use a whitelisted library of typed primitives rather than song swaps:

```ts
type PrimitiveKind =
  | 'pulse' | 'kick' | 'snare' | 'hat' | 'break'
  | 'sub' | 'bass' | 'drone' | 'chord' | 'melody'
  | 'noise' | 'texture' | 'accent' | 'response' | 'atmosphere';

interface MusicalPrimitive {
  id: string;
  kind: PrimitiveKind;
  layer: 'drums' | 'bass' | 'harmony' | 'melody' | 'texture' | 'atmosphere' | 'events';
  parameters: Record<string, number | string | boolean>;
  allowedTransforms: string[];
}
```

Layers must be independently activated, muted, transformed and interpolated. Prefer graph diffs and smooth transitions over restarting the whole Strudel graph.

---

## 12. Native Web Audio architecture

`AudioEngine.ts` owns the single `AudioContext`. It starts only after a user gesture and controls suspend/resume/dispose.

Use native primitives:

- `PannerNode` for positioned sources, attenuation and directional cones;
- `AudioListener` for player/camera position and orientation;
- `AnalyserNode` for time- and frequency-domain data;
- `GainNode` and `BiquadFilterNode` for mixing and filtering;
- `DynamicsCompressorNode` or a limiter as master safety;
- `ConvolverNode` only when a demonstrated spatial effect needs it.

Do not add Tone.js unless a specific missing capability is documented and approved.

### Audio → visual bus

| Derived audio value | Visual consequence |
|---|---|
| RMS | World intensity and displacement |
| Low-band energy | Terrain and large mass |
| Mid-band energy | Object motion |
| High-band energy | Particles and fine detail |
| Onset/transient | Pulses and short flashes |
| Spectral centroid approximation | Material brightness/sharpness |

Smooth analysis values before sending them to materials, uniforms and instances. Never create meshes or materials per analysis frame.

---

## 13. Three.js and visual direction

Use Three.js with `WebGLRenderer` for a desktop-first WebGL 2 MVP. Primary systems are waveform terrain, particles, lines, point clouds, procedural `BufferGeometry`, floating frequency nodes, interference fields, fog, emissive materials, GLSL shaders and restrained post-processing.

Canonical visual direction:

- near-black void;
- monochrome white/grey waveform landscape;
- small red, green or purple state accents;
- thin geometry and fine line detail;
- analog oscilloscope/scientific-instrument feeling;
- restrained glitch, pixel, dither and ASCII influence;
- luminous particles;
- quiet, tactile, indie and generative rather than bombastic.

Do not drift toward Fortnite, No Man’s Sky, fantasy RPG, cyberpunk city, generic synthwave or a colorful arcade aesthetic.

Performance rules:

- share materials and geometries;
- use `InstancedMesh`, object pooling, `BufferGeometry` and GPU particles;
- use GLSL for displacement, wave propagation and dense particle fields;
- avoid thousands of individual meshes;
- dispose GPU and audio resources on unload;
- degrade visuals before audio timing.

---

## 14. Locked technology stack

| Layer | Locked MVP choice | Rule |
|---|---|---|
| Language | **TypeScript** | No loose JavaScript for core systems |
| Dev/build | **Vite** | Vanilla TypeScript, ES modules |
| 3D | **Three.js** | Modern desktop/WebGL 2 target |
| Procedural graphics | **BufferGeometry + GLSL** | CPU geometry only when cheap and clear |
| Music patterns | **Strudel / `@strudel/web`** | No player-facing REPL |
| Audio engine | **Native Web Audio API** | `AudioEngine` owns one context |
| Spatial audio | **PannerNode + AudioListener** | Sound-first navigation |
| Audio analysis | **AnalyserNode** | Actual output drives visuals |
| State | **Custom typed stores + event bus** | Zustand only after demonstrated need |
| Physics | **Distance/wave systems** | No physics engine in MVP |
| Persistence | **IndexedDB / localStorage** | Serializable procedural state |
| UI framework | **None** | No React required for game loop |
| Backend | **None** | Static deployment for MVP |
| Hosting | **Static deployment** | Revisit only when backend features exist |

### Dependency policy

- Pin exact versions in the lockfile.
- Do not add a heavy dependency without proving necessity.
- Prefer browser/platform primitives and small project-owned systems.
- Do not add React, Tone.js, Zustand, Rapier or Cannon speculatively.

### Strudel licensing gate

Treat Strudel’s AGPL-3.0 licensing and web-application integration obligations as a release blocker requiring review. Before public/commercial deployment, confirm the exact obligations for the pinned packages, decide whether FREQUENCY will use a compatible open-source license, and obtain qualified legal advice when commercial licensing matters. Do not attempt to circumvent license terms. This section is a risk flag, not legal advice.

---

## 15. Application architecture and data flow

```text
INPUT → FrequencyStore → WaveInteraction → ResonanceEngine
                                             ↙       ↘
                                     MusicStore     WorldStore
                                         ↓             ↓
                                 GenreAffinity     WorldGenerator
                                         ↓             ↓
                                  StrudelEngine     Three.js
                                         ↓             ↑
                                      Web Audio → AudioAnalyser
```

### Variable render loop

```text
INPUT → PLAYER MOTION → WORLD VISUALS → AUDIO-VISUAL SNAPSHOT → RENDER
```

### Lower-frequency logical loop

```text
MUSIC ANALYSIS → RESONANCE → GENRE AFFINITY → FORM → WORLD EMERGENCE
```

Audio scheduling must not depend on render FPS. Clamp large frame deltas after tab suspension.

---

## 16. Module and file architecture

```text
src/
  main.ts
  app/
    Game.ts
    GameLoop.ts
    Config.ts
  core/
    EventBus.ts
    Clock.ts
    math.ts
    rng.ts
  input/
    InputManager.ts
    PointerLock.ts
    bindings.ts
  player/
    FrequencyController.ts
    FrequencyState.ts
    WindField.ts
  audio/
    AudioEngine.ts
    StrudelEngine.ts
    SpatialAudio.ts
    AudioAnalyser.ts
    MusicalPrimitives.ts
  music/
    MusicState.ts
    MusicStateAnalyzer.ts
    RhythmDetector.ts
    MelodyTracker.ts
    HarmonyEngine.ts
    MeterDetector.ts
    FormTracker.ts
  resonance/
    ResonanceEngine.ts
    ResonanceEvent.ts
    WaveInteraction.ts
    InterferenceField.ts
  genres/
    GenreAffinityEngine.ts
    TechnoProfile.ts
    AmbientProfile.ts
    JazzProfile.ts
    DnbProfile.ts
    ExperimentalProfile.ts
  world/
    World.ts
    WorldState.ts
    WorldGenerator.ts
    Resonator.ts
    FormEmergence.ts
    PersistenceSystem.ts
  rendering/
    Renderer.ts
    Camera.ts
    ParticleSystem.ts
    WaveTerrain.ts
    Materials.ts
    PostProcessing.ts
    shaders/
  progression/
    ProgressionState.ts
    DiscoverySystem.ts
    ComposerUnlock.ts
  persistence/
    SaveManager.ts
    WorldSerializer.ts
    migrations.ts
  ui/
    HUD.ts
    Intro.ts
    Settings.ts
    Accessibility.ts
tests/
  unit/
  integration/
  fixtures/
public/
  audio/
  textures/
```

Rules:

- Only `StrudelEngine.ts` imports Strudel.
- Only `AudioEngine.ts` creates/owns `AudioContext`.
- Rendering owns Three.js runtime objects; stores own serializable data.
- Profiles and primitives are typed declarative data, never executable user data.
- Prevent circular imports with ports/events and one-directional dependencies.

---

## 17. Progression and composer reveal

Progression records discovered causal laws, resonances, recurring phrases, structures and genre history. It is not XP.

The world gradually becomes editable as the player demonstrates understanding:

```text
frequency → resonance → rhythm → harmony → texture → form → world
```

After sufficient discovery, the game presents an empty void again. No tutorial panel. Previously learned interactions still work. The player intentionally creates resonators, connects stable harmonies, repeats gestures into patterns and lets duration create persistent form. The realization is:

> This is not the final level. This world is mine.

The final world is the composition. Avoid a traditional timeline, piano roll or full mixer. A compact precision/accessibility inspector is allowed but not required for core creation.

---

## 18. Persistence and save schema

Save reproducible procedural state, not raw audio, Three.js objects, AudioNodes or arbitrary Strudel code.

```ts
export interface WorldSave {
  schemaVersion: number;
  seed: string;
  savedAt: number;
  frequencyState: FrequencyState;
  musicState: MusicState;
  resonances: SavedResonance[];
  structures: SavedStructure[];
  genreHistory: GenreSnapshot[];
  progression: ProgressionState;
}
```

Goal:

```text
reload save → reconstruct music graph → reconstruct world → resume interaction
```

Use seeded randomness. Validate data on load. Add schema migrations when save contracts change. Autosave debounced snapshots and retain the previous valid snapshot for recovery.

---

## 19. MVP v0.1

The MVP proves one question:

> **Can I create a world by making sound?**

### In scope

1. Vite TypeScript project and test runner;
2. black void and free-flight camera;
3. controllable frequency, amplitude and waveform-ready state;
4. wind/particle representation;
5. three remote spatial resonators;
6. PannerNode/AudioListener spatial navigation;
7. wave collision and `ResonanceEvent` generation;
8. consonance/dissonance response;
9. Strudel output through `@strudel/web`;
10. AnalyserNode-based audio → visual feedback;
11. interference visualization;
12. form/geometry emergence and persistence;
13. local save, load and reset;
14. headphone onboarding and essential accessibility settings.

### Explicitly not in v0.1

- complete genre attractors;
- pre-built biomes or levels;
- composer UI;
- accounts/backend;
- multiplayer;
- procedural infinite universe;
- mobile/VR;
- AI-generated content.

If world creation from sound is not emotionally compelling, stop and iterate. Do not add content.

---

## 20. Vertical-slice milestones

Each milestone ends in a playable build with tests. Do not begin the next milestone before its gate passes.

### M0 — Foundation

Create the Vite `vanilla-ts` application, pin Three.js and `@strudel/web`, add typed stores/event bus, test runner, game lifecycle, one `AudioContext` unlock flow and empty Three.js scene.

**Gate:** production build and tests pass; AudioContext starts only after user gesture; reload leaves no errors.

### M1 — The void

Add free-flight, `FrequencyState`, frequency/amplitude controls, wind particles, one controllable tone, one spatial resonator and headphone onboarding.

**Gate:** movement in an empty world already feels musical; a new player locates the resonator primarily by sound.

### M2 — Resonance

Add second/third resonators, distance interaction, frequency ratio, consonance/dissonance score, beating/interference and immutable `ResonanceEvent`.

**Gate:** approaching another sound creates curiosity and one event produces clearly related audio and visual responses.

### M3 — Form emergence

Create persistent geometry from stable resonance: low resonance builds mass, high resonance detail, dissonance unstable form and duration persistence.

**Gate:** the player understands that their sound caused the object to exist.

### M4 — Rhythm / v0.2

Add repeated-pulse detection, tempo confidence, gradual quantization, Strudel pattern creation and synchronized world behavior.

**Gate:** a non-musician intentionally creates and repeats a recognizable groove.

### M5 — Techno emergence / v0.3

Implement only the Techno attractor and its visual organization.

**Gate:** player can accidentally discover Techno-like behavior and then reproduce it without selecting a genre.

### M6 — Ambient / v0.4

Implement Ambient attractor with the same core controls.

**Gate:** player intentionally moves between Techno-like and Ambient-like behavior without a menu or portal.

### M7+ — v0.5

Add Jazz, Drum & Bass and Experimental in that order only after architecture and product gates remain stable. Composer reveal follows sufficient causal understanding, not a fixed content checklist.

---

## 21. Acceptance criteria

### First playable experience

- [ ] Player discovers movement without a conventional tutorial panel.
- [ ] Movement audibly changes frequency, amplitude or spatial relation.
- [ ] Remote resonator is findable by spatial sound.
- [ ] Wave interaction produces one shared `ResonanceEvent`.
- [ ] Event creates causally related audio and visual change.
- [ ] Stable interaction creates persistent form.
- [ ] Repeated interaction can become a recognizable pattern.
- [ ] A first-time player can say what they caused.

### Architecture

- [ ] Project uses TypeScript and Vite; no core JavaScript files.
- [ ] `@strudel/web` is pinned and isolated in `StrudelEngine.ts`.
- [ ] No React, Tone.js, Zustand, backend or physics engine in MVP.
- [ ] `AudioEngine.ts` owns a single AudioContext.
- [ ] Stores contain only serializable state.
- [ ] Genre affinity and music analysis do not run at render frequency.
- [ ] Audio scheduling is independent of frame rate.
- [ ] Save/load recreates music and world from procedural state.

### Audio

- [ ] Audio starts after user gesture and resumes after tab suspension.
- [ ] Spatial direction and distance are perceptible in stereo.
- [ ] Mono/visual assist provides a viable alternative.
- [ ] Maximum supported layering does not clip the master output.
- [ ] Pattern changes do not recompile on every frame.
- [ ] No normal interaction creates audible clicks or scheduling stalls.

### UX

- [ ] Headphone recommendation and audio unlock take under 30 seconds.
- [ ] UI remains minimal and does not resemble a DAW.
- [ ] No genre selection menu, portal, score or failure state exists.
- [ ] Reduced-motion and reduced-flashing modes are functional.

---

## 22. Performance requirements

- Target 60 FPS on a representative modern integrated/discrete desktop GPU; provide a usable 30 FPS quality fallback.
- Main-thread frame p95 target below 16.7 ms at target quality.
- Prioritize audio stability and input latency over rendering quality.
- Bound audible voice count and analysis history.
- Use `InstancedMesh`, `BufferGeometry`, pooling, GPU particles and shader displacement.
- Avoid runtime shader compilation during core interaction after warm-up.
- Pause/reduce rendering when hidden; restore clocks without a large delta.
- Profile at least twenty minutes of play; scene, buffer and node counts must not grow monotonically.
- Quality tiers may reduce pixel ratio, particles, post-processing and shadows, never musical timing.

---

## 23. Accessibility requirements

- Master volume, mute and separate useful audio controls.
- Headphone/stereo, mono and visual-assist onboarding choices.
- Beacon assist levels: off, subtle and strong.
- Reduced motion removes roll, shake and strong camera pulses.
- Reduced flashing/photosensitivity mode bounds fast luminance changes.
- Mouse sensitivity, invert Y and eventually remappable controls.
- Keyboard-only access to all core actions/settings.
- Scalable high-contrast text; color is never the only state signal.
- No mechanic requires rapid mashing or an inaccessible hold without an alternative.
- Respect `prefers-reduced-motion` as a suggested default.

Sound-first does not mean inaccessible sound-only design.

---

## 24. Test strategy

### Unit tests

- frequency and logarithmic visual mappings;
- smoothing, thresholds and cooldowns;
- wave ratio/consonance calculation;
- resonance classification;
- rhythm/tempo confidence;
- genre affinity profiles and blending;
- graph diffing and typed primitive constraints;
- serialization, validation and migrations.

### Integration tests

- input → FrequencyStore → ResonanceEvent;
- ResonanceEvent → Strudel port + WorldStore;
- Strudel output node → analysis snapshot → visual bus;
- AudioContext start/suspend/resume/dispose;
- save/load deterministic reconstruction;
- reduced-motion, mono and visual-assist behavior.

### Playtest questions

- When does the player notice movement changes sound?
- Can they locate a resonator without a visual waypoint?
- Can they repeat an intentional result?
- Is dissonance understood as material rather than failure?
- Do they understand that they caused form to appear?
- Can they reproduce an emergent musical tendency?

---

## 25. Coding-agent rules

1. Read this file and the repository before editing.
2. Before implementing a feature, state its relationship to player, music and world.
3. Work milestone by milestone; do not build all genres simultaneously.
4. Use TypeScript for core code and explicit public contracts.
5. Write a failing test first for pure logic and state transitions.
6. Keep Strudel behind `StrudelEngine.ts`; no direct imports elsewhere.
7. Keep Three.js and AudioNode runtime objects outside stores/saves.
8. Never evaluate genre affinity or compile patterns every animation frame.
9. Use typed primitives and whitelisted transforms, never arbitrary data-driven code.
10. Prefer perceptually believable, legible wave math over expensive scientific simulation.
11. Prefer systemic mechanics over authored content.
12. Prefer one deep mechanic over five shallow mechanics.
13. Do not add quests, score, game-over or genre selection.
14. Do not add a heavy dependency without a measured need.
15. Do not add React, Tone.js, Zustand or a physics engine speculatively.
16. Use seeded randomness for reproducible procedural results.
17. Handle errors at system boundaries: assets, persistence, audio lifecycle and user input.
18. Remove dead code and temporary debug UI before milestone completion.
19. Run tests, production build and a real browser playthrough before claiming completion.
20. Report exactly which milestone gate and acceptance criteria passed or remain open.

### Definition of done per task

- Behavior works in a playable build.
- Relevant tests pass.
- No new console errors or unhandled rejections.
- Audio and GPU resources dispose correctly.
- Keyboard and reduced-motion paths are checked.
- Only files inside the task scope changed.
- Contract/schema documentation is updated.

---

## 26. Out of scope

- accounts, backend and cloud saves;
- multiplayer, social features and chat;
- artist/streaming integrations;
- public marketplace or world publishing;
- runtime AI/LLM generation;
- arbitrary user-supplied Strudel code;
- infinite procedural universe;
- rigid-body physics engine;
- React-based game loop or DAW interface;
- mobile, VR/AR and native apps;
- blockchain/NFT/economy;
- combat, enemies, quests, scoreboards and game-over;
- piano roll, full mixer or traditional timeline;
- audio/stems export before composer usability is proven;
- full genre content before each vertical-slice gate passes.

---

## 27. First implementation instruction

> Build only **M0 — Foundation**. Inspect the repository first. Create the minimal Vite `vanilla-ts` project structure, pin Three.js and `@strudel/web`, add the test runner, typed initial stores, a small typed event bus, dependency wiring and lifecycle. Add one user-gesture audio unlock that creates the AudioContext through `AudioEngine`. Render an empty black Three.js scene. Write tests for state creation and the event bus. Run tests and production build. Stop after the M0 gate; do not begin movement, resonators or genres.

---

## 28. Technical references

- [Strudel project integration](https://strudel.cc/technical-manual/project-start/)
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- [MDN AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)
- [MDN PannerNode](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode)
- [MDN AudioListener](https://developer.mozilla.org/en-US/docs/Web/API/AudioListener)
- [Vite Getting Started](https://vite.dev/guide/)

Always verify version-sensitive integration details against the pinned dependency version and current official documentation during implementation.

---

## 29. Track Builder (v2 amendment — NORMATIVE, supersedes conflicting earlier sections)

> Approved by the product owner on 2026-08-10. The eleven elements are not only world-physics: they are a **compositional pipeline**. The world does not merely generate sound — **the world builds a track in layers**, and the world is the visualized composition.

### 29.1 Revised primary product test

The MVP question of §19 is replaced by:

> **Can someone without music software audibly build a kick, hats, bass, harmony and melody into something that feels like a real track within two minutes?**

Track emergence comes before (or at minimum parallel to) world emergence. The §1 experience arc is reprioritized accordingly.

### 29.2 The compositional pipeline

| Fase | Speleractie | Element | Toegevoegd aan track | Hoorbaar |
|---|---|---|---|---|
| 1 | stabiele pulse vinden | Tempo | BPM clock | ghost pulse (heartbeat) |
| 2 | herhaalde movement/collisions | Rhythm | drum pattern | kick / snare / hats |
| 3 | door lage frequenties bewegen | Pitch | bass notes | bassline |
| 4 | resonante frequenties combineren | Harmony | chords | akkoordlaag |
| 5 | door pitch-space vliegen | Melody | melodic phrase | lead |
| 6 | waveform wisselen | Timbre | instrument character | synth/metal/noise/pad |
| 7 | amplitude variëren | Dynamics | velocity/automation | groove leeft |
| 8 | sounds lang/kort vasthouden | Duration | note lengths | staccato ↔ pads |
| 9 | ritmische acties groeperen | Meter | bar structure | 4/4, 3/4, 5/4 |
| 10 | meerdere systemen activeren | Texture | layer density | volle mix |
| 11 | door de wereld reizen over tijd | Form | arrangement | intro → build → drop → break → outro |

### 29.3 Layer unlock choreography (drums example, Techno grammar)

Ghost pulse verschijnt bij stabiele beweging (nog geen kick). Unlock-condities zijn **soepel: intentie telt** — 2-3 acties die ongeveer kloppen volstaan; de GenreGrammar maakt het resultaat muzikaal coherent zodat niet-muzikanten slagen.

- **KICK**: enkele low-frequency excitaties (puls of resonantie < ~250 Hz) ruwweg op de beat → four-on-the-floor valt binnen op de maatgrens.
- **HAT**: offbeat-achtige acties of high-frequency resonantie (> ~600 Hz) → offbeat/16th hats.
- **CLAP/SNARE**: sterke transienten ruwweg op 2 en 4 → clap-laag.
- Daarna: BASS (low pitch-space), HARMONY (resonantie-combinaties), MELODY (pitch-traject), TEXTURE, ARRANGEMENT.

Elke unlock wordt gecommuniceerd **hoorbaar (laag valt binnen op maatgrens) + visueel (het systeem van die laag verschijnt) + één kort monospace-woord** (bv. `KICK`). Nooit een popup, badge of score (§25.13 blijft gelden).

### 29.4 TrackState — wat zit er in de track

Naast MusicState (hoe gedraagt de muziek zich) komt een serializable **TrackState** (wat zit er daadwerkelijk in de track): bpm, meter, drums (kick/snare/hats/percussion als PatternState met unlocked-status), bass (pattern + notes), harmony (chords + rhythm), melody (notes + rhythm), texture (layers), dynamics (automation), form (arrangement). TrackState wordt opgeslagen in de save en gevisualiseerd door de wereld.

### 29.5 Data flow (vervangt de directe movement→sound koppeling)

```text
PLAYER → GAME MECHANICS → MUSICAL INTERPRETATION (analyzers §10)
  → TRACK BUILDER (Drum/Bass/Harmony/Melody/Texture composers)
  → GENRE GRAMMAR (regels per genre, geen sound-palette)
  → ARRANGEMENT ENGINE (§3.11 form: intro→build→drop→break→return→mutation)
  → STRUDEL → ACTUAL TRACK → AUDIO ANALYSIS → WORLD GENERATION
```

GenreGrammar: affiniteiten zetten geen genre "aan", maar geven de Track Builder vertaalregels (Techno: 125-135 BPM, 4otf-kick, clap op 2/4, offbeat hats, korte repetitieve bass, minimal motif; Ambient: nauwelijks kick, lange durations, drones, sustained harmony, vrije form; DnB: 165-180, breakbeat grammar, snare-nadruk, zware sub).

### 29.6 Elke tracklaag heeft een visuele systeemfunctie

| Laag | Visueel systeem |
|---|---|
| Kick | grote terrain-pulse / low-frequency shockwave |
| Snare/clap | scherpe horizontale flashes |
| Hi-hat | kleine high-frequency particles |
| Bassline | bewegende terrain ridges |
| Chord | verbindende geometry / bridges |
| Melody | luminous trajectory |
| Pad/atmosphere | fog / volumetric field |

De speler moet kunnen zeggen: "die particles zijn mijn hats, dat landschap is mijn bass, die lichtlijn is mijn melody."

### 29.7 Arrangement — de speler hoort waar hij in de song zit

De track is nooit een eindeloze 8-bar loop. Energie-gedrag stuurt de vorm: meer energie → build; zweven/stoppen → breakdown; daarna hard pulseren → drop. Secties (~16s schaal): INTRO (kick+atmosphere) → GROOVE (+hat+bass) → BUILD (+percussion, rising harmony) → DROP (alles) → BREAK (kick weg, harmony blijft) → RETURN → MUTATION (speler verandert de vorm). Movement becomes arrangement.

---

## 30. World Prompt (v3 amendment — NORMATIVE, supersedes conflicting §26 entries)

> Approved by the product owner on 2026-08-10. §26's exclusion of "runtime AI/LLM generation" and "arbitrary user-supplied Strudel code" is amended for this feature only, under the constraints below.

### 30.1 What it is

Before entering (and again on **P** during flight) the player may describe a world in one sentence. Claude returns a **world recipe**: resonator layout, which genre lies in each compass direction, fog/forest density, a starting tempo, and **real Strudel patterns per track layer**. The player then flies through that world and discovers the track exactly as in §29 — the AI supplies material, never control.

### 30.2 Generated code passes an allowlist grammar — always

Strudel evaluates JavaScript, so generated source is tokenized and validated before it can reach the engine (`src/ai/PatternGuard.ts`). Only these pass: whitelisted Strudel pattern functions called as functions, numeric literals, and string literals restricted to mini-notation characters. Anything else — an unknown identifier, assignment, arrow function, template literal, `new`, backtick, semicolon, brace — is rejected and that layer is dropped. `StrudelEngine` re-runs the guard at render time, so no path exists from model output to evaluated code without it. §11 and §25.9 remain intact: what reaches Strudel is still whitelisted, it is simply a larger whitelist.

### 30.3 The recipe is validated data, never trusted input

`validateRecipe` clamps every field (bearing, distance, Hz, fog, forest, BPM), rejects unknown enums, caps resonator count, and never throws — malformed output degrades to a safe default (§25.17).

### 30.4 Key handling and availability

The player supplies their own Anthropic API key. It is stored in that browser's localStorage, sent only to api.anthropic.com, and never committed or shared. **A key in client code is visible to anyone with access to that browser — this feature is for local single-player use; a hosted build must move the call server-side before release.** Without a key the game is unchanged: the seeded void, the §29 pipeline, everything plays.

### 30.5 Sound sources

The engine loads the standard Strudel sample bank (tidal drum machines, `strudel.cc/learn/samples`) at unlock. Sample loading is network-backed, so every drum template keeps a built-in synth fallback (`sbd`, noise colours) and the world sounds offline too.

---

## 31. Genre as compositional grammar (v4 amendment — NORMATIVE, supersedes §9 and §29.5 where they conflict)

### 31.1 The rule

Genre is never a playlist and never a preset. A genre is a set of rules for HOW the player's own material behaves. Two consequences are binding:

- **Never generate a complete genre track at once.** Every track emerges layer by layer out of player behaviour, so the player can say: *I caused the kick. That movement became the bassline. That flight path became the melody.*
- **Player behaviour determines WHAT is created; genre determines HOW it behaves; the eleven elements of §3 determine how it evolves.**

The five grammars and their principles:

| Genre | Principle | Opens with | Character |
|---|---|---|---|
| Techno | repetition | kick | hypnotic, mechanical, 4/4 |
| Ambient | space | texture | drifting, sparse, often drumless |
| Jazz | conversation | harmony | swung, the world answers |
| Drum & Bass | velocity | sub | fast, broken, heavy |
| Experimental | mutation | irregular pulse | polymetric, dissonant |

### 31.2 Every genre has its own build order

The unlock ladder is genre data, not a constant (`src/music/GenreLadder.ts`). The region the player is flying through decides which layer is offered next and how long the world waits before offering it. Ambient opens with texture and harmony and only reaches a kick after roughly a minute; Jazz opens with harmony because a conversation needs a subject; Drum & Bass opens with the sub and the break.

Only the next unearned step of the current grammar can be earned. Deliberate play (§29.3 intent) still brings that step forward — it can never skip ahead.

### 31.3 Crossing a region keeps everything earned

Layers already earned are never revoked. Flying from Techno into Drum & Bass keeps the kick and rewrites it as a break; the ladder continues from whatever is left, in the new order. One track, transforming — not a new track per region.

### 31.4 Jazz: the world answers

In every other region the world reacts to the player. In Jazz it takes a turn. A phrase traced through pitch space is a call; after a short silence a second voice replies with a variation of that phrase — transposed, inverted, or reversed — and each exchange takes a different angle so a conversation develops instead of an echo (`src/music/CallResponse.ts`). The answer is deterministic: the same call in the same state always produces the same reply.

### 31.5 Experimental: polymeter on one clock

Experimental voices run at cycle lengths that are not powers of two (7 hats against 5 percussion against a 4/4 kick), so they only realign after many bars. This runs on the single transport — a second clock is forbidden, because it would break the timing guarantees of §11 and every audio→visual sync in §12.

### 31.6 Per-layer behaviour

Each layer carries an active state, an intensity, and an entry condition. Layers are added and mutated by gameplay; nothing plays because a preset says so.

---

## 32. Production level: a flight must end on a finished track (v5 amendment — NORMATIVE)

### 32.1 The standard

This is not a genre rule. **Whatever grammar the player flew through, the end of a flight must sound like a produced track, not a sketch.** A finished flight reaches at least nine simultaneous voices, mixed, driven and stacked the way a released track is.

### 32.2 Width and depth

A track grows in two directions:

- **Width** — the §31 ladder: new roles arrive (kick, hats, snare, bass, harmony, melody, texture).
- **Depth** — staying with what you earned stacks a SECOND VOICE onto a role. Every layer therefore has two levels: `LEVEL_EARNED` when the player wins it, `LEVEL_DEEP` once the world has grown its body.

The second voices, in every grammar:

| Role | Second voice |
|---|---|
| kick | broken percussion on its own cycle |
| hats | high-frequency dirt (32nds at the top of the spectrum) |
| snare | a second machine a hair late — the body under the clap |
| bass | the sub stays UNDER the bass instead of being replaced |
| harmony | a wide voice an octave up behind the chord |
| melody | the phrase an octave up, half as loud, twice as slow |
| texture | a second, contrasting texture |

Body-plus-detail on one role is what separates a produced part from a programmed one. Layers deepen in ladder order, oldest first, so the track thickens where the player has spent their time.

### 32.3 Mix and drive

Mix aggression is grammar data, not one global setting. Techno and Drum & Bass are driven — kick near unity, saturation on kick, bass and stabs. Ambient and Jazz stay clean and dynamic. The master limiter of §21 always sits underneath: stacking must never clip.

### 32.4 Melody follows the grammar

The melody layer is earned the same way everywhere, but the grammar decides whether it sings or stabs. In Techno and Drum & Bass it is a short dark stab; in Ambient a long tone; in Jazz an improvised phrase.

### 32.5 The flight leaves a score

Pressing **E** hands the track back as source: a numbered, commented Strudel block that is copied to the clipboard and can be pasted straight into strudel.cc. Voices are flattened so each part is one numbered line, and named (`KICK / FOUNDATION`, `SNARE BODY`, `SUB`) rather than exposing internal ids. Exporting before anything is earned says so honestly instead of printing an empty stack.

---

## 33. Every direction is a place you can see (v6 amendment — NORMATIVE)

### 33.1 The rule

A player must be able to tell, at a glance and from inside the world, **which way they are going and that it is somewhere else**. Identical horizons in every direction make a 3D world read as a treadmill.

### 33.2 Colour is the region

Each compass genre owns a colour, a relief and a haze (`src/genres/ZonePalette.ts`), blended with the same affinities that blend the music (§31) — so the look and the grammar always agree about where the player is:

| Region | Colour | Landscape |
|---|---|---|
| Techno | machine red | high, hard ridges |
| Ambient | deep blue | almost flat, thick air |
| Jazz | warm amber | rolling, mid |
| Drum & Bass | acid green | jagged |
| Experimental | violet | the sky above everything |

The colour reaches the fog, the sky, the terrain, the forest and the speed streaks. The world stays near-black: a region TINTS the darkness, never washes it. The neutral void has no colour of its own — colour is something a direction earns.

### 33.3 Relief makes the horizon

Terrain height gains a two-octave noise ridge scaled by the region's relief and fading in with distance from spawn. The void stays flat; each direction grows its own skyline. A player who turns 90° sees a different horizon.

### 33.4 Speed must be visible

Streaks of light stream past the orb, stretched along the direction of travel, their length and brightness scaled by velocity (`src/rendering/SpeedStreaks.ts`). Standing still they vanish. This is what makes speed — and therefore tempo, since flight speed is the clock (§29) — legible over open ground.

### 33.5 The heading is on screen

The HUD names the compass point and the region it leads to (`N · techno`). Direction is never just "away".

---

## 34. Ten grammars, eight directions, two altitudes (v7 amendment — NORMATIVE, supersedes §31.1's five-genre table)

### 34.1 The map

| Where | Grammar | Principle |
|---|---|---|
| North | Techno | repetition |
| North-east | UK Garage | displacement |
| East | Jazz | conversation |
| South-east | House | warmth |
| South | Ambient | space |
| South-west | Classical | orchestration |
| West | Drum & Bass | velocity |
| North-west | Trap | weight |
| High altitude | Experimental | mutation |
| Low, skimming the ground | Dub | echo |

Compass lobes are `cos³` of the angle: full at the point, about a third at the 45° neighbour, silent at 90°. Narrowing by doubling the angle instead is wrong — it brings the OPPOSITE direction back to full strength.

Altitude is its own axis. Flight is clamped to −3..70, so "under the world" is unreachable: Dub is the low band you reach by diving to the floor, not a basement.

### 34.2 The five new principles

- **UK Garage — displacement.** Two-step kick that leaves beat two empty, shuffled skippy hats pushed late, short syncopated sub stabs, chopped vocal-like hook.
- **House — warmth.** Four to the floor, offbeat open hat, clap on 2 and 4, and real piano or organ chords. The only ground region built around hands rather than machines.
- **Trap — weight.** Half-time 808 kick allowed to ring, hi-hat rolls that subdivide the bar, a sub that slides between its notes, bright bells on top.
- **Dub — echo.** Mostly silence: one deep kick, an offbeat skank chord and a melodica line, everything drenched in delay feedback.
- **Classical — orchestration.** The only region with **no drum machine anywhere**: piano, harp, glockenspiel, marimba, timpani and tubular bells, with harmony and melody earned first and percussion barely at all.

### 34.3 Not every grammar scores from behaviour

Techno, Ambient, Jazz, DnB and Experimental are scored from what the player PLAYS (§9). The five added here are places you travel to: their pull is purely spatial. Blending them against a behaviour score of zero would halve them unfairly, so spatial-only grammars take the zone value directly.

### 34.4 Sound sources

All of it runs on the maps loaded in §32.5: 73 drum machines plus VCSL instruments. Strings and brass are NOT in the loaded set — Classical is deliberately a piano-and-percussion region, not a synthetic orchestra.

---

## 35. The landscape is solid (v8 amendment — NORMATIVE, HARD RULE)

**The orb may never be under the landscape.** Touching it bumps the orb back out along the surface, absorbing most of the downward speed. A bump, never a wall, never a fall-through.

### 35.1 One height field, two consumers

The shape the player SEES and the shape the player HITS must be the same shape. The field therefore lives in one module (`src/rendering/terrainField.ts`) that exports both the TypeScript function and the GLSL the terrain shader includes.

This rules out the usual `fract(sin(dot(...)))` hash: GPU `sin` is approximate, JS `sin` is exact, and multiplying that difference by 43758 produces completely different terrain on each side. Both sides instead read the same 256-entry noise table with integer lattice lookups and the same smoothstep — no trigonometric hashing anywhere.

### 35.2 What counts as ground

Only the STANDING shape: the idle ripple and the region's relief. Excitation bumps and the moving bass ridge are performance, not ground — colliding with those would make the floor punch the player on every beat.

### 35.3 The floor is the land

`FLIGHT_CONFIG.minY` sits below the deepest terrain, so what stops the orb is the landscape itself and not an invisible plane. The ceiling still applies.

---

## 36. The forest is the score (v9 amendment — NORMATIVE)

### 36.1 Vegetation is music, not decoration

Every growth carries a musical role, so a player sees where the music is before hearing it:

| Growth | Layer |
|---|---|
| thick trunk | kick |
| thin needle | hats |
| root, reaching below | bass |
| branch, reaching sideways | melody |
| canopy overhead | harmony |
| drifting spore | texture |
| giant formation | a new element |

Each growth exists in two states: **potential** (thin, dim — what this place could give you) and **earned** (full size and brightness — what you took from it). Both, deliberately: the potential forest gives a reason to fly somewhere, and the earned forest records what the flight made.

### 36.2 Every grammar is an ecosystem

Ten forests, distinguished by verticality, density, irregularity and motion rather than by literal species: MACHINE (techno, straight tall pillars), CLOUD (ambient, spores and membranes), IMPROVISED (jazz, branching), VELOCITY (dnb, sharp shards), MUTATION (experimental, nothing keeps its form), SKIP (garage), WARM (house), WEIGHT (trap, enormous masses), ECHO (dub, deep roots and wide canopies), HALL (classical, colonnades). Everything stays monochrome, wireframe and abstract — never a literal tree.

### 36.3 Placement is a pure function

Growths come from `growthsInCell(seed, cx, cz, ecology, track)` — deterministic per world cell, so the forest is infinite, identical across sessions, and unchanged when the player flies away and returns. The renderer rebuilds only when the player crosses a cell boundary or the region changes, never per frame.

### 36.4 Only the largest formations are solid

Giants and the thickest trunks push the orb aside horizontally (§35 governs the ground). Needles, spores and branches are flown straight through — a dense forest must stay flyable.

### 36.5 Speed is communicated five ways at once

Orb trail length, foreground streaks, vegetation parallax (near trunks move far faster than the horizon), wind streaks, and a camera FOV that widens with velocity. All subtle: it must stay arty, never a racing game.

### 36.6 The HUD names the place

`heading` (compass point and the grammar it leads to), `biome` (the grammar underfoot) and `region` (the ecosystem's name). Discovery is exploration, never a menu.

---

## 37. Every grammar has its own drum machine (v10 amendment — NORMATIVE)

A genre is not only a pattern. It is the box that pattern came out of. Playing every region on a TR909 makes ten regions sound like one track with different notes, which contradicts §31.

| Region | Machine | Second machine |
|---|---|---|
| Techno | RolandTR909 | RolandTR808 |
| House | RolandTR707 | LinnDrum |
| UK Garage | AkaiMPC60 | RolandTR909 |
| Trap | RolandTR808 | RolandTR808 |
| Drum & Bass | EmuSP12 | AkaiMPC60 |
| Jazz | AlesisHR16 | RolandR8 |
| Ambient | KorgDDM110 | LinnLM1 |
| Dub | RolandCompuRhythm1000 | RolandCompuRhythm8000 |
| Experimental | SakataDPM48 | OberheimDMX |
| Classical | AlesisHR16 | AlesisHR16 |

The machine name travels on the primitive, is validated against the kits that actually exist in the loaded map, and falls back to the 909 when unknown — a machine that is not loaded must never turn into silence. Verify a kit before naming it: `RolandTR77` looks plausible and is not there.

---

## 38. The sound library is audited, not assumed (v11 amendment — NORMATIVE)

A sound name that does not exist produces **silence, not an error**. Nothing else in the game can catch that, so it must be caught before it ships.

- `npm run sounds:audit` downloads the sample maps the engine loads and regenerates `src/audio/soundInventory.generated.ts` — the ground truth of what can be played.
- A test walks every grammar × every layer × samples-loaded and samples-offline, extracts every sound and bank the engine can utter, and asserts each one exists.
- The drum-machine allowlist is itself checked for a complete kit, and every machine a grammar names must be in that allowlist — otherwise the engine's safe fallback to the 909 would hide the mistake instead of revealing it.
- The audit must be verified by mutation: introduce a plausible-but-absent machine and confirm the suite fails. A green check that cannot go red is not a check.

## 39. Tempo belongs to the region (v11 amendment)

Flight speed is still the clock (§29), but the speed bands are stretched into each grammar's own range, so pushing hard in Ambient reaches the top of Ambient and never the top of Drum & Bass.

| Region | BPM |
|---|---|
| Ambient | 60–90 |
| Classical | 60–110 |
| Dub | 70–110 |
| House | 118–128 |
| UK Garage | 128–138 |
| Trap | 130–150 |
| Jazz | 80–160 |
| Experimental | 70–170 |
| Drum & Bass | 160–180 |
| The void | 90–140 |

## 40. The score is always on screen

The live pattern code is visible from the first second of flight, not hidden behind a key. `C` hides it. A player must be able to see what their flight is writing.

---

## 42. Movement is the music (v12 amendment — NORMATIVE)

When the orb is still, the world is silent. Layer gains follow flight speed, quantized in eight steps so a drifting gain can never re-evaluate the pattern per frame (§11).

Earned layers are **never lost** — they simply stop sounding until the player moves again. This resolves the tension with the earlier rule that a discovered layer stays in the track: it stays *earned*, not *audible*.

## 43. The sound library is local (v12 amendment)

`npm run sounds:vendor` downloads the sample maps and every audio file they reference into `public/samples/` and writes a `strudel.json` that points at them. The engine loads that first and only falls back to the remote maps when it is absent.

- The game then runs fully offline and does not depend on a third-party repository staying online.
- `public/samples/` is **git-ignored**: it is gigabytes, and the script is the reproducible way to rebuild it.
- `npm run sounds:vendor:used` fetches only what the grammars can utter (~80 MB) for a fast checkout.
- The status line above the live code says `local kit`, `remote kit` or `SYNTH FALLBACK` so which one is in use is never a guess.

---

## 44. The terrain is a wireframe surface, not a waveform plane (v13 amendment)

Scan lines run across; a sparser set of depth lines runs away from the camera. Horizontal lines alone read as 2.5D — the perpendicular set is what lets the eye see the shape of a hill. Drawn every fourth column so it stays a grid and never becomes graph paper.

---

## Final product thesis

FREQUENCY begins with one vibration.

Pitch creates space. Dynamics create force. Duration creates memory. Timbre creates matter. Rhythm creates repetition. Tempo creates time. Melody creates journeys. Harmony creates connection. Meter creates structure. Texture creates complexity. Form creates worlds.

Genres emerge from combinations of those laws. Eventually there is no Techno world, Ambient world or Jazz world. There is only:

> **YOUR SOUND.**

And the world is what your sound became.
