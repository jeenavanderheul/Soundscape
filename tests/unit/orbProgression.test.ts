import { describe, expect, it } from 'vitest';
import { PlayerOrb } from '../../src/rendering/PlayerOrb';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';
import {
  LEVEL_DEEP,
  LEVEL_EARNED,
  createInitialTrackState,
  trackGrowth,
} from '../../src/music/TrackState';

function fly(orb: PlayerOrb, seconds: number): void {
  const dt = 1 / 60;
  const state = createInitialFrequencyState();
  for (let t = 0; t < seconds; t += dt) orb.update(state, 0, dt, t);
}

describe('§29.6 track growth', () => {
  it('is zero on a bare tone and one on a finished track', () => {
    const empty = createInitialTrackState();
    expect(trackGrowth(empty)).toBe(0);
    const full = createInitialTrackState();
    for (const layer of [full.drums.kick, full.drums.snare, full.drums.hats]) {
      layer.unlocked = true;
      layer.level = LEVEL_DEEP;
    }
    for (const layer of [full.bass, full.harmony, full.melody, full.texture]) {
      layer.unlocked = true;
      layer.level = LEVEL_DEEP;
    }
    expect(trackGrowth(full)).toBe(1);
  });

  it('rises with every earned layer and again when a layer deepens', () => {
    const track = createInitialTrackState();
    track.drums.kick = { unlocked: true, level: LEVEL_EARNED };
    const earned = trackGrowth(track);
    expect(earned).toBeGreaterThan(0);
    track.drums.kick = { unlocked: true, level: LEVEL_DEEP };
    expect(trackGrowth(track)).toBeGreaterThan(earned);
    track.bass = { unlocked: true, level: LEVEL_EARNED };
    expect(trackGrowth(track)).toBeGreaterThan(2 * earned);
  });
});

describe('§29.6 the orb becomes the track', () => {
  it('starts small and minimal', () => {
    const orb = new PlayerOrb();
    fly(orb, 1);
    expect(orb.mesh.scale.x).toBeCloseTo(1, 2);
    expect(orb.material.uniforms.uGrowth!.value).toBeCloseTo(0, 3);
    orb.dispose();
  });

  it('grows in size, complexity and glow as layers are earned', () => {
    const orb = new PlayerOrb();
    fly(orb, 1);
    const glowAtStart = orb.material.uniforms.uGlow!.value as number;
    orb.setGrowth(1);
    fly(orb, 20);
    expect(orb.mesh.scale.x).toBeGreaterThan(2);
    expect(orb.material.uniforms.uGrowth!.value).toBeGreaterThan(0.9);
    expect(orb.material.uniforms.uGlow!.value).toBeGreaterThan(glowAtStart);
    orb.dispose();
  });

  it('grows slowly — a layer is a milestone, not a flicker', () => {
    const orb = new PlayerOrb();
    orb.setGrowth(1);
    fly(orb, 0.5);
    expect(orb.material.uniforms.uGrowth!.value).toBeLessThan(0.3);
    orb.dispose();
  });

  it('stays inside the collision radius at full growth', () => {
    const orb = new PlayerOrb();
    orb.setGrowth(1);
    fly(orb, 30);
    const ORB_COLLISION_RADIUS = 1.6;
    expect(0.55 * orb.mesh.scale.x).toBeLessThan(ORB_COLLISION_RADIUS);
    orb.dispose();
  });
});
