import { attachAudioAnalyser, AudioAnalyser } from '../audio/AudioAnalyser';
import { AudioEngine } from '../audio/AudioEngine';
import { PlayerTone } from '../audio/PlayerTone';
import { ResonanceAudio } from '../audio/ResonanceAudio';
import { SpatialAudio } from '../audio/SpatialAudio';
import { StrudelEngine } from '../audio/StrudelEngine';
import { Clock } from '../core/Clock';
import { createEventBus, EventBus } from '../core/EventBus';
import { createStore, Store } from '../core/stores';
import { InputManager } from '../input/InputManager';
import { PointerLock, PointerLockEvents } from '../input/PointerLock';
import {
  buildLayerGraph,
  createEmptyLayerGraph,
  diffLayerGraph,
  genreGrammar,
} from '../audio/MusicalPrimitives';
import type { MusicalLayerGraph } from '../audio/MusicalPrimitives';
import { GenreAffinityEngine } from '../genres/GenreAffinityEngine';
import { dominantZone, setZoneGenres, zoneAffinity } from '../genres/GenreZones';
import { headingLabel, lookFor, NEUTRAL_LOOK } from '../genres/ZonePalette';
import type { GenreEvents } from '../genres/GenreAffinityEngine';
import { createInitialMusicState, MusicState } from '../music/MusicState';
import type { GenreAffinity } from '../music/MusicState';
import { MusicStateAnalyzer } from '../music/MusicStateAnalyzer';
import { RhythmDetector } from '../music/RhythmDetector';
import { TrackBuilder } from '../music/TrackBuilder';
import { createInitialTrackState, TrackEvents, TrackState } from '../music/TrackState';
import type { TrackGenre } from '../music/TrackState';
import { SaveManager } from '../persistence/SaveManager';
import type { SerializableWorld, WorldSave } from '../persistence/WorldSerializer';
import { FrequencyController } from '../player/FrequencyController';
import {
  createInitialProgression,
  isComposerUnlocked,
  ProgressionState,
  recordGenre,
  recordPlayerResonator,
  recordResonance,
  recordStructure,
} from '../progression/ProgressionState';
import { createInitialFrequencyState, FrequencyState } from '../player/FrequencyState';
import { BeatSync } from '../rendering/BeatSync';
import type { BeatEvent } from '../rendering/BeatSync';
import { InterferenceVisuals } from '../rendering/InterferenceVisuals';
import { ForestRenderer } from '../rendering/ForestRenderer';
import { ecologyFor } from '../rendering/ForestEcology';
import { ResonatorMarkers } from '../rendering/ResonatorMarkers';
import { ParticleSystem } from '../rendering/ParticleSystem';
import { PlayerOrb } from '../rendering/PlayerOrb';
import { Renderer } from '../rendering/Renderer';
import { SpeedStreaks } from '../rendering/SpeedStreaks';
import { StructureRenderer } from '../rendering/StructureRenderer';
import { HarmonyBridges, MelodyTrail } from '../rendering/TrackVisuals';
import { WaveTerrain } from '../rendering/WaveTerrain';
import { ResonanceEngine } from '../resonance/ResonanceEngine';
import type { ResonanceEvents } from '../resonance/ResonanceEngine';
import type { ResonanceEvent } from '../resonance/ResonanceEvent';
import { CodeOverlay } from '../ui/CodeOverlay';
import { ExportOverlay } from '../ui/ExportOverlay';
import { exportTrack } from '../music/TrackExport';
import { PromptOverlay } from '../ui/PromptOverlay';
import { loadApiKey, requestWorld, saveApiKey } from '../ai/WorldPromptClient';
import type { LayerPatterns } from '../audio/MusicalPrimitives';
import type { WorldRecipe } from '../ai/WorldRecipe';
import { Hints } from '../ui/Hints';
import { LayerCue } from '../ui/LayerCue';
import { HUD } from '../ui/HUD';
import { attachIntroHint } from '../ui/Intro';
import { PauseOverlay } from '../ui/PauseOverlay';
import { FormEmergence } from '../world/FormEmergence';
import type { StructureEvents } from '../world/FormEmergence';
import { createWorldStore, WorldState } from '../world/WorldState';
import { AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_INTERVAL_MS, LOGIC_STEP_MS, WORLD_SEED } from './Config';
import { GameLoop, LogicInterval } from './GameLoop';

const WORLD_UP = { x: 0, y: 1, z: 0 } as const;

export type GameEvents = ResonanceEvents & StructureEvents & GenreEvents & TrackEvents & {
  /** Strudel-clock beat boundary (§20 M4); consumed by BeatSync. */
  'beat': BeatEvent;
  'audio:unlocked': null;
  'game:started': null;
  'game:suspended': null;
  'game:resumed': null;
};

/** What the startup load attempt found; exposed via the dev debug handle. */
export interface LoadInfo {
  loaded: boolean;
  seedMatch: boolean;
  savedAt: number | null;
  structures: number;
}

/** Dev-only inspection handle (M1 verifier follow-up); excluded from production via the DEV guard. */
interface FrequencyDebug {
  getFrequencyState(): Readonly<FrequencyState>;
  getWorldState(): Readonly<WorldState>;
  getLastResonanceEvents(): ResonanceEvent[];
  getStructures(): WorldState['structures'];
  getInterferenceActiveCount(): number;
  getMusicState(): Readonly<MusicState>;
  getStrudelInfo(): {
    playing: boolean;
    bpm: number;
    evaluations: number;
    samples: boolean;
    local: boolean;
  };
  getGenreSnapshot(): unknown;
  getProgression(): unknown;
  getAnalysis(): unknown;
  getTrackState(): unknown;
  getInputCounts(): unknown;
  saveNow(): { ok: boolean };
  loadInfo(): LoadInfo;
  resetWorld(): void;
  groundHeightAt(x: number, z: number): number;
  teleport(x: number, z: number, y?: number): void;
}

type DebugWindow = Window & { __FREQUENCY_DEBUG__?: FrequencyDebug };

export interface GameElements {
  container: HTMLElement;
  overlay: HTMLElement;
  unlockButton: HTMLButtonElement;
}

/**
 * Wires EventBus + AudioEngine + Renderer + GameLoop (spec §15, §16).
 * Constructed idle; the AudioContext is created only inside the unlock
 * button's click handler (user gesture, spec §12).
 */
export class Game {
  readonly events: EventBus<GameEvents> = createEventBus<GameEvents>();
  private readonly audioEngine = new AudioEngine();
  private readonly renderer: Renderer;
  private readonly loop: GameLoop;
  private readonly frequencyStore: Store<FrequencyState> = createStore(
    createInitialFrequencyState(),
  );
  private readonly input: InputManager;
  private readonly pointerLockBus: EventBus<PointerLockEvents> =
    createEventBus<PointerLockEvents>();
  private readonly pointerLock: PointerLock;
  private readonly controller: FrequencyController;
  private readonly particles: ParticleSystem;
  private readonly detachIntroHint: () => void;
  private readonly worldStore = createWorldStore(WORLD_SEED);
  private readonly resonanceEngine: ResonanceEngine;
  private readonly logicInterval = new LogicInterval(LOGIC_STEP_MS);
  private readonly interference: InterferenceVisuals;
  private readonly detachInterference: () => void;
  private readonly formEmergence: FormEmergence;
  private readonly structures: StructureRenderer;
  private readonly detachStructures: () => void;
  private readonly detachResonanceCapture: () => void;
  // M4 analysis→world sync (§12, §20): one depth-capped pulse across renderers.
  // Visual world (poster direction): scan-line terrain, player orb, HUD.
  private readonly terrain = new WaveTerrain(WORLD_SEED);
  private readonly orb = new PlayerOrb();
  private readonly hud = new HUD();
  private readonly forest = new ForestRenderer(WORLD_SEED);
  private readonly markers = new ResonatorMarkers(this.worldStore.getState().resonators);
  private readonly melodyTrail = new MelodyTrail();
  private readonly streaks = new SpeedStreaks(WORLD_SEED);
  /** §45: the region the player is physically in — drives everything visual. */
  private placeGenre: TrackGenre = null;
  /** §33: the look of the region being flown through, eased so it never snaps. */
  private zoneLook = { ...NEUTRAL_LOOK, color: { ...NEUTRAL_LOOK.color } };
  private readonly harmonyBridges = new HarmonyBridges();
  private readonly hints = new Hints();
  private readonly codeOverlay = new CodeOverlay();
  private readonly exportOverlay = new ExportOverlay();
  /** Flight time so far, for the export header (§32). */
  private flightMs = 0;
  /** §30: the world the player described, if they described one. */
  private readonly promptOverlay = new PromptOverlay(
    {
      onSubmit: async (description, apiKey) => {
        const { validation } = await requestWorld(description, apiKey);
        saveApiKey(apiKey);
        this.applyRecipe(validation.recipe);
        if (validation.rejected.length > 0) {
          // Honest about what was refused rather than silently dropping it.
          console.warn('FREQUENCY: rejected generated patterns', validation.rejected);
        }
      },
      onSkip: () => {
        this.promptOverlay.hide();
      },
    },
    loadApiKey(),
  );
  private worldPatterns: LayerPatterns = {};
  private readonly layerCue = new LayerCue(this.events);
  private readonly beatSync: BeatSync;
  private readonly detachBeatSync: () => void;
  // §11/§20 M4: Strudel shares our AudioContext; its beat boundaries feed the bus.
  private readonly strudelEngine = new StrudelEngine();
  private readonly detachStrudelBeat: () => void;
  private audioAnalyser: AudioAnalyser | null = null;
  // §20 M4 rhythm chain: pulses → RhythmDetector → MusicStore → Strudel graph.
  private readonly musicStore: Store<MusicState> = createStore(createInitialMusicState());
  private readonly rhythmDetector = new RhythmDetector();
  private readonly musicAnalyzer = new MusicStateAnalyzer(this.musicStore, this.rhythmDetector);
  /** Last graph handed to Strudel; setLayerGraph only on real changes (§11 diffs). */
  private lastLayerGraph: MusicalLayerGraph | null = null;
  /** §9/§20 M5: genre affinity evaluated in the logic loop, never per frame. */
  private readonly genreEngine = new GenreAffinityEngine(this.events);
  /** §29: what is actually IN the track; built by intent, saved, visualized. */
  private readonly trackStore: Store<TrackState> = createStore(createInitialTrackState());
  private readonly trackBuilder = new TrackBuilder(this.trackStore, this.events);
  private beatIndex = 0;
  /** Dev diagnostics: how often each pulse source fired this session. */
  private readonly inputCounts = { windReleased: 0, resonancePulse: 0 };
  /** How long the wind has been genuinely held; guards the clap intent. */
  private windHeldMs = 0;
  /** §17: discovered causal laws; unlocks the composer mechanic. */
  private readonly progressionStore: Store<ProgressionState> = createStore(
    createInitialProgression(),
  );
  private readonly detachProgression: Array<() => void> = [];
  /** Bus events buffered between logic steps; drained into FormEmergence.tick. */
  private readonly pendingResonanceEvents: ResonanceEvent[] = [];
  // §18 / MVP item 13: local save, load and reset of the serializable stores.
  private readonly saveManager = new SaveManager(window.localStorage);
  private readonly detachAutosave: () => void;
  /** Periodic flush while structures exist (§18); reuses the tested interval gate. */
  private readonly autosaveInterval = new LogicInterval(AUTOSAVE_INTERVAL_MS);
  private readonly pauseOverlay: PauseOverlay;
  private readonly detachPointerLockPause: () => void;
  private readonly startupLoadInfo: LoadInfo;
  private playerTone: PlayerTone | null = null;
  private spatialAudio: SpatialAudio | null = null;
  private resonanceAudio: ResonanceAudio | null = null;
  private unlocked = false;
  private paused = false;

  constructor(private readonly elements: GameElements) {
    this.renderer = new Renderer(elements.container);
    this.loop = new GameLoop(new Clock(), this.tick);
    this.input = new InputManager(elements.container, window);
    this.pointerLock = new PointerLock(elements.container, this.pointerLockBus);
    this.pointerLock.attach();
    this.controller = new FrequencyController(this.frequencyStore);
    // §35: the landscape is the floor. One height field, shared by the
    // shader that draws it and the collision that stops the orb.
    this.controller.setGroundSampler((x, z) => this.terrain.groundHeightAt(x, z));
    // §36: giants are solid too — you fly around them, never through them.
    this.controller.setObstacleSource(() => this.forest.solidObstacles());
    this.forest.setGroundSampler((x, z) => this.terrain.groundHeightAt(x, z));
    this.particles = new ParticleSystem(WORLD_SEED);
    this.renderer.scene.add(this.particles.points);
    this.detachIntroHint = attachIntroHint(this.events);
    // Resonance core (§8, P5): engine emits the one shared event on this.events.
    this.resonanceEngine = new ResonanceEngine(this.events);
    // Visuals subscribe once at startup; positions resolve from the stores (§15).
    this.interference = new InterferenceVisuals(WORLD_SEED);
    this.renderer.scene.add(this.interference.lines);
    this.detachInterference = this.interference.subscribe(this.events, (event) =>
      this.resolveEventPositions(event.targetId),
    );
    // M3 form emergence (§20): sustained resonance from the same shared bus (P5)
    // becomes persistent StructureData in the world store and meshes in the scene.
    this.formEmergence = new FormEmergence(this.events, this.worldStore, WORLD_SEED);
    this.detachResonanceCapture = this.events.on('resonance:event', (event) => {
      this.pendingResonanceEvents.push(event);
      // §29.5: resonance is track intent too.
      this.trackBuilder.onResonance(event);
      // Terrain grows where resonance happens (user decision, §3.8): the
      // engaged resonator's zone swells and slowly relaxes.
      const target = this.worldStore.getState().resonators.find((r) => r.id === event.targetId);
      if (target) {
        this.terrain.excite(target.id, target.position, target.baseHz, event.strength);
      }
    });
    // Born structures deform the field permanently (§3.8 duration = memory).
    this.detachProgression.push(
      this.events.on('structure:spawned', (structure) => {
        this.terrain.excite(`structure:${structure.id}`, structure.position, structure.hz, 0.8, true);
      }),
    );
    // §17: discovery listeners feed the progression record (never XP).
    const progressIfChanged = (next: (s: ProgressionState) => ProgressionState): void => {
      // Reducers return the SAME object when nothing new was discovered; the
      // store contract requires a fresh object, so identity means "skip".
      if (next(this.progressionStore.getState()) !== this.progressionStore.getState()) {
        this.progressionStore.setState(next);
      }
    };
    this.detachProgression.push(
      this.events.on('resonance:event', (event) => {
        progressIfChanged((s) => recordResonance(s, event));
      }),
      this.events.on('structure:spawned', (structure) => {
        this.progressionStore.setState((s) => recordStructure(s, structure.persistence));
      }),
      this.events.on('genre:snapshot', (snapshot) => {
        if (snapshot.dominant) {
          progressIfChanged((s) => recordGenre(s, snapshot.dominant));
        }
      }),
    );
    this.structures = new StructureRenderer();
    this.renderer.scene.add(this.structures.group);
    this.detachStructures = this.structures.subscribe(this.events);
    // §12 audio→visual bus: beat events + analyser onsets drive the renderers'
    // setPulse hooks through one shared, strobe-capped envelope (§23).
    this.renderer.scene.add(this.terrain.lines);
    this.renderer.scene.add(this.orb.mesh);
    this.renderer.scene.add(this.forest.mesh);
    this.renderer.scene.add(this.markers.mesh);
    this.renderer.scene.add(this.melodyTrail.line);
    this.renderer.scene.add(this.harmonyBridges.lines);
    this.renderer.scene.add(this.streaks.lines);
    this.beatSync = new BeatSync([
      this.particles,
      this.interference,
      this.structures,
      this.terrain,
      this.orb,
      this.forest,
      this.markers,
    ]);
    this.detachBeatSync = this.beatSync.subscribe(this.events);
    // §20 M4 synchronized world behavior: the Strudel clock's beat boundaries
    // become 'beat' bus events, the strong pulse BeatSync locks visuals to.
    this.detachStrudelBeat = this.strudelEngine.onBeat((event) => {
      this.events.emit('beat', { atMs: event.atMs });
      // §29.6 layer visuals: kick = terrain shockwave; clap = backbeat flash.
      this.beatIndex += 1;
      const track = this.trackStore.getState();
      if (track.drums.kick.unlocked) {
        const p = this.frequencyStore.getState().position;
        this.terrain.excite('kick-beat', p, 55, 0.3);
      }
      if (track.drums.snare.unlocked && this.beatIndex % 2 === 0) {
        this.terrain.clapFlash();
      }
    });
    // §18: hydrate before the autosave subscription exists, so restoring a
    // save never immediately rewrites the snapshot it was loaded from.
    const save = this.saveManager.load();
    const seedMatch = save !== null && save.seed === WORLD_SEED;
    if (save && seedMatch) this.hydrate(save);
    this.startupLoadInfo = {
      loaded: seedMatch,
      seedMatch,
      savedAt: save?.savedAt ?? null,
      structures: seedMatch && save ? save.structures.length : 0,
    };
    this.detachAutosave = this.worldStore.subscribe(() => {
      this.saveManager.autosave(this.snapshotWorld(), AUTOSAVE_DEBOUNCE_MS);
    });
    // Esc pause (spec §5): losing pointer lock via Esc pauses; Esc outside
    // lock toggles. The overlay owns its DOM; the Game owns pause semantics.
    this.pauseOverlay = new PauseOverlay({
      onResume: () => this.resume(),
      onResetWorld: () => this.resetWorld(),
    });
    this.detachPointerLockPause = this.pointerLockBus.on('pointerlock:released', () => {
      if (this.unlocked && !this.paused) this.pause();
    });
    window.addEventListener('keydown', this.onKeyDown);
    if (import.meta.env.DEV) window.addEventListener('keydown', this.onRegionKey);
    // Dev-only debug handle; the whole block is dropped from production builds.
    if (import.meta.env.DEV) {
      (window as DebugWindow).__FREQUENCY_DEBUG__ = {
        getFrequencyState: () => this.frequencyStore.getState(),
        getWorldState: () => this.worldStore.getState(),
        // Bounded copy: the engine history is already capped (§10).
        getLastResonanceEvents: () => [...this.resonanceEngine.history],
        getStructures: () => [...this.worldStore.getState().structures],
        getInterferenceActiveCount: () => this.interference.activeCount,
        getMusicState: () => this.musicStore.getState(),
        getStrudelInfo: () => this.strudelEngine.status,
        getAnalysis: () => (this.audioAnalyser ? { ...this.audioAnalyser.snapshot } : null),
        getTrackState: () => this.trackStore.getState(),
        getInputCounts: () => ({ ...this.inputCounts }),
        getGenreSnapshot: () => this.genreEngine.current,
        getProgression: () => ({
          ...this.progressionStore.getState(),
          composerUnlocked: isComposerUnlocked(this.progressionStore.getState()),
        }),
        saveNow: () => this.saveManager.save(this.snapshotWorld()),
        loadInfo: () => ({ ...this.startupLoadInfo }),
        resetWorld: () => this.resetWorld(),
        // Reaching a genre region means flying 150 units; this makes each
        // region reachable in a test without waiting for the trip.
        groundHeightAt: (x: number, z: number) => this.terrain.groundHeightAt(x, z),
        teleport: (x: number, z: number, y?: number) =>
          this.frequencyStore.setState((s) => ({
            ...s,
            position: { x, y: y ?? s.position.y, z },
          })),
      };
    }
    elements.container.addEventListener('click', this.onContainerClick);
    elements.unlockButton.addEventListener('click', this.onUnlockClick);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  async dispose(): Promise<void> {
    this.elements.container.removeEventListener('click', this.onContainerClick);
    this.elements.unlockButton.removeEventListener('click', this.onUnlockClick);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keydown', this.onRegionKey);
    this.detachPointerLockPause();
    this.pauseOverlay.dispose();
    this.loop.stop();
    this.pointerLock.exit();
    this.pointerLock.detach();
    this.input.detach();
    this.detachIntroHint();
    this.detachInterference();
    this.detachResonanceCapture();
    for (const off of this.detachProgression) off();
    this.detachStructures();
    this.detachBeatSync();
    this.detachStrudelBeat();
    this.strudelEngine.dispose();
    this.detachAutosave();
    // Flush the latest world before teardown; dispose cancels pending autosaves.
    if (this.unlocked) this.saveManager.save(this.snapshotWorld());
    this.saveManager.dispose();
    this.playerTone?.dispose();
    this.spatialAudio?.dispose();
    this.resonanceAudio?.dispose();
    this.renderer.scene.remove(this.particles.points);
    this.particles.dispose();
    this.renderer.scene.remove(this.interference.lines);
    this.interference.dispose();
    this.renderer.scene.remove(this.structures.group);
    this.structures.dispose();
    this.renderer.scene.remove(this.terrain.lines);
    this.terrain.dispose();
    this.renderer.scene.remove(this.forest.mesh);
    this.forest.dispose();
    this.renderer.scene.remove(this.markers.mesh);
    this.markers.dispose();
    this.renderer.scene.remove(this.melodyTrail.line);
    this.melodyTrail.dispose();
    this.renderer.scene.remove(this.harmonyBridges.lines);
    this.harmonyBridges.dispose();
    this.hints.dispose();
    this.codeOverlay.dispose();
    this.exportOverlay.dispose();
    this.streaks.dispose();
    this.promptOverlay.dispose();
    this.layerCue.dispose();
    this.renderer.scene.remove(this.orb.mesh);
    this.orb.dispose();
    this.hud.dispose();
    this.renderer.dispose();
    if (import.meta.env.DEV) delete (window as DebugWindow).__FREQUENCY_DEBUG__;
    await this.audioEngine.dispose();
  }

  /** One frame: input snapshot → controller → store → audio + particles + camera (spec §15, §16). */
  private readonly tick = (deltaMs: number, elapsedMs: number): void => {
    const snapshot = this.input.snapshot();
    this.controller.update(snapshot, deltaMs);
    // §3.3: timed excitations (LMB release, Space) are the rhythm onsets.
    // §11: reveal the pattern the world wrote — read-only, never a REPL.
    if (snapshot.codeToggled) this.codeOverlay.toggle();
    this.flightMs += deltaMs;
    // §32: hand the finished track back as source.
    if (snapshot.trackExported) {
      this.exportOverlay.toggle(
        exportTrack({
          graph: this.lastLayerGraph ?? createEmptyLayerGraph(),
          genre: this.trackStore.getState().genre,
          flownSeconds: this.flightMs / 1000,
        }),
      );
    }
    const deliberateRelease =
      snapshot.windReleased && !snapshot.resonancePulse && this.windHeldMs >= 400;
    this.windHeldMs = snapshot.buttons.windHold ? this.windHeldMs + deltaMs : 0;
    if (snapshot.windReleased || snapshot.resonancePulse) {
      if (snapshot.windReleased) this.inputCounts.windReleased += 1;
      if (snapshot.resonancePulse) this.inputCounts.resonancePulse += 1;
      this.rhythmDetector.onOnset(elapsedMs);
      // §29.5: the same action is TRACK INTENT — its register carries meaning.
      const acting = this.frequencyStore.getState();
      this.trackBuilder.onAction({
        atMs: elapsedMs,
        hz: acting.hz,
        amplitude: acting.amplitude,
        // A clap intent is a DELIBERATE wind release (§29.3): the wind was
        // genuinely held first — never a Space tap or an input glitch.
        release: deliberateRelease,
      });
    }
    // §17 composer reveal: once causal understanding is demonstrated, a
    // resonance pulse in empty space CREATES a resonator from the player's
    // current frequency — the world becomes intentionally composable.
    if (snapshot.resonancePulse && isComposerUnlocked(this.progressionStore.getState())) {
      this.tryCreatePlayerResonator();
    }
    const state = this.frequencyStore.getState();
    const dtSeconds = deltaMs / 1000;
    // Lower-frequency logical loop (§15): resonance never runs per render frame.
    if (this.logicInterval.shouldStep(deltaMs)) {
      const resonators = this.worldStore.getState().resonators;
      this.resonanceEngine.tick(elapsedMs, state, resonators);
      this.formEmergence.tick(elapsedMs, this.pendingResonanceEvents, resonators);
      // §3.6: dissonance flows from the same shared events (P5) into MusicState.
      const pending = this.pendingResonanceEvents;
      const eventDissonance =
        pending.length > 0
          ? pending.reduce((sum, event) => sum + event.dissonance, 0) / pending.length
          : null;
      this.pendingResonanceEvents.length = 0;
      // §10: analyzers run in this lower-frequency loop, never per render frame.
      this.musicAnalyzer.update(
        elapsedMs,
        state,
        this.audioAnalyser?.snapshot.lowBand ?? 0,
        eventDissonance,
      );
      // §29.5: WHERE you are is a genre too — every direction of the world
      // leans toward one attractor; behaviour and place carry equal weight.
      const zone = zoneAffinity(state.position);
      this.genreEngine.update(elapsedMs, this.musicStore.getState(), zone);
      const genre = this.genreEngine.current;
      // §29: the Track Builder interprets intent into layers. Flight speed is
      // the tempo; energy drives the arrangement (§29.7).
      this.trackBuilder.tick(
        elapsedMs,
        this.musicStore.getState(),
        {
          velocity: state.velocity,
          hz: state.hz,
          energy: Math.min(1, state.energy * 0.6 + state.amplitude * 0.4),
        },
        genre?.affinity,
      );
      const track = this.trackStore.getState();
      // §29.6: every layer has a visual system.
      this.particles.setSparkle(track.drums.hats.unlocked);
      this.terrain.setBass(track.bass.unlocked ? 1 : 0);
      this.melodyTrail.setLevel(track.melody.unlocked ? 1 : 0);
      this.harmonyBridges.setLevel(track.harmony.unlocked ? 1 : 0);
      // §9.1 world tendency: repetition organizes structures onto the grid.
      this.structures.setOrganization(genre?.affinity.techno ?? 0);
      // §9.2 world tendency: sustained space thickens the fog.
      this.renderer.setAtmosphere(genre?.affinity.ambient ?? 0);
      // §33: EVERY DIRECTION IS A PLACE. Colour, horizon and haze come from
      // the same affinities as the music, eased so crossing a border is a
      // journey rather than a switch.
      this.applyZoneLook(zone, dtSeconds);
      // §45: what you SEE follows where you ARE. The track's genre is smoothed
      // behaviour and can lag or stay null; the land must never lie about the
      // region you are standing in.
      this.placeGenre = dominantZone(zone, 0.2);
      // §9.5 world tendency: mutation destabilizes existing form.
      this.structures.setMutation(genre?.affinity.experimental ?? 0);
      this.codeOverlay.update(this.strudelEngine.code);
      // §41: the one line that makes "I hear no difference" checkable.
      const info = this.strudelEngine.status;
      const playing = this.trackStore.getState();
      this.codeOverlay.setStatus(
        `${info.samples ? (info.local ? 'local kit' : 'remote kit') : 'SYNTH FALLBACK — samples failed'} · ` +
          `${playing.genre ?? 'void'} · ${genreGrammar(playing.genre).drumBank} · ` +
          `${Math.round(playing.bpm)} bpm`,
      );
      // Context hints: whispered at the teachable moment, once each.
      this.hints.update({
        elapsedMs,
        state,
        music: this.musicStore.getState(),
        resonators: this.worldStore.getState().resonators,
      });
      this.updateStrudelGraph();
      if (this.audioAnalyser) {
        const stepSeconds = LOGIC_STEP_MS / 1000;
        this.audioAnalyser.update(stepSeconds);
        this.beatSync.update(this.audioAnalyser.snapshot, stepSeconds);
      }
    }
    // §18: periodic flush every ~15 s while persistent structures exist, so a
    // crash never loses more than one interval of a built world.
    if (
      this.autosaveInterval.shouldStep(deltaMs) &&
      this.worldStore.getState().structures.length > 0
    ) {
      this.saveManager.save(this.snapshotWorld());
    }
    this.playerTone?.update(state, dtSeconds);
    this.spatialAudio?.setListenerPose(state.position, state.direction, WORLD_UP);
    this.particles.update(state, dtSeconds);
    this.interference.update(dtSeconds);
    this.structures.update(dtSeconds);
    // Visual world: the player's wind excites the field directly — the first
    // cause-effect the eye gets, before any resonator is found.
    if (state.amplitude > 0.05) {
      this.terrain.excite('player', state.position, state.hz, state.amplitude * 0.12);
    }
    this.terrain.update(dtSeconds, elapsedMs / 1000, state.position);
    this.forest.update(
      state.position,
      this.placeGenre,
      this.trackStore.getState(),
      elapsedMs / 1000,
    );
    // §36: speed widens the lens.
    this.renderer.camera.setSpeedFactor(state.energy);
    this.markers.update(elapsedMs / 1000);
    this.melodyTrail.update(state.position, dtSeconds);
    // Bridges connect the sounding things: resonators plus born structures.
    const world = this.worldStore.getState();
    this.harmonyBridges.update(
      [...world.resonators.map((r) => r.position), ...world.structures.map((s) => s.position)],
      state.position,
    );
    this.orb.update(state, this.audioAnalyser?.snapshot.rms ?? 0, dtSeconds, elapsedMs / 1000);
    // §33: streaks rushing past the orb are what makes speed legible.
    this.streaks.update(
      state.position,
      {
        x: state.direction.x * state.velocity,
        y: state.direction.y * state.velocity,
        z: state.direction.z * state.velocity,
      },
      dtSeconds,
    );
    this.hud.update(state, {
      heading: headingLabel(Math.atan2(state.direction.x, -state.direction.z)),
      biome: this.placeGenre ?? 'void',
      region: ecologyFor(this.placeGenre).name,
    });
    // Third-person: the camera trails the orb along the flight direction.
    const camera = this.renderer.camera.instance;
    const { position, direction } = state;
    camera.position.set(
      position.x - direction.x * 5,
      position.y - direction.y * 5 + 1.6,
      position.z - direction.z * 5,
    );
    camera.lookAt(
      position.x + direction.x * 3,
      position.y + direction.y * 3,
      position.z + direction.z * 3,
    );
    this.renderer.render();
  };

  /** §11: rebuild the layer graph from MusicState; hand Strudel only real diffs at bar boundaries. */
  private updateStrudelGraph(): void {
    if (!this.unlocked) return;
    const next = buildLayerGraph(
      this.musicStore.getState(),
      this.genreEngine.current?.affinity,
      this.worldStore.getState().structures,
      this.trackStore.getState(),
      this.worldPatterns,
      // §42: no movement, no music. A gentle ramp so starting to fly fades
      // the world in rather than switching it on.
      Math.min(1, Math.max(0, (this.frequencyStore.getState().velocity - 0.4) / 3)),
    );
    if (this.lastLayerGraph && diffLayerGraph(this.lastLayerGraph, next).length === 0) return;
    this.lastLayerGraph = next;
    this.strudelEngine.setLayerGraph(next, 'bar');
  }

  /**
   * Dev-only region jump: 1-8 drop the player into the heart of a compass
   * region, 9 climbs into Experimental, 0 dives into Dub. Verifying that a
   * direction really does rewrite the music takes seconds instead of a
   * two-minute flight. Dropped from production builds.
   */
  private readonly onRegionKey = (event: KeyboardEvent): void => {
    if (!this.unlocked || this.paused) return;
    const spots: Record<string, [number, number, number]> = {
      Digit1: [0, -140, 8],
      Digit2: [100, -100, 8],
      Digit3: [140, 0, 8],
      Digit4: [100, 100, 8],
      Digit5: [0, 140, 8],
      Digit6: [-100, 100, 8],
      Digit7: [-140, 0, 8],
      Digit8: [-100, -100, 8],
      Digit9: [0, 0, 65],
      Digit0: [0, 0, -2.5],
    };
    const spot = spots[event.code];
    if (!spot) return;
    const [x, z, y] = spot;
    this.frequencyStore.setState((state) => ({ ...state, position: { x, y, z } }));
  };

  private readonly onUnlockClick = (): void => {
    void this.unlock();
  };

  /** Re-acquire mouse look on canvas click after Esc released the lock (spec §5). */
  private readonly onContainerClick = (): void => {
    if (this.unlocked && !this.pointerLock.locked) this.pointerLock.request();
  };

  /** Esc toggles pause when pointer lock isn't holding it (locked Esc arrives as lock release). */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.unlocked && (event.key === 'p' || event.key === 'P')) {
      // §30: describe a new world mid-flight.
      if (this.promptOverlay.isVisible) this.promptOverlay.hide();
      else this.promptOverlay.show();
      return;
    }
    if (event.key !== 'Escape' || !this.unlocked) return;
    if (this.paused) this.resume();
    else this.pause();
  };

  /** Spec §5 Esc pause: freeze the loop, quiet the audio, flush the save, show the overlay. */
  private pause(): void {
    if (!this.unlocked || this.paused) return;
    this.paused = true;
    this.saveManager.save(this.snapshotWorld());
    this.loop.stop();
    void this.audioEngine.suspend().catch(reportAudioLifecycleError);
    this.pauseOverlay.show();
    this.events.emit('game:suspended', null);
  }

  private resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.pauseOverlay.hide();
    void this.audioEngine.resume().catch(reportAudioLifecycleError);
    this.loop.start();
    // Button click / Esc keydown is a user gesture, so mouse look may re-lock.
    this.pointerLock.request();
    this.events.emit('game:resumed', null);
  }

  private async unlock(): Promise<void> {
    if (this.unlocked) return;
    const { overlay, unlockButton } = this.elements;
    unlockButton.disabled = true;
    try {
      await this.audioEngine.initialize();
    } catch (error) {
      unlockButton.disabled = false;
      showOverlayError(overlay, error);
      return;
    }
    this.unlocked = true;
    overlay.hidden = true;
    const output = this.audioEngine.getOutputNode();
    this.playerTone = new PlayerTone(this.audioEngine.context, output);
    this.playerTone.start(this.frequencyStore.getState());
    this.spatialAudio = new SpatialAudio(this.audioEngine.context, output);
    for (const resonator of this.worldStore.getState().resonators) {
      if (resonator.active) this.spatialAudio.addResonator(resonator);
    }
    // Audible consequence of the same shared event the visuals react to (P5).
    // Subscribes to this.events in its constructor; needs the unlocked context.
    this.resonanceAudio = new ResonanceAudio(this.audioEngine.context, output, this.events);
    // §12: tap the master output for the audio→visual analysis bus.
    this.audioAnalyser = attachAudioAnalyser(this.audioEngine);
    // §11/§16: Strudel adopts our AudioContext and routes through the master
    // chain; a failure here degrades to no generative layers, never a crash.
    try {
      await this.strudelEngine.initialize(this.audioEngine.context);
      this.strudelEngine.getOutputNode().connect(output);
      await this.strudelEngine.start();
    } catch (error) {
      console.error('FREQUENCY: Strudel engine failed to start', error);
    }
    this.hud.show();
    this.promptOverlay.show();
    this.input.attach();
    // The unlock click is a user gesture, so pointer lock may be requested here.
    this.pointerLock.request();
    this.loop.start();
    this.events.emit('audio:unlocked', null);
    this.events.emit('game:started', null);
  }

  /**
   * §30: become the world the player described. Everything here arrives
   * already validated and clamped by `validateRecipe`.
   */
  private applyRecipe(recipe: WorldRecipe): void {
    setZoneGenres(recipe.zones);
    this.renderer.setAtmosphere(recipe.fog);
    this.worldPatterns = recipe.patterns;
    if (recipe.resonators.length > 0) {
      const resonators = recipe.resonators.map((entry, index) => {
        const radians = (entry.angleDeg * Math.PI) / 180;
        return {
          id: `world-resonator-${index + 1}`,
          position: {
            x: Math.sin(radians) * entry.distance,
            y: 0,
            z: -Math.cos(radians) * entry.distance,
          },
          baseHz: entry.hz,
          waveform: entry.waveform,
          amplitude: 0.35,
          interactionRadius: 8,
          audibleRadius: 220,
          persistenceThreshold: 4,
          materialProfile: 'glass',
          spatialProfile: 'omni',
          active: true,
        };
      });
      this.worldStore.setState((state) => ({ ...state, resonators }));
      for (const resonator of resonators) {
        this.spatialAudio?.addResonator(resonator);
        this.markers.add(resonator);
      }
    }
    this.trackStore.setState((track) => ({ ...track, bpm: recipe.bpm }));
    this.events.emit('track:genre', { genre: recipe.zones.north, atMs: 0 });
  }

  /** §17: place a resonator carrying the player's current sound in empty space. */
  private tryCreatePlayerResonator(): void {
    if (!this.unlocked) return;
    const state = this.frequencyStore.getState();
    if (state.amplitude < 0.2) return; // intent requires wind, not a idle tap
    const world = this.worldStore.getState();
    const clearance = 12;
    const tooClose = world.resonators.some((r) => {
      const dx = r.position.x - state.position.x;
      const dy = r.position.y - state.position.y;
      const dz = r.position.z - state.position.z;
      return Math.hypot(dx, dy, dz) < clearance;
    });
    if (tooClose) return; // near an existing sound, Space stays a pulse (§5)
    const progression = this.progressionStore.getState();
    const resonator = {
      id: `player-resonator-${progression.playerResonatorsCreated + 1}`,
      position: { ...state.position },
      baseHz: state.hz,
      waveform: state.waveform,
      amplitude: 0.5,
      interactionRadius: 6,
      audibleRadius: 60,
      persistenceThreshold: 4,
      materialProfile: 'player',
      spatialProfile: 'point',
      active: true,
    };
    this.worldStore.setState((s) => ({ ...s, resonators: [...s.resonators, resonator] }));
    this.spatialAudio?.addResonator(resonator);
    this.markers.add(resonator);
    this.progressionStore.setState((s) => recordPlayerResonator(s));
  }

  /** MVP item 13: clear persistent forms and the local save; the void returns. */
  /**
   * §33: ease toward the look of the region under the player. The music
   * blends between grammars; so does the world it happens in.
   */
  private applyZoneLook(zone: GenreAffinity, dtSeconds: number): void {
    const target = lookFor(zone);
    // ~1.5 s to cross a border: fast enough to feel caused, slow enough to
    // read as travelling rather than as a switch being flipped.
    const k = Math.min(1, dtSeconds * 0.7);
    const look = this.zoneLook;
    look.color.r += (target.color.r - look.color.r) * k;
    look.color.g += (target.color.g - look.color.g) * k;
    look.color.b += (target.color.b - look.color.b) * k;
    look.relief += (target.relief - look.relief) * k;
    this.renderer.setZoneColor(look.color);
    this.terrain.setZone(look.color, look.relief);
    this.streaks.setColor(look.color);
    this.forest.setTint(look.color);
  }

  resetWorld(): void {
    const removed = this.worldStore.getState().structures;
    this.worldStore.setState((state) => ({ ...state, structures: [] }));
    // The void returns COMPLETELY: player back at spawn, tone at rest (§17).
    this.frequencyStore.setState(() => createInitialFrequencyState());
    this.trackStore.setState(() => createInitialTrackState());
    this.trackBuilder.reset();
    this.melodyTrail.reset();
    this.controller.resetOrientation();
    for (const structure of removed) this.events.emit('structure:removed', structure);
    // Runs last: also cancels the autosave the store change just scheduled.
    this.saveManager.reset();
  }

  /** Reload → reconstruct world (§18): stores first, then replayed spawn events rebuild geometry. */
  private hydrate(save: WorldSave): void {
    this.frequencyStore.setState(() => ({ ...save.frequencyState }));
    this.worldStore.setState((state) => ({
      ...state,
      resonators: save.resonators.length > 0 ? save.resonators : [...state.resonators],
      structures: save.structures,
    }));
    this.progressionStore.setState(() => ({ ...save.progression }));
    // §32: the WORLD is restored, the TRACK is not. A track is what a flight
    // builds; handing back a finished one would mean every session starts on
    // a full arrangement instead of a single tone.
    this.trackStore.setState(() => createInitialTrackState());
    // Resume spawn counters so post-load spawns never reuse a saved structure's id.
    this.formEmergence.rehydrate(save.structures);
    for (const structure of save.structures) this.events.emit('structure:spawned', structure);
  }

  /** The serializable world snapshot handed to SaveManager (spec §18). */
  private snapshotWorld(): SerializableWorld {
    const world = this.worldStore.getState();
    return {
      seed: WORLD_SEED,
      frequencyState: this.frequencyStore.getState(),
      musicState: this.musicStore.getState(),
      resonators: [...world.resonators],
      structures: [...world.structures],
      genreHistory: [...this.genreEngine.history],
      progression: this.progressionStore.getState(),
      trackState: this.trackStore.getState(),
    };
  }

  /** Stores own the positions (§16): resolve event ids to current world/player positions. */
  private resolveEventPositions(
    targetId: string,
  ): { source: FrequencyState['position']; target: FrequencyState['position'] } | null {
    const resonator = this.worldStore.getState().resonators.find((r) => r.id === targetId);
    if (!resonator) return null;
    return { source: this.frequencyStore.getState().position, target: resonator.position };
  }

  private readonly onVisibilityChange = (): void => {
    if (!this.unlocked) return;
    if (document.hidden) {
      // Spec §22: pause rendering when hidden; suspend audio. Flush the save
      // immediately — a backgrounded tab may never come back (§18).
      this.saveManager.save(this.snapshotWorld());
      this.loop.stop();
      void this.audioEngine.suspend().catch(reportAudioLifecycleError);
      this.events.emit('game:suspended', null);
    } else if (this.paused) {
      // The player paused deliberately: stay paused when the tab returns.
    } else {
      // The core Clock clamps the delta, so restarting never causes a jump (§15).
      void this.audioEngine.resume().catch(reportAudioLifecycleError);
      this.loop.start();
      this.events.emit('game:resumed', null);
    }
  };
}

function showOverlayError(overlay: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Audio could not be started.';
  let errorElement = overlay.querySelector<HTMLElement>('[data-unlock-error]');
  if (!errorElement) {
    errorElement = document.createElement('p');
    errorElement.setAttribute('data-unlock-error', '');
    errorElement.setAttribute('role', 'alert');
    overlay.appendChild(errorElement);
  }
  errorElement.textContent = message;
}

function reportAudioLifecycleError(error: unknown): void {
  console.error('FREQUENCY: audio lifecycle error', error);
}
