import { AdditiveBlending, BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three';
import { createRng } from '../core/rng';
import type { Vec3Data } from '../player/FrequencyState';
import {
  computeInterference,
  envelopeAt,
  type InterferenceDescriptor,
  type ResonanceEvent,
} from '../resonance/InterferenceField';

/**
 * Visual consequence of the same immutable ResonanceEvent the audio reacts
 * to (P5). Draws expanding concentric interference rings between player and
 * resonator: thin white/grey lines, one shared LineSegments with a fixed
 * preallocated pool — zero allocation per event after construction (§13).
 * Consonant → clean rings, faint green; dissonant → warped rings, faint red;
 * cancellation → collapsing rings; complex → purple irregular shimmer.
 * Intensity ramps in and decays exponentially — no strobing (§23).
 */

export const VISUAL_CONFIG = {
  maxPatterns: 8,
  ringsPerPattern: 6,
  segmentsPerRing: 64,
  expansionSpeed: 5,
  collapseSpeed: 4,
  /** Smooth ramp-in so a pattern never appears at full brightness (§23). */
  attackSeconds: 0.25,
  releaseThreshold: 0.02,
  baseGrey: 0.8,
  accentMix: 0.3,
  warpAmount: 0.35,
  wobbleAmount: 0.12,
} as const;

const ACCENTS: Record<InterferenceDescriptor['classification'], readonly [number, number, number]> =
  {
    harmonic: [0.55, 1, 0.62], // faint green
    amplification: [0.55, 1, 0.62],
    dissonant: [1, 0.45, 0.45], // faint red
    cancellation: [1, 1, 1], // pure grey collapse
    complex: [0.75, 0.5, 1], // faint purple
  };

interface PatternSlot {
  active: boolean;
  descriptor: InterferenceDescriptor | null;
  ageSeconds: number;
  /** Orthonormal ring-plane basis, perpendicular to descriptor.axis. */
  basisU: [number, number, number];
  basisV: [number, number, number];
  /** Per-vertex radial jitter, refilled (not reallocated) on spawn. */
  jitter: Float32Array;
}

interface ResonanceBusLike {
  on(event: 'resonance:event', handler: (event: ResonanceEvent) => void): () => void;
}

export type ResolveEventPositions = (
  event: ResonanceEvent,
) => { source: Vec3Data; target: Vec3Data } | null;

export class InterferenceVisuals {
  readonly lines: LineSegments;
  private readonly geometry: BufferGeometry;
  private readonly material: LineBasicMaterial;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly positionAttribute: BufferAttribute;
  private readonly colorAttribute: BufferAttribute;
  private readonly slots: PatternSlot[];
  private readonly seed: string;
  private pulse = 0;

  /** Beat/onset modulation from BeatSync — already depth-capped (§23). */
  setPulse(value: number): void {
    this.pulse = value;
  }

  constructor(seed = 'interference-visuals') {
    this.seed = seed;
    const { maxPatterns, ringsPerPattern, segmentsPerRing } = VISUAL_CONFIG;
    const vertexCount = maxPatterns * ringsPerPattern * segmentsPerRing * 2;
    this.positions = new Float32Array(vertexCount * 3);
    this.colors = new Float32Array(vertexCount * 3);
    this.slots = Array.from({ length: maxPatterns }, () => ({
      active: false,
      descriptor: null,
      ageSeconds: 0,
      basisU: [1, 0, 0],
      basisV: [0, 0, 1],
      jitter: new Float32Array(ringsPerPattern * segmentsPerRing),
    }));

    this.geometry = new BufferGeometry();
    this.positionAttribute = new BufferAttribute(this.positions, 3);
    this.colorAttribute = new BufferAttribute(this.colors, 3);
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('color', this.colorAttribute);
    this.material = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.lines = new LineSegments(this.geometry, this.material);
    this.lines.frustumCulled = false;
  }

  get activeCount(): number {
    return this.slots.reduce((count, slot) => count + (slot.active ? 1 : 0), 0);
  }

  /** Wire to the resonance bus; positions come from the caller (stores own them). */
  subscribe(bus: ResonanceBusLike, resolvePositions: ResolveEventPositions): () => void {
    return bus.on('resonance:event', (event) => {
      const positions = resolvePositions(event);
      if (positions) this.handleResonance(event, positions.source, positions.target);
    });
  }

  /** One shared event → one visual pattern (P5). */
  handleResonance(event: ResonanceEvent, sourcePosition: Vec3Data, targetPosition: Vec3Data): void {
    const descriptor = computeInterference(
      { position: sourcePosition, hz: event.sourceHz, amplitude: event.amplitude, phase: 0 },
      {
        position: targetPosition,
        hz: event.targetHz,
        amplitude: event.amplitude,
        phase: event.phaseDifference,
      },
      event,
    );
    this.spawn(descriptor);
  }

  spawn(descriptor: InterferenceDescriptor): void {
    const slot = this.acquireSlot();
    slot.active = true;
    slot.descriptor = descriptor;
    slot.ageSeconds = 0;
    computeBasis(descriptor.axis, slot.basisU, slot.basisV);
    // Deterministic jitter: refill the preallocated buffer, no allocation.
    const rng = createRng(`${this.seed}:${descriptor.seed}`);
    for (let i = 0; i < slot.jitter.length; i++) {
      slot.jitter[i] = rng.next() * 2 - 1;
    }
  }

  update(dtSeconds: number): void {
    for (let slotIndex = 0; slotIndex < this.slots.length; slotIndex++) {
      const slot = this.slots[slotIndex]!;
      if (!slot.active || !slot.descriptor) continue;
      slot.ageSeconds += dtSeconds;
      const envelope = envelopeAt(slot.descriptor.decaySeconds, slot.ageSeconds);
      if (envelope < VISUAL_CONFIG.releaseThreshold) {
        this.release(slotIndex, slot);
        continue;
      }
      this.writeSlot(slotIndex, slot, envelope);
    }
    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  /** Reuse a free slot, or steal the oldest pattern when the pool is full. */
  private acquireSlot(): PatternSlot {
    let oldest = this.slots[0]!;
    for (const slot of this.slots) {
      if (!slot.active) return slot;
      if (slot.ageSeconds > oldest.ageSeconds) oldest = slot;
    }
    return oldest;
  }

  private release(slotIndex: number, slot: PatternSlot): void {
    slot.active = false;
    slot.descriptor = null;
    const { ringsPerPattern, segmentsPerRing } = VISUAL_CONFIG;
    const floatsPerSlot = ringsPerPattern * segmentsPerRing * 2 * 3;
    const base = slotIndex * floatsPerSlot;
    this.positions.fill(0, base, base + floatsPerSlot);
    this.colors.fill(0, base, base + floatsPerSlot);
  }

  private writeSlot(slotIndex: number, slot: PatternSlot, envelope: number): void {
    const d = slot.descriptor!;
    const cfg = VISUAL_CONFIG;
    const age = slot.ageSeconds;
    // Smooth attack ramp: no sudden full-brightness flash (§23).
    const attack = Math.min(age / cfg.attackSeconds, 1);
    const level = d.intensity * envelope * attack * attack * (3 - 2 * attack) * (1 + this.pulse);
    const accent = ACCENTS[d.classification];
    const grey = cfg.baseGrey;
    const mix = cfg.accentMix;
    const r = (grey * (1 - mix) + accent[0] * mix) * level;
    const g = (grey * (1 - mix) + accent[1] * mix) * level;
    const b = (grey * (1 - mix) + accent[2] * mix) * level;

    const collapsing = d.classification === 'cancellation';
    const radialShift = collapsing ? -cfg.collapseSpeed * age : cfg.expansionSpeed * age;
    // Beating reads as slow spatial wobble of the ring radius, never flashing.
    const wobble = Math.sin(2 * Math.PI * d.beatWobbleHz * age) * d.ringSpacing * cfg.wobbleAmount;
    const warpScale = d.warp * d.ringSpacing * cfg.warpAmount;
    // Complex patterns shimmer: their jitter drifts over time.
    const shimmer = d.classification === 'complex' ? age * 1.5 : 0;

    const { ringsPerPattern, segmentsPerRing } = VISUAL_CONFIG;
    const [ux, uy, uz] = slot.basisU;
    const [vx, vy, vz] = slot.basisV;
    const { center } = d;
    const positions = this.positions;
    const colors = this.colors;
    const slotVertexBase = slotIndex * ringsPerPattern * segmentsPerRing * 2;

    for (let ring = 0; ring < ringsPerPattern; ring++) {
      const baseRadius = Math.max((ring + 1) * d.ringSpacing + radialShift + wobble, 0.02);
      const jitterBase = ring * segmentsPerRing;
      for (let seg = 0; seg < segmentsPerRing; seg++) {
        const vertexIndex = (slotVertexBase + (jitterBase + seg) * 2) * 3;
        writeRingPoint(
          positions,
          vertexIndex,
          center,
          ux, uy, uz, vx, vy, vz,
          baseRadius,
          ringRadiusJitter(slot.jitter, jitterBase, seg, segmentsPerRing, warpScale, shimmer),
          (seg / segmentsPerRing) * Math.PI * 2,
        );
        const next = (seg + 1) % segmentsPerRing;
        writeRingPoint(
          positions,
          vertexIndex + 3,
          center,
          ux, uy, uz, vx, vy, vz,
          baseRadius,
          ringRadiusJitter(slot.jitter, jitterBase, next, segmentsPerRing, warpScale, shimmer),
          (next / segmentsPerRing) * Math.PI * 2,
        );
        colors[vertexIndex] = r;
        colors[vertexIndex + 1] = g;
        colors[vertexIndex + 2] = b;
        colors[vertexIndex + 3] = r;
        colors[vertexIndex + 4] = g;
        colors[vertexIndex + 5] = b;
      }
    }
  }
}

function ringRadiusJitter(
  jitter: Float32Array,
  jitterBase: number,
  seg: number,
  segmentsPerRing: number,
  warpScale: number,
  shimmer: number,
): number {
  const raw = jitter[jitterBase + seg]!;
  if (shimmer === 0) return raw * warpScale;
  // Shimmer: rotate the jitter phase over time for an irregular drift.
  return Math.sin(raw * Math.PI + shimmer + (seg / segmentsPerRing) * Math.PI * 2) * warpScale;
}

function writeRingPoint(
  positions: Float32Array,
  index: number,
  center: Vec3Data,
  ux: number, uy: number, uz: number,
  vx: number, vy: number, vz: number,
  baseRadius: number,
  radiusOffset: number,
  angle: number,
): void {
  const radius = Math.max(baseRadius + radiusOffset, 0.01);
  const cos = Math.cos(angle) * radius;
  const sin = Math.sin(angle) * radius;
  positions[index] = center.x + ux * cos + vx * sin;
  positions[index + 1] = center.y + uy * cos + vy * sin;
  positions[index + 2] = center.z + uz * cos + vz * sin;
}

/** Orthonormal basis perpendicular to the source→target axis, written in place. */
function computeBasis(
  axis: Vec3Data,
  outU: [number, number, number],
  outV: [number, number, number],
): void {
  // Pick the world axis least aligned with `axis` to avoid degeneracy.
  const ref: [number, number, number] = Math.abs(axis.y) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  // u = normalize(ref × axis)
  let ux = ref[1] * axis.z - ref[2] * axis.y;
  let uy = ref[2] * axis.x - ref[0] * axis.z;
  let uz = ref[0] * axis.y - ref[1] * axis.x;
  const uLength = Math.hypot(ux, uy, uz) || 1;
  ux /= uLength;
  uy /= uLength;
  uz /= uLength;
  outU[0] = ux;
  outU[1] = uy;
  outU[2] = uz;
  // v = axis × u (already unit length)
  outV[0] = axis.y * uz - axis.z * uy;
  outV[1] = axis.z * ux - axis.x * uz;
  outV[2] = axis.x * uy - axis.y * ux;
}
