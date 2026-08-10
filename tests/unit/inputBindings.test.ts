import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, KeyAction } from '../../src/input/bindings';

describe('DEFAULT_BINDINGS', () => {
  it('binds the desktop MVP controls from spec §5', () => {
    expect(DEFAULT_BINDINGS.keys['KeyW']).toBe('moveForward');
    expect(DEFAULT_BINDINGS.keys['KeyS']).toBe('moveBackward');
    expect(DEFAULT_BINDINGS.keys['KeyA']).toBe('moveLeft');
    expect(DEFAULT_BINDINGS.keys['KeyD']).toBe('moveRight');
    expect(DEFAULT_BINDINGS.keys['ShiftLeft']).toBe('accelerate');
    expect(DEFAULT_BINDINGS.keys['Space']).toBe('resonancePulse');
    expect(DEFAULT_BINDINGS.keys['Escape']).toBe('pause');
    expect(DEFAULT_BINDINGS.mouseButtons[0]).toBe('windHold');
    expect(DEFAULT_BINDINGS.wheel).toBe('frequencyFocus');
    expect(DEFAULT_BINDINGS.mouseMove).toBe('look');
  });

  it('is a remap-ready data table: every key entry is a known action', () => {
    const actions: KeyAction[] = [
      'moveForward',
      'moveBackward',
      'moveLeft',
      'moveRight',
      'accelerate',
      'resonancePulse',
      'toggleCode',
      'exportTrack',
      'pause',
    ];
    for (const action of Object.values(DEFAULT_BINDINGS.keys)) {
      expect(actions).toContain(action);
    }
  });
});
