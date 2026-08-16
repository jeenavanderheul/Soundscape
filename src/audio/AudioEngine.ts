/**
 * Owns the single AudioContext for the entire game (spec §12).
 * initialize() must only be called after a user gesture.
 * Signal chain: sources -> masterGain -> compressor (master safety limiter) -> destination.
 */
export class AudioEngine {
  private readonly contextCtor: typeof AudioContext;
  private audioContext: AudioContext | null = null;
  private gain: GainNode | null = null;
  private volume: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  /** Kept until there is a context to put it on (the knob outlives the audio). */
  private pendingVolume = 1;

  constructor(contextCtor: typeof AudioContext = AudioContext) {
    this.contextCtor = contextCtor;
  }

  async initialize(): Promise<void> {
    if (this.audioContext !== null) return;
    let context: AudioContext;
    try {
      context = new this.contextCtor();
    } catch (cause) {
      throw new Error(
        'AudioEngine: failed to create AudioContext. Web Audio may be unavailable in this browser.',
        { cause },
      );
    }
    const gain = context.createGain();
    const volume = context.createGain();
    const compressor = context.createDynamicsCompressor();
    // §145: the player's volume sits BETWEEN the master bus and the limiter,
    // which puts it after the analyser tap on `gain`. The picture is drawn
    // from how loud the music is, never from how loud you chose to hear it —
    // turning the knob down must not darken the world.
    gain.connect(volume);
    volume.connect(compressor);
    compressor.connect(context.destination);
    this.audioContext = context;
    this.gain = gain;
    this.volume = volume;
    this.compressor = compressor;
    volume.gain.value = this.pendingVolume;
  }

  get context(): AudioContext {
    if (this.audioContext === null) {
      throw new Error('AudioEngine is not initialized. Call initialize() after a user gesture.');
    }
    return this.audioContext;
  }

  /**
   * §191: a stream carrying exactly what the speakers get — tapped AFTER the
   * player's volume and the safety limiter, so a recording is the mix as
   * heard, never hotter than it.
   */
  createRecordingStream(): MediaStream {
    if (this.compressor === null || this.audioContext === null) {
      throw new Error('AudioEngine is not initialized. Call initialize() after a user gesture.');
    }
    const destination = this.audioContext.createMediaStreamDestination();
    this.compressor.connect(destination);
    return destination.stream;
  }

  get masterGain(): GainNode {
    if (this.gain === null) {
      throw new Error('AudioEngine is not initialized. Call initialize() after a user gesture.');
    }
    return this.gain;
  }

  /**
   * §145: what the player hears, 0..1 of full scale, ramped so a keypress is
   * never a click (§21). Safe to call before the context exists.
   */
  setVolume(gain: number): void {
    const value = gain < 0 ? 0 : gain > 1 ? 1 : gain;
    this.pendingVolume = value;
    if (!this.volume || !this.audioContext) return;
    const now = this.audioContext.currentTime;
    this.volume.gain.cancelScheduledValues(now);
    this.volume.gain.setTargetAtTime(value, now, 0.02);
  }

  /** Master input node other systems connect their output to. */
  getOutputNode(): AudioNode {
    return this.masterGain;
  }

  async suspend(): Promise<void> {
    await this.context.suspend();
  }

  async resume(): Promise<void> {
    await this.context.resume();
  }

  async dispose(): Promise<void> {
    if (this.audioContext === null) return;
    const context = this.audioContext;
    this.audioContext = null;
    this.gain = null;
    await context.close();
  }
}
