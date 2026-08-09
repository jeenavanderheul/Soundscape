import { AudioEngine } from '../audio/AudioEngine';
import { PlayerTone } from '../audio/PlayerTone';
import { ResonanceAudio } from '../audio/ResonanceAudio';
import { SpatialAudio } from '../audio/SpatialAudio';
import { Clock } from '../core/Clock';
import { createEventBus, EventBus } from '../core/EventBus';
import { createStore, Store } from '../core/stores';
import { InputManager } from '../input/InputManager';
import { PointerLock, PointerLockEvents } from '../input/PointerLock';
import { createInitialMusicState } from '../music/MusicState';
import { SaveManager } from '../persistence/SaveManager';
import type { SerializableWorld, WorldSave } from '../persistence/WorldSerializer';
import { FrequencyController } from '../player/FrequencyController';
import { createInitialFrequencyState, FrequencyState } from '../player/FrequencyState';
import { InterferenceVisuals } from '../rendering/InterferenceVisuals';
import { ParticleSystem } from '../rendering/ParticleSystem';
import { Renderer } from '../rendering/Renderer';
import { StructureRenderer } from '../rendering/StructureRenderer';
import { ResonanceEngine } from '../resonance/ResonanceEngine';
import type { ResonanceEvents } from '../resonance/ResonanceEngine';
import type { ResonanceEvent } from '../resonance/ResonanceEvent';
import { attachIntroHint } from '../ui/Intro';
import { PauseOverlay } from '../ui/PauseOverlay';
import { FormEmergence } from '../world/FormEmergence';
import type { StructureEvents } from '../world/FormEmergence';
import { createWorldStore, WorldState } from '../world/WorldState';
import { AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_INTERVAL_MS, LOGIC_STEP_MS, WORLD_SEED } from './Config';
import { GameLoop, LogicInterval } from './GameLoop';

const WORLD_UP = { x: 0, y: 1, z: 0 } as const;

export type GameEvents = ResonanceEvents & StructureEvents & {
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
  saveNow(): { ok: boolean };
  loadInfo(): LoadInfo;
  resetWorld(): void;
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
    });
    this.structures = new StructureRenderer();
    this.renderer.scene.add(this.structures.group);
    this.detachStructures = this.structures.subscribe(this.events);
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
    // Dev-only debug handle; the whole block is dropped from production builds.
    if (import.meta.env.DEV) {
      (window as DebugWindow).__FREQUENCY_DEBUG__ = {
        getFrequencyState: () => this.frequencyStore.getState(),
        getWorldState: () => this.worldStore.getState(),
        // Bounded copy: the engine history is already capped (§10).
        getLastResonanceEvents: () => [...this.resonanceEngine.history],
        getStructures: () => [...this.worldStore.getState().structures],
        getInterferenceActiveCount: () => this.interference.activeCount,
        saveNow: () => this.saveManager.save(this.snapshotWorld()),
        loadInfo: () => ({ ...this.startupLoadInfo }),
        resetWorld: () => this.resetWorld(),
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
    this.detachPointerLockPause();
    this.pauseOverlay.dispose();
    this.loop.stop();
    this.pointerLock.exit();
    this.pointerLock.detach();
    this.input.detach();
    this.detachIntroHint();
    this.detachInterference();
    this.detachResonanceCapture();
    this.detachStructures();
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
    this.renderer.dispose();
    if (import.meta.env.DEV) delete (window as DebugWindow).__FREQUENCY_DEBUG__;
    await this.audioEngine.dispose();
  }

  /** One frame: input snapshot → controller → store → audio + particles + camera (spec §15, §16). */
  private readonly tick = (deltaMs: number, elapsedMs: number): void => {
    this.controller.update(this.input.snapshot(), deltaMs);
    const state = this.frequencyStore.getState();
    const dtSeconds = deltaMs / 1000;
    // Lower-frequency logical loop (§15): resonance never runs per render frame.
    if (this.logicInterval.shouldStep(deltaMs)) {
      const resonators = this.worldStore.getState().resonators;
      this.resonanceEngine.tick(elapsedMs, state, resonators);
      this.formEmergence.tick(elapsedMs, this.pendingResonanceEvents, resonators);
      this.pendingResonanceEvents.length = 0;
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
    const camera = this.renderer.camera.instance;
    const { position, direction } = state;
    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(position.x + direction.x, position.y + direction.y, position.z + direction.z);
    this.renderer.render();
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
    this.input.attach();
    // The unlock click is a user gesture, so pointer lock may be requested here.
    this.pointerLock.request();
    this.loop.start();
    this.events.emit('audio:unlocked', null);
    this.events.emit('game:started', null);
  }

  /** MVP item 13: clear persistent forms and the local save; the void returns. */
  resetWorld(): void {
    const removed = this.worldStore.getState().structures;
    this.worldStore.setState((state) => ({ ...state, structures: [] }));
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
      musicState: createInitialMusicState(), // no live music store until M4
      resonators: [...world.resonators],
      structures: [...world.structures],
      genreHistory: [],
      progression: { controlsRevealed: 0 },
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
