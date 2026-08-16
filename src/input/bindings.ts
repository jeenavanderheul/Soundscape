// Desktop MVP bindings (spec §5). Pure data, remap-ready: replace table
// entries to rebind; no logic lives here.

export type KeyAction =
  | 'moveForward'
  | 'moveBackward'
  | 'moveLeft'
  | 'moveRight'
  | 'hyperBoost'
  | 'resonancePulse'
  | 'toggleCode'
  | 'exportTrack'
  | 'toggleGuide'
  | 'pause';

/**
 * §129 (user decision): W is the throttle, the left button is ONLY the wind,
 * and Shift is a separate hyper boost. Holding the wind builds amplitude and
 * releasing it is the timed pulse — it no longer moves you, so the tone and
 * the speed are two hands doing two things.
 */
export type MouseButtonAction = 'windHold';
export type MouseMoveAction = 'look';

export interface DesktopBindings {
  /** KeyboardEvent.code → action. */
  keys: Readonly<Record<string, KeyAction>>;
  /** MouseEvent.button → action. Holding wind builds amplitude; release is the pulse. */
  mouseButtons: Readonly<Record<number, MouseButtonAction>>;
  mouseMove: MouseMoveAction;
}

export const DEFAULT_BINDINGS: DesktopBindings = {
  keys: {
    KeyW: 'moveForward',
    KeyS: 'moveBackward',
    KeyA: 'moveLeft',
    KeyD: 'moveRight',
    ShiftLeft: 'hyperBoost',
    ShiftRight: 'hyperBoost',
    Space: 'resonancePulse',
    KeyC: 'toggleCode',
    KeyE: 'exportTrack',
    KeyG: 'toggleGuide',
    Escape: 'pause',
  },
  mouseButtons: {
    0: 'windHold',
  },
  mouseMove: 'look',
};
