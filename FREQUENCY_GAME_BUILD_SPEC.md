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

## Final product thesis

FREQUENCY begins with one vibration.

Pitch creates space. Dynamics create force. Duration creates memory. Timbre creates matter. Rhythm creates repetition. Tempo creates time. Melody creates journeys. Harmony creates connection. Meter creates structure. Texture creates complexity. Form creates worlds.

Genres emerge from combinations of those laws. Eventually there is no Techno world, Ambient world or Jazz world. There is only:

> **YOUR SOUND.**

And the world is what your sound became.
