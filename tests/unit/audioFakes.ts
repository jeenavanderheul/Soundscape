/** Shared fake Web Audio nodes for unit-testing audio code without a browser. */

export interface ParamCall {
  method: 'setTargetAtTime' | 'setValueAtTime' | 'linearRampToValueAtTime';
  value: number;
  time: number;
  timeConstant?: number;
}

export class FakeAudioParam {
  value: number;
  calls: ParamCall[] = [];

  constructor(value = 0) {
    this.value = value;
  }

  setTargetAtTime(value: number, time: number, timeConstant: number): void {
    this.calls.push({ method: 'setTargetAtTime', value, time, timeConstant });
  }

  setValueAtTime(value: number, time: number): void {
    this.calls.push({ method: 'setValueAtTime', value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.calls.push({ method: 'linearRampToValueAtTime', value, time });
  }

  cancelScheduledValues(_time: number): void {}

  get lastRampedValue(): number | undefined {
    return this.calls.at(-1)?.value;
  }
}

export class FakeNode {
  connections: unknown[] = [];
  disconnectCalls = 0;

  connect(target: unknown): unknown {
    this.connections.push(target);
    return target;
  }

  disconnect(): void {
    this.disconnectCalls += 1;
    this.connections = [];
  }
}

export class FakeGainNode extends FakeNode {
  gain = new FakeAudioParam(1);
}

export class FakeOscillatorNode extends FakeNode {
  type = 'sine';
  frequency = new FakeAudioParam(440);
  startCalls = 0;
  stopCalls = 0;
  stopTimes: number[] = [];
  onended: (() => void) | null = null;

  start(): void {
    this.startCalls += 1;
  }

  stop(when = 0): void {
    this.stopCalls += 1;
    this.stopTimes.push(when);
    // Fakes end synchronously so tests can observe onended cleanup.
    this.onended?.();
  }
}

export class FakePannerNode extends FakeNode {
  panningModel = 'equalpower';
  distanceModel = 'inverse';
  refDistance = 1;
  maxDistance = 10000;
  rolloffFactor = 1;
  positionX = new FakeAudioParam(0);
  positionY = new FakeAudioParam(0);
  positionZ = new FakeAudioParam(0);
  orientationX = new FakeAudioParam(1);
  orientationY = new FakeAudioParam(0);
  orientationZ = new FakeAudioParam(0);
}

export class FakeAudioListener {
  positionX = new FakeAudioParam(0);
  positionY = new FakeAudioParam(0);
  positionZ = new FakeAudioParam(0);
  forwardX = new FakeAudioParam(0);
  forwardY = new FakeAudioParam(0);
  forwardZ = new FakeAudioParam(-1);
  upX = new FakeAudioParam(0);
  upY = new FakeAudioParam(1);
  upZ = new FakeAudioParam(0);
}

export class FakeCompressorNode extends FakeNode {}

export class FakeAudioContext {
  currentTime = 0;
  state: 'running' | 'suspended' | 'closed' = 'running';
  listener = new FakeAudioListener();
  destination = new FakeNode();
  createdOscillators: FakeOscillatorNode[] = [];
  createdGains: FakeGainNode[] = [];
  createdPanners: FakePannerNode[] = [];
  createdCompressors: FakeCompressorNode[] = [];

  createDynamicsCompressor(): FakeCompressorNode {
    const node = new FakeCompressorNode();
    this.createdCompressors.push(node);
    return node;
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }

  async suspend(): Promise<void> {
    this.state = 'suspended';
  }

  async close(): Promise<void> {
    this.state = 'closed';
  }

  createOscillator(): FakeOscillatorNode {
    const node = new FakeOscillatorNode();
    this.createdOscillators.push(node);
    return node;
  }

  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.createdGains.push(node);
    return node;
  }

  createPanner(): FakePannerNode {
    const node = new FakePannerNode();
    this.createdPanners.push(node);
    return node;
  }
}

export function asContext(fake: FakeAudioContext): AudioContext {
  return fake as unknown as AudioContext;
}

export function asOutput(fake: FakeNode): AudioNode {
  return fake as unknown as AudioNode;
}
