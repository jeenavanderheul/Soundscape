import type { Vec3Data } from '../player/FrequencyState';
import type { ResonatorData } from '../world/Resonator';
import { resonatorLevel } from './MotionGate';
import { oscillatorType } from './PlayerTone';

/**
 * Panner falloff tuning (spec §7, §21): with the inverse model and these values,
 * a resonator ~40 units away is faint but clearly directional, and grows
 * significantly louder on approach.
 */
const REF_DISTANCE = 5;
const ROLLOFF = 1;
const LISTENER_SMOOTHING_S = 0.02;
/**
 * §196 (user: "de piep die je hoort als je stilstaat is veel te luid en
 * overheersend"). A resonator drone is a RAW SINE, and a raw sine at the same
 * number as a mixed drum bus is far louder than that number suggests: at
 * amplitude 0.5 the first waypoint was arriving at about -10 dB, against an
 * arrival atmosphere sitting near -28. It was the loudest thing in the world
 * and it was a test tone.
 *
 * §184 had just made it worse without anyone noticing: giving arrival a motion
 * floor of 0.4 lifted the standstill drone level from 0.35 to 0.61, so the
 * first thing a visitor heard nearly doubled.
 *
 * This is the headroom every drone is multiplied by. It keeps §P1 — you can
 * still stop and listen for where something is — while putting the cue under
 * the music instead of over it.
 */
export const DRONE_HEADROOM = 0.22;

const FADE_SMOOTHING_S = 0.15;
const RELEASE_S = 0.6;

interface SpatialSource {
  oscillator: OscillatorNode;
  gain: GainNode;
  panner: PannerNode;
  /** The resonator's own amplitude, before the §42 motion gate scales it. */
  amplitude: number;
}

/**
 * Owns the AudioListener pose and all spatialized resonator sources (spec §12).
 * Chain per resonator: OscillatorNode -> GainNode -> PannerNode (HRTF) -> output.
 */
export class SpatialAudio {
  private readonly context: AudioContext;
  private readonly output: AudioNode;
  private readonly sources = new Map<string, SpatialSource>();
  private motion = 0;

  constructor(context: AudioContext, output: AudioNode) {
    this.context = context;
    this.output = output;
  }

  /**
   * §42: standing still ducks the drones, but never to nothing — §P1 keeps
   * sound as the waypoint, so you can still stop and listen for direction.
   */
  setMotion(motion: number): void {
    this.motion = motion;
    const level = resonatorLevel(motion);
    const now = this.context.currentTime;
    for (const source of this.sources.values()) {
      source.gain.gain.setTargetAtTime(source.amplitude * level * DRONE_HEADROOM, now, FADE_SMOOTHING_S);
    }
  }

  /** Call once per frame with the camera pose. Uses smoothed modern AudioParams. */
  setListenerPose(position: Vec3Data, forward: Vec3Data, up: Vec3Data): void {
    // Firefox still lacks the AudioParam-based listener properties at runtime.
    const listener = this.context.listener as AudioListener & { positionX?: AudioParam };
    const now = this.context.currentTime;
    if (listener.positionX === undefined) {
      listener.setPosition(position.x, position.y, position.z);
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
      return;
    }
    smooth(listener.positionX, position.x, now);
    smooth(listener.positionY, position.y, now);
    smooth(listener.positionZ, position.z, now);
    smooth(listener.forwardX, forward.x, now);
    smooth(listener.forwardY, forward.y, now);
    smooth(listener.forwardZ, forward.z, now);
    smooth(listener.upX, up.x, now);
    smooth(listener.upY, up.y, now);
    smooth(listener.upZ, up.z, now);
  }

  addResonator(data: ResonatorData): void {
    if (this.sources.has(data.id)) return;
    const oscillator = this.context.createOscillator();
    oscillator.type = oscillatorType(data.waveform);
    oscillator.frequency.value = data.baseHz;

    const gain = this.context.createGain();
    gain.gain.value = 0; // fade in — no click when the source appears

    const panner = this.context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = REF_DISTANCE;
    panner.rolloffFactor = ROLLOFF;
    panner.maxDistance = data.audibleRadius;
    panner.positionX.value = data.position.x;
    panner.positionY.value = data.position.y;
    panner.positionZ.value = data.position.z;

    oscillator.connect(gain);
    gain.connect(panner);
    panner.connect(this.output);
    oscillator.start();
    gain.gain.setTargetAtTime(
      data.amplitude * resonatorLevel(this.motion) * DRONE_HEADROOM,
      this.context.currentTime,
      FADE_SMOOTHING_S,
    );
    this.sources.set(data.id, { oscillator, gain, panner, amplitude: data.amplitude });
  }

  removeResonator(id: string): void {
    const source = this.sources.get(id);
    if (source === undefined) return;
    this.sources.delete(id);
    const now = this.context.currentTime;
    source.gain.gain.setTargetAtTime(0, now, FADE_SMOOTHING_S);
    source.oscillator.onended = () => disconnectSource(source);
    source.oscillator.stop(now + RELEASE_S);
  }

  dispose(): void {
    for (const source of this.sources.values()) {
      source.oscillator.stop();
      disconnectSource(source);
    }
    this.sources.clear();
  }
}

function smooth(param: AudioParam, value: number, now: number): void {
  param.setTargetAtTime(value, now, LISTENER_SMOOTHING_S);
}

function disconnectSource(source: SpatialSource): void {
  source.oscillator.disconnect();
  source.gain.disconnect();
  source.panner.disconnect();
}
