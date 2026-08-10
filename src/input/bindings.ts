// Desktop MVP bindings (spec §5). Pure data, remap-ready: replace table
// entries to rebind; no logic lives here.

export type KeyAction =
  | 'moveForward'
  | 'moveBackward'
  | 'moveLeft'
  | 'moveRight'
  | 'accelerate'
  | 'resonancePulse'
  | 'toggleCode'
  | 'exportTrack'
  | 'pause';

/**
 * Left button is the gearbox: every click shifts up one, and past the top gear
 * it wraps back to first (user decision). Right button is the wind (§5
 * dynamics) and doubles as a short booster while it is held.
 */
export type MouseButtonAction = 'gearUp' | 'windHold';
export type WheelAction = 'frequencyFocus';
export type MouseMoveAction = 'look';

export interface DesktopBindings {
  /** KeyboardEvent.code → action. */
  keys: Readonly<Record<string, KeyAction>>;
  /** MouseEvent.button → action. Holding wind builds amplitude; release is the pulse. */
  mouseButtons: Readonly<Record<number, MouseButtonAction>>;
  wheel: WheelAction;
  mouseMove: MouseMoveAction;
}

export const DEFAULT_BINDINGS: DesktopBindings = {
  keys: {
    KeyW: 'moveForward',
    KeyS: 'moveBackward',
    KeyA: 'moveLeft',
    KeyD: 'moveRight',
    ShiftLeft: 'accelerate',
    ShiftRight: 'accelerate',
    Space: 'resonancePulse',
    KeyC: 'toggleCode',
    KeyE: 'exportTrack',
    Escape: 'pause',
  },
  mouseButtons: {
    0: 'gearUp',
    2: 'windHold',
  },
  wheel: 'frequencyFocus',
  mouseMove: 'look',
};
