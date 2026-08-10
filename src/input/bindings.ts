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

export type MouseButtonAction = 'windHold';
export type WheelAction = 'frequencyFocus';
export type MouseMoveAction = 'look';

export interface DesktopBindings {
  /** KeyboardEvent.code → action. */
  keys: Readonly<Record<string, KeyAction>>;
  /** MouseEvent.button → action. Hold builds wind/amplitude; release is the pulse. */
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
    0: 'windHold',
  },
  wheel: 'frequencyFocus',
  mouseMove: 'look',
};
