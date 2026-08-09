/**
 * Owns the single AudioContext for the entire game (spec §12).
 * initialize() must only be called after a user gesture.
 * Signal chain: sources -> masterGain -> compressor (master safety limiter) -> destination.
 */
export class AudioEngine {
  private readonly contextCtor: typeof AudioContext;
  private audioContext: AudioContext | null = null;
  private gain: GainNode | null = null;

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
    const compressor = context.createDynamicsCompressor();
    gain.connect(compressor);
    compressor.connect(context.destination);
    this.audioContext = context;
    this.gain = gain;
  }

  get context(): AudioContext {
    if (this.audioContext === null) {
      throw new Error('AudioEngine is not initialized. Call initialize() after a user gesture.');
    }
    return this.audioContext;
  }

  get masterGain(): GainNode {
    if (this.gain === null) {
      throw new Error('AudioEngine is not initialized. Call initialize() after a user gesture.');
    }
    return this.gain;
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
