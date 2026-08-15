import { describe, expect, it } from 'vitest';
import type { InstancedBufferAttribute } from 'three';

import { CrowdField, CROWD_CONFIG, type CrowdManifest } from '../../src/rendering/CrowdField';

/**
 * §176. Two things about the crowd are rules rather than settings, and both of
 * them have already been learned the expensive way on something else:
 *
 *   - nobody floats. §153 took three tellings on the trees before `lift` was
 *     deleted outright. The crowd gets a measurement instead of a promise.
 *   - the crowd is what the track EARNED. In silence there is nobody there,
 *     because that is what makes it music rather than scenery.
 */

const MANIFEST: CrowdManifest = {
  points: 2048,
  frames: 128,
  clips: [0, 1, 2].map((i) => ({
    name: `clip-${i}`,
    file: `clip-${i}.vat`,
    points: 2048,
    frames: 128,
    seconds: 4.3,
  })),
};

/** One clip's worth of half-float texels; the contents do not matter here. */
function fakeClip(): ArrayBuffer {
  return new Uint16Array(MANIFEST.points * MANIFEST.frames * 4).buffer;
}

/** A ground that is never flat, so "on the ground" cannot pass by accident. */
const hilly = (x: number, z: number): number => Math.sin(x * 0.03) * 40 + Math.cos(z * 0.021) * 25;

function posed(): CrowdField {
  const crowd = new CrowdField();
  crowd.setPose(MANIFEST, MANIFEST.clips.map(fakeClip));
  return crowd;
}

function fly(crowd: CrowdField, x: number, z: number, seconds = 1): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    crowd.update({ x, y: 30, z }, hilly, i / 60, 1 / 60);
  }
}

describe('§176 the crowd stands on the ground', () => {
  it('puts every dancer on the terrain, never above it', () => {
    const crowd = posed();
    crowd.setSignal(1, 7);
    fly(crowd, 0, 0, 2);
    const stats = crowd.stats();
    expect(stats.dancers).toBeGreaterThan(50);
    // Half a world unit on a fourteen-unit body: the rolling reground sweep is
    // at most a fifth of a second behind, and nothing is ever in the air.
    expect(stats.feetError).toBeLessThan(1);
    crowd.dispose();
  });

  it('follows the ground when the player moves somewhere else entirely', () => {
    const crowd = posed();
    crowd.setSignal(1, 7);
    fly(crowd, 0, 0, 1);
    fly(crowd, 900, -700, 2);
    expect(crowd.stats().feetError).toBeLessThan(1);
    crowd.dispose();
  });

  it('leaves room around the orb instead of standing on top of it', () => {
    const crowd = posed();
    crowd.setSignal(1, 7);
    fly(crowd, 0, 0, 2);
    // Nothing inside the clearance means the near tier is a crowd you are in,
    // not a body clipping through the camera.
    const origins = (
      crowd.tiers[0]!.geometry.getAttribute('aOrigin') as InstancedBufferAttribute
    );
    const drawn = crowd.stats().drawn[0]!;
    for (let i = 0; i < drawn; i++) {
      expect(Math.hypot(origins.getX(i), origins.getZ(i))).toBeGreaterThanOrEqual(
        CROWD_CONFIG.clearance - 0.001,
      );
    }
    crowd.dispose();
  });
});

describe('§176 the crowd is what the track earned', () => {
  it('is empty in silence and nobody is drawn', () => {
    const crowd = posed();
    crowd.setSignal(0, 0);
    fly(crowd, 0, 0, 1);
    expect(crowd.uniformSnapshot()['intensity']).toBe(0);
    expect(crowd.uniformSnapshot()['visible']).toBe(false);
    crowd.dispose();
  });

  it('grows with the ladder rather than switching on', () => {
    const crowd = posed();
    const at = (layers: number): number => {
      crowd.setSignal(1, layers);
      return crowd.uniformSnapshot()['intensity'] as number;
    };
    const steps = [0, 1, 2, 3, 4, 5].map(at);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
    }
    // Five layers is the full field — the same rung §175 turns the rig into
    // one orbit, so the crowd and the light arrive together.
    expect(at(5)).toBeCloseTo(1, 5);
    expect(at(7)).toBeCloseTo(1, 5);
    crowd.dispose();
  });

  it('empties again when the arrangement drops out', () => {
    const crowd = posed();
    crowd.setSignal(1, 5);
    const full = crowd.uniformSnapshot()['intensity'] as number;
    // A break: the layers are still earned, but nothing is sounding.
    crowd.setSignal(0.05, 5);
    expect(crowd.uniformSnapshot()['intensity'] as number).toBeLessThan(full * 0.5);
    crowd.dispose();
  });

  it('only lets the crowd move as one once the track has something to share', () => {
    const crowd = posed();
    crowd.setSignal(1, 1);
    expect(crowd.uniformSnapshot()['coherence']).toBe(0);
    crowd.setSignal(1, 5);
    expect(crowd.uniformSnapshot()['coherence'] as number).toBeGreaterThan(0.9);
    crowd.dispose();
  });
});

describe('§176 the crowd is a crowd, not a pattern', () => {
  it('spreads detail by distance, nearest first', () => {
    const crowd = posed();
    crowd.setSignal(1, 7);
    fly(crowd, 0, 0, 2);
    const [near, mid, far] = crowd.stats().drawn as [number, number, number];
    expect(near).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(near);
    expect(far).toBeGreaterThan(0);
    expect(near).toBeLessThanOrEqual(CROWD_CONFIG.near);
    expect(mid).toBeLessThanOrEqual(CROWD_CONFIG.mid);
    crowd.dispose();
  });

  it('stands people in groups with gaps, not on a lattice', () => {
    const crowd = posed();
    crowd.setSignal(1, 7);
    fly(crowd, 0, 0, 2);
    const origins = crowd.tiers[1]!.geometry.getAttribute('aOrigin') as InstancedBufferAttribute;
    const count = crowd.stats().drawn[1]!;
    const gaps: number[] = [];
    for (let i = 1; i < count; i++) {
      gaps.push(
        Math.hypot(origins.getX(i) - origins.getX(i - 1), origins.getZ(i) - origins.getZ(i - 1)),
      );
    }
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const spread = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
    // A grid has one spacing. A crowd has clumps and holes, so the spacing
    // varies about as much as it measures.
    expect(spread).toBeGreaterThan(mean * 0.4);
    crowd.dispose();
  });

  it('gives dancers different clips, headings and sizes', () => {
    const crowd = posed();
    crowd.setSignal(1, 7);
    fly(crowd, 0, 0, 2);
    const variants = crowd.tiers[1]!.geometry.getAttribute('aVariant') as InstancedBufferAttribute;
    const count = crowd.stats().drawn[1]!;
    const clips = new Set<number>();
    // Quadrants, not exact angles: with ninety dancers over six radians any
    // bucketing collides, and what matters is that they face every way rather
    // than all squaring up to the same thing.
    const quadrants = [0, 0, 0, 0];
    const phases = new Set<number>();
    let minScale = Infinity;
    let maxScale = -Infinity;
    for (let i = 0; i < count; i++) {
      clips.add(variants.getW(i));
      quadrants[Math.floor((variants.getX(i) / (Math.PI * 2)) * 4) % 4]! += 1;
      phases.add(Math.round(variants.getZ(i) * 1000));
      minScale = Math.min(minScale, variants.getY(i));
      maxScale = Math.max(maxScale, variants.getY(i));
    }
    expect(clips.size).toBe(MANIFEST.clips.length);
    for (const share of quadrants) expect(share).toBeGreaterThan(count * 0.1);
    // Phase is what actually stops the crowd being one dancer copied ninety
    // times, so it has to be spread across the whole clip rather than merely
    // distinct — two people a thousandth of a loop apart are still not in sync.
    const spread = [...phases].sort((a, b) => a - b);
    expect(spread[0]!).toBeLessThan(80);
    expect(spread[spread.length - 1]!).toBeGreaterThan(920);
    expect(phases.size).toBeGreaterThan(count * 0.95);
    expect(maxScale - minScale).toBeGreaterThan(0.1);
    crowd.dispose();
  });

  it('builds the same crowd from the same flight', () => {
    const read = (): number[] => {
      const crowd = posed();
      crowd.setSignal(1, 7);
      fly(crowd, 120, -60, 2);
      const origins = crowd.tiers[0]!.geometry.getAttribute('aOrigin') as InstancedBufferAttribute;
      const out = Array.from(origins.array as Float32Array);
      crowd.dispose();
      return out;
    };
    expect(read()).toEqual(read());
  });
});

describe('§176 the bake and the runtime have to agree', () => {
  it('refuses a clip that is the wrong size rather than drawing rubbish', () => {
    const crowd = new CrowdField();
    const short = [new Uint16Array(64).buffer, fakeClip(), fakeClip()];
    expect(() => crowd.setPose(MANIFEST, short)).toThrow(/expected/);
    crowd.dispose();
  });

  it('refuses a manifest that does not match the clips it was handed', () => {
    const crowd = new CrowdField();
    expect(() => crowd.setPose(MANIFEST, [fakeClip()])).toThrow(/disagree/);
    crowd.dispose();
  });

  it('draws nobody at all until the bake arrives', () => {
    const crowd = new CrowdField();
    crowd.setSignal(1, 7);
    fly(crowd, 0, 0, 1);
    expect(crowd.stats().dancers).toBe(0);
    crowd.dispose();
  });
});
