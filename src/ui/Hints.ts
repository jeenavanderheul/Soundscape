import type { MusicState } from '../music/MusicState';
import type { FrequencyState } from '../player/FrequencyState';
import type { ResonatorData } from '../world/Resonator';
import { isTouchDevice } from '../input/TouchControls';

/**
 * Context hints (user decision): tiny one-time monospace lines that appear at
 * the teachable moment and fade. Not a tutorial panel (§21 UX) — the world
 * still does the teaching; these are whispers.
 */

export interface HintContext {
  elapsedMs: number;
  state: Readonly<FrequencyState>;
  music: Readonly<MusicState>;
  resonators: readonly ResonatorData[];
}

interface HintDef {
  id: string;
  text: string;
  when(ctx: HintContext, memory: HintMemory): boolean;
}

interface HintMemory {
  everWind: boolean;
  everTuned: boolean;
}

const HINTS: HintDef[] = [
  {
    id: 'wind',
    text: 'hold LEFT MOUSE — breathe wind',
    when: (ctx, mem) => ctx.elapsedMs > 6_000 && !mem.everWind,
  },
  {
    id: 'tune',
    text: 'scroll to tune your frequency',
    when: (ctx, mem) => ctx.elapsedMs > 22_000 && !mem.everTuned,
  },
  {
    id: 'gear',
    text: 'W: fly · hold LMB: the wind · Shift: hyper, twice the speed',
    when: (ctx) => ctx.elapsedMs > 14_000,
  },
  {
    id: 'code',
    text: 'press C — see the code your flight is writing',
    when: (ctx) => ctx.elapsedMs > 26_000,
  },
  {
    id: 'beat',
    text: 'tap SPACE to a beat — the world will follow',
    when: (ctx) => ctx.elapsedMs > 35_000 && ctx.music.bpm === 0,
  },
  {
    id: 'resonator',
    text: 'a light hums nearby — hold your wind close to it',
    when: (ctx) =>
      ctx.resonators.some((r) => {
        const dx = r.position.x - ctx.state.position.x;
        const dy = r.position.y - ctx.state.position.y;
        const dz = r.position.z - ctx.state.position.z;
        return Math.hypot(dx, dy, dz) < r.audibleRadius * 0.35;
      }),
  },
];

/**
 * Touch has no scroll wheel, C key or spacebar; those hints would teach
 * controls that do not exist there. The two that survive get thumb words.
 */
const TOUCH_TEXT: Record<string, string> = {
  wind: 'hold the RIGHT half — breathe wind',
  gear: 'left thumb: fly & steer · right half: the wind',
};

function hintsFor(touch: boolean): HintDef[] {
  if (!touch) return HINTS;
  return HINTS.filter((hint) => hint.id in TOUCH_TEXT || hint.id === 'resonator').map((hint) => {
    const text = TOUCH_TEXT[hint.id];
    return text === undefined ? hint : { ...hint, text };
  });
}

const VISIBLE_MS = 6_000;

export class Hints {
  private readonly root: HTMLDivElement;
  private readonly shown = new Set<string>();
  private readonly memory: HintMemory = { everWind: false, everTuned: false };
  private readonly reducedMotion: boolean;
  private hideAt = 0;
  private readonly defs: HintDef[];

  constructor(container: HTMLElement = document.body, touch: boolean = isTouchDevice()) {
    this.defs = hintsFor(touch);
    this.root = document.createElement('div');
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    Object.assign(this.root.style, {
      position: 'fixed',
      bottom: '48px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'rgba(215, 228, 230, 0.75)',
      font: '13px/1.6 var(--font-mono)',
      letterSpacing: '0.12em',
      pointerEvents: 'none',
      opacity: '0',
      transition: this.reducedMotion ? 'none' : 'opacity 1.2s ease',
      textShadow: '0 0 8px rgba(160, 220, 230, 0.3)',
      zIndex: '10',
    });
    container.appendChild(this.root);
  }

  /** Logic-loop rate. Tracks what the player already discovered by doing. */
  update(ctx: HintContext): void {
    if (ctx.state.amplitude > 0.3) this.memory.everWind = true;
    if (Math.abs(ctx.state.hz - 220) > 5) this.memory.everTuned = true;
    if (this.hideAt > 0 && ctx.elapsedMs >= this.hideAt) {
      this.root.style.opacity = '0';
      this.hideAt = 0;
    }
    if (this.hideAt > 0) return; // one hint at a time
    for (const hint of this.defs) {
      if (this.shown.has(hint.id)) continue;
      if (!hint.when(ctx, this.memory)) continue;
      this.shown.add(hint.id);
      this.root.textContent = hint.text;
      this.root.style.opacity = '1';
      this.hideAt = ctx.elapsedMs + VISIBLE_MS;
      break;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
