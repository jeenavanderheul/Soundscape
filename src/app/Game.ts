import { AudioEngine } from '../audio/AudioEngine';
import { PlayerTone } from '../audio/PlayerTone';
import { SpatialAudio } from '../audio/SpatialAudio';
import { Clock } from '../core/Clock';
import { createEventBus, EventBus } from '../core/EventBus';
import { createStore, Store } from '../core/stores';
import { InputManager } from '../input/InputManager';
import { PointerLock, PointerLockEvents } from '../input/PointerLock';
import { FrequencyController } from '../player/FrequencyController';
import { createInitialFrequencyState, FrequencyState } from '../player/FrequencyState';
import { ParticleSystem } from '../rendering/ParticleSystem';
import { Renderer } from '../rendering/Renderer';
import { attachIntroHint } from '../ui/Intro';
import { createWorldStore } from '../world/WorldState';
import { WORLD_SEED } from './Config';
import { GameLoop } from './GameLoop';

const WORLD_UP = { x: 0, y: 1, z: 0 } as const;

export type GameEvents = {
  'audio:unlocked': null;
  'game:started': null;
  'game:suspended': null;
  'game:resumed': null;
};

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
  private readonly worldStore = createWorldStore();
  private playerTone: PlayerTone | null = null;
  private spatialAudio: SpatialAudio | null = null;
  private unlocked = false;

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
    elements.container.addEventListener('click', this.onContainerClick);
    elements.unlockButton.addEventListener('click', this.onUnlockClick);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  async dispose(): Promise<void> {
    this.elements.container.removeEventListener('click', this.onContainerClick);
    this.elements.unlockButton.removeEventListener('click', this.onUnlockClick);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.loop.stop();
    this.pointerLock.exit();
    this.pointerLock.detach();
    this.input.detach();
    this.detachIntroHint();
    this.playerTone?.dispose();
    this.spatialAudio?.dispose();
    this.renderer.scene.remove(this.particles.points);
    this.particles.dispose();
    this.renderer.dispose();
    await this.audioEngine.dispose();
  }

  /** One frame: input snapshot → controller → store → audio + particles + camera (spec §15, §16). */
  private readonly tick = (deltaMs: number): void => {
    this.controller.update(this.input.snapshot(), deltaMs);
    const state = this.frequencyStore.getState();
    const dtSeconds = deltaMs / 1000;
    this.playerTone?.update(state, dtSeconds);
    this.spatialAudio?.setListenerPose(state.position, state.direction, WORLD_UP);
    this.particles.update(state, dtSeconds);
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
    this.input.attach();
    // The unlock click is a user gesture, so pointer lock may be requested here.
    this.pointerLock.request();
    this.loop.start();
    this.events.emit('audio:unlocked', null);
    this.events.emit('game:started', null);
  }

  private readonly onVisibilityChange = (): void => {
    if (!this.unlocked) return;
    if (document.hidden) {
      // Spec §22: pause rendering when hidden; suspend audio.
      this.loop.stop();
      void this.audioEngine.suspend().catch(reportAudioLifecycleError);
      this.events.emit('game:suspended', null);
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
