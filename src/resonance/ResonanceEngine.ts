import type { EventBus } from '../core/EventBus';
import type { FrequencyState } from '../player/FrequencyState';
import type { ResonatorData } from '../world/Resonator';
import {
  createEventIdCounter,
  createResonanceEvent,
  ResonanceEvent,
} from './ResonanceEvent';
import {
  classify,
  consonanceScore,
  dissonanceScore,
  frequencyRatio,
  interactionStrength,
  phaseDifference,
} from './WaveInteraction';

/** Typed event map extension: the one shared event (P5, §8). */
export type ResonanceEvents = {
  'resonance:event': ResonanceEvent;
};

export const PLAYER_SOURCE_ID = 'player';

export interface ResonanceEngineConfig {
  /** Radius of the player's wave/interaction sphere, world units (§5). */
  playerWaveRadius: number;
  /** Strength needed to enter engagement (hysteresis upper bound). */
  enterStrength: number;
  /** Strength below which engagement exits (hysteresis lower bound). */
  exitStrength: number;
  /** Time after an exit before the same resonator can re-engage. */
  cooldownMs: number;
  /** Bounded event history size (§10 bounded buffers). */
  historyLimit: number;
  /** Clamp on a single tick delta so a resumed tab cannot jump persistence (§15). */
  maxTickDeltaMs: number;
}

export const RESONANCE_ENGINE_CONFIG: ResonanceEngineConfig = {
  playerWaveRadius: 8,
  enterStrength: 0.12,
  exitStrength: 0.06,
  cooldownMs: 800,
  historyLimit: 64,
  maxTickDeltaMs: 100,
};

interface Engagement {
  engaged: boolean;
  /** Seconds of sustained engagement. */
  persistence: number;
  thresholdEmitted: boolean;
  lastExitMs: number;
}

const TAU = Math.PI * 2;

/**
 * The heart of the game (§8): runs in the lower-frequency logical loop
 * (~10–20 Hz), never per render frame. Each tick it evaluates every active
 * resonator in range and emits ONE immutable ResonanceEvent per meaningful
 * transition — enter, persistence threshold crossed, exit — with hysteresis
 * and a cooldown so boundary hovering never spams events. Fully deterministic
 * given identical tick inputs.
 */
export class ResonanceEngine {
  private readonly engagements = new Map<string, Engagement>();
  private readonly events: ResonanceEvent[] = [];
  private lastTickMs: number | null = null;

  constructor(
    private readonly bus: EventBus<ResonanceEvents>,
    private readonly config: ResonanceEngineConfig = RESONANCE_ENGINE_CONFIG,
    private readonly nextId: () => string = createEventIdCounter(),
  ) {}

  get history(): readonly ResonanceEvent[] {
    return this.events;
  }

  tick(nowMs: number, frequency: FrequencyState, resonators: readonly ResonatorData[]): void {
    const rawDelta = this.lastTickMs === null ? 0 : nowMs - this.lastTickMs;
    const deltaSec = Math.min(Math.max(rawDelta, 0), this.config.maxTickDeltaMs) / 1000;
    this.lastTickMs = nowMs;

    const liveIds = new Set<string>();
    for (const resonator of resonators) {
      liveIds.add(resonator.id);
      if (resonator.active) this.evaluate(nowMs, deltaSec, frequency, resonator);
    }
    // Keep the engagement map bounded to resonators that still exist.
    for (const id of this.engagements.keys()) {
      if (!liveIds.has(id)) this.engagements.delete(id);
    }
  }

  private evaluate(
    nowMs: number,
    deltaSec: number,
    frequency: FrequencyState,
    resonator: ResonatorData,
  ): void {
    const { position } = frequency;
    const distance = Math.hypot(
      position.x - resonator.position.x,
      position.y - resonator.position.y,
      position.z - resonator.position.z,
    );
    const strength = interactionStrength(
      distance,
      { source: this.config.playerWaveRadius, target: resonator.interactionRadius },
      { source: frequency.amplitude, target: resonator.amplitude },
    );

    let state = this.engagements.get(resonator.id);
    if (!state) {
      state = { engaged: false, persistence: 0, thresholdEmitted: false, lastExitMs: -Infinity };
      this.engagements.set(resonator.id, state);
    }

    if (!state.engaged) {
      const cooledDown = nowMs - state.lastExitMs >= this.config.cooldownMs;
      if (strength >= this.config.enterStrength && cooledDown) {
        state.engaged = true;
        state.persistence = 0;
        state.thresholdEmitted = false;
        this.emit(nowMs, frequency, resonator, strength, state.persistence);
      }
      return;
    }

    if (strength < this.config.exitStrength) {
      this.emit(nowMs, frequency, resonator, strength, state.persistence);
      state.engaged = false;
      state.lastExitMs = nowMs;
      return;
    }

    state.persistence += deltaSec;
    if (!state.thresholdEmitted && state.persistence >= resonator.persistenceThreshold) {
      state.thresholdEmitted = true;
      this.emit(nowMs, frequency, resonator, strength, state.persistence);
    }
  }

  private emit(
    nowMs: number,
    frequency: FrequencyState,
    resonator: ResonatorData,
    strength: number,
    persistence: number,
  ): void {
    const sourceHz = frequency.hz;
    const targetHz = resonator.baseHz;
    const ratio = frequencyRatio(sourceHz, targetHz);
    const consonance = consonanceScore(ratio);
    const dissonance = dissonanceScore(sourceHz, targetHz);
    // Deterministic resonator phase derived from its frequency and the tick time.
    const targetPhase = (nowMs / 1000) * targetHz * TAU;
    const phase = phaseDifference(frequency.phase, targetPhase);

    const event = createResonanceEvent(
      {
        atMs: nowMs,
        sourceId: PLAYER_SOURCE_ID,
        targetId: resonator.id,
        sourceHz,
        targetHz,
        ratio,
        consonance,
        dissonance,
        amplitude: Math.sqrt(frequency.amplitude * resonator.amplitude),
        velocity: frequency.velocity,
        phaseDifference: phase,
        sourceWaveform: frequency.waveform,
        targetWaveform: resonator.waveform,
        strength,
        persistence,
        classification: classify({
          deltaHz: sourceHz - targetHz,
          phaseDifference: phase,
          consonance,
          dissonance,
        }),
      },
      this.nextId,
    );

    this.events.push(event);
    if (this.events.length > this.config.historyLimit) {
      this.events.splice(0, this.events.length - this.config.historyLimit);
    }
    this.bus.emit('resonance:event', event);
  }
}
