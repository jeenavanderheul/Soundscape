import { EventBus } from '../core/EventBus';
import { DEFAULT_BINDINGS, DesktopBindings, KeyAction } from './bindings';

/** Per-frame typed input snapshot (spec §6: systems consume snapshots, not DOM events). */

export interface InputSnapshot {
  /** moveX: -1 left … +1 right; moveZ: -1 backward … +1 forward. */
  axes: { moveX: number; moveZ: number };
  buttons: { accelerate: boolean; windHold: boolean; hyper: boolean };
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
  /** §67: G shows or hides the guide. */
  guideToggled: boolean;
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
  private resonancePulse = false;
  private pausePressed = false;
  private codeToggled = false;
  private trackExported = false;
  private guideToggled = false;
  private wheelDelta = 0;
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  // Synthetic sensors (touch thumbs, §195 demo autopilot): the same snapshot,
  // different hands. They hold a LEVEL — throttle open, look pixels per frame —
  // rather than emitting deltas, so it persists across snapshots instead of
  // resetting with the frame state.
  private syntheticThrottle = false;
  private syntheticHyper = false;
  private syntheticLook = { x: 0, y: 0 };

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
    this.syntheticThrottle = false;
    this.syntheticLook = { x: 0, y: 0 };
    this.syntheticHyper = false;
    this.resetFrameState();
  }

  /** Synthetic throttle: held = this game's W (touch thumb, autopilot). */
  setSyntheticThrottle(on: boolean): void {
    this.syntheticThrottle = on;
  }

  /** Synthetic look, in mouse pixels per frame, re-applied until cleared. */
  setSyntheticLook(x: number, y: number): void {
    this.syntheticLook = { x, y };
  }

  /**
   * §203: hyper LATCHED by touch. Shift is a hold, and two thumbs cannot hold a
   * third thing, so on a phone a double tap latches it and the next one lets it
   * go. The controller never learns which it was — it reads one boolean.
   */
  setSyntheticHyper(on: boolean): void {
    this.syntheticHyper = on;
  }

  /** Synthetic wind pressed — same meaning as LMB down. */
  syntheticWindPress(): void {
    this.windHold = true;
  }

  /** Synthetic wind released — the timed pulse, same as LMB up. */
  syntheticWindRelease(): void {
    if (this.windHold) this.windReleased = true;
    this.windHold = false;
  }

  /** Returns the current snapshot and resets per-frame accumulators. */
  snapshot(): InputSnapshot {
    const snap: InputSnapshot = {
      axes: {
        moveX: this.axisValue('moveRight') - this.axisValue('moveLeft'),
        // A synthetic throttle is this game's W: it both opens the throttle
        // (accelerate below) and points the thrust forward, exactly as W does.
        moveZ: Math.max(
          -1,
          Math.min(
            1,
            this.axisValue('moveForward') -
              this.axisValue('moveBackward') +
              (this.syntheticThrottle ? 1 : 0),
          ),
        ),
      },
      buttons: {
        // §129: W IS the throttle. The wind used to open it too, which meant
        // you could not sound a long tone without also flying off, and could
        // not fly without sounding. One hand flies, the other plays.
        accelerate: this.isActionHeld('moveForward') || this.syntheticThrottle,
        windHold: this.windHold,
        hyper: this.isActionHeld('hyperBoost') || this.syntheticHyper,
      },
      windReleased: this.windReleased,
      resonancePulse: this.resonancePulse,
      pausePressed: this.pausePressed,
      codeToggled: this.codeToggled,
      trackExported: this.trackExported,
      guideToggled: this.guideToggled,
      wheelDelta: this.wheelDelta,
      // A held thumb or a flying autopilot is a steady turn: its pixels
      // re-enter every frame on top of whatever the mouse produced.
      mouseDelta: {
        x: this.mouseDeltaX + this.syntheticLook.x,
        y: this.mouseDeltaY + this.syntheticLook.y,
      },
    };
    this.resetFrameState();
    return snap;
  }

  private resetFrameState(): void {
    this.windReleased = false;
    this.resonancePulse = false;
    this.pausePressed = false;
    this.codeToggled = false;
    this.trackExported = false;
    this.guideToggled = false;
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
    if (action === 'resonancePulse') {
      this.resonancePulse = true;
      this.bus?.emit('input:resonance-pulse', null);
    } else if (action === 'toggleCode') {
      this.codeToggled = true;
    } else if (action === 'exportTrack') {
      this.trackExported = true;
    } else if (action === 'toggleGuide') {
      this.guideToggled = true;
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
