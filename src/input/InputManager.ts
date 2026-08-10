import { EventBus } from '../core/EventBus';
import { DEFAULT_BINDINGS, DesktopBindings, KeyAction } from './bindings';

/** Per-frame typed input snapshot (spec §6: systems consume snapshots, not DOM events). */

export interface InputSnapshot {
  /** moveX: -1 left … +1 right; moveZ: -1 backward … +1 forward. */
  axes: { moveX: number; moveZ: number };
  buttons: { accelerate: boolean; windHold: boolean };
  /** Shift was pressed since the last snapshot → up one gear (wraps at the top). */
  gearUp: boolean;
  /** LMB was released since the last snapshot → timed pulse excitation. */
  windReleased: boolean;
  /** Space was pressed since the last snapshot. */
  resonancePulse: boolean;
  /** Esc was pressed since the last snapshot. */
  pausePressed: boolean;
  /** C was pressed since the last snapshot → toggle the pattern overlay. */
  codeToggled: boolean;
  /** §32: the player asked for the finished track as source. */
  trackExported: boolean;
  /** Accumulated wheel deltaY since the last snapshot. */
  wheelDelta: number;
  /** Accumulated pointer movement since the last snapshot. */
  mouseDelta: { x: number; y: number };
}

export type InputEvents = {
  'input:resonance-pulse': null;
  'input:pause': null;
};

/**
 * Translates DOM input into typed per-frame snapshots (spec §5, §16).
 * No game logic here: smoothing/mapping happens in FrequencyController.
 * Edge-triggered flags and deltas reset on every snapshot() call.
 */
export class InputManager {
  private attached = false;
  private readonly heldKeys = new Set<string>();
  private windHold = false;
  private windReleased = false;
  private gearUp = false;
  private resonancePulse = false;
  private pausePressed = false;
  private codeToggled = false;
  private trackExported = false;
  private wheelDelta = 0;
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;

  constructor(
    private readonly pointerTarget: EventTarget,
    private readonly keyboardTarget: EventTarget,
    private readonly bus?: EventBus<InputEvents>,
    private readonly bindings: DesktopBindings = DEFAULT_BINDINGS,
  ) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.keyboardTarget.addEventListener('keydown', this.onKeyDown);
    this.keyboardTarget.addEventListener('keyup', this.onKeyUp);
    this.pointerTarget.addEventListener('mousedown', this.onMouseDown);
    this.pointerTarget.addEventListener('mouseup', this.onMouseUp);
    this.pointerTarget.addEventListener('mousemove', this.onMouseMove);
    this.pointerTarget.addEventListener('wheel', this.onWheel);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.keyboardTarget.removeEventListener('keydown', this.onKeyDown);
    this.keyboardTarget.removeEventListener('keyup', this.onKeyUp);
    this.pointerTarget.removeEventListener('mousedown', this.onMouseDown);
    this.pointerTarget.removeEventListener('mouseup', this.onMouseUp);
    this.pointerTarget.removeEventListener('mousemove', this.onMouseMove);
    this.pointerTarget.removeEventListener('wheel', this.onWheel);
    this.heldKeys.clear();
    this.windHold = false;
    this.resetFrameState();
  }

  /** Returns the current snapshot and resets per-frame accumulators. */
  snapshot(): InputSnapshot {
    const snap: InputSnapshot = {
      axes: {
        moveX: this.axisValue('moveRight') - this.axisValue('moveLeft'),
        moveZ: this.axisValue('moveForward') - this.axisValue('moveBackward'),
      },
      buttons: {
        // The wind IS the booster: pushing the world harder pushes the orb
        // harder (§3.2 dynamics = force).
        accelerate: this.windHold,
        windHold: this.windHold,
      },
      gearUp: this.gearUp,
      windReleased: this.windReleased,
      resonancePulse: this.resonancePulse,
      pausePressed: this.pausePressed,
      codeToggled: this.codeToggled,
      trackExported: this.trackExported,
      wheelDelta: this.wheelDelta,
      mouseDelta: { x: this.mouseDeltaX, y: this.mouseDeltaY },
    };
    this.resetFrameState();
    return snap;
  }

  private resetFrameState(): void {
    this.gearUp = false;
    this.windReleased = false;
    this.resonancePulse = false;
    this.pausePressed = false;
    this.codeToggled = false;
    this.trackExported = false;
    this.wheelDelta = 0;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }

  private axisValue(action: KeyAction): number {
    return this.isActionHeld(action) ? 1 : 0;
  }

  private isActionHeld(action: KeyAction): boolean {
    for (const code of this.heldKeys) {
      if (this.bindings.keys[code] === action) return true;
    }
    return false;
  }

  private readonly onKeyDown = (event: Event): void => {
    const { code, repeat } = event as KeyboardEvent;
    const action = this.bindings.keys[code];
    if (!action || repeat) return;
    this.heldKeys.add(code);
    if (action === 'shiftGear') {
      this.gearUp = true;
    } else if (action === 'resonancePulse') {
      this.resonancePulse = true;
      this.bus?.emit('input:resonance-pulse', null);
    } else if (action === 'toggleCode') {
      this.codeToggled = true;
    } else if (action === 'exportTrack') {
      this.trackExported = true;
    } else if (action === 'pause') {
      this.pausePressed = true;
      this.bus?.emit('input:pause', null);
    }
  };

  private readonly onKeyUp = (event: Event): void => {
    this.heldKeys.delete((event as KeyboardEvent).code);
  };

  private readonly onMouseDown = (event: Event): void => {
    if (this.bindings.mouseButtons[(event as MouseEvent).button] === 'windHold') {
      this.windHold = true;
    }
  };

  private readonly onMouseUp = (event: Event): void => {
    if (this.bindings.mouseButtons[(event as MouseEvent).button] !== 'windHold') return;
    if (this.windHold) this.windReleased = true;
    this.windHold = false;
  };

  private readonly onMouseMove = (event: Event): void => {
    const { movementX, movementY } = event as MouseEvent;
    this.mouseDeltaX += movementX;
    this.mouseDeltaY += movementY;
  };

  private readonly onWheel = (event: Event): void => {
    this.wheelDelta += (event as WheelEvent).deltaY;
  };
}
