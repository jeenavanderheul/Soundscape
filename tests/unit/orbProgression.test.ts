import { describe, expect, it } from 'vitest';
import { ORB_BASE_RADIUS, PlayerOrb } from '../../src/rendering/PlayerOrb';
import { FLIGHT_CONFIG } from '../../src/player/FrequencyController';
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
    expect(orb.mesh.scale.x).toBeGreaterThan(4);
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

  it('sinks back to its first form when the growth it is fed falls away', () => {
    const orb = new PlayerOrb();
    orb.setGrowth(1);
    fly(orb, 30);
    expect(orb.mesh.scale.x).toBeGreaterThan(4);
    // §42: standing still feeds it zero — the orb returns to the first form.
    orb.setGrowth(0);
    fly(orb, 20);
    expect(orb.mesh.scale.x).toBeLessThan(1.1);
    expect(orb.material.uniforms.uGrowth!.value).toBeLessThan(0.05);
    orb.dispose();
  });

  it('reports the radius it actually measures, so the collision can follow it', () => {
    const orb = new PlayerOrb();
    fly(orb, 1);
    const small = orb.radius;
    expect(small).toBeCloseTo(ORB_BASE_RADIUS, 2);
    orb.setGrowth(1);
    fly(orb, 30);
    // §35: the orb outgrows the old fixed clearance, which is exactly why the
    // controller is fed this number every frame instead of a constant.
    expect(orb.radius).toBeGreaterThan(small * 4);
    expect(orb.radius).toBeGreaterThan(FLIGHT_CONFIG.orbRadius);
    orb.dispose();
  });
});

describe('§52 the orb is shaped by how it flies', () => {
  const flying = (velocity: number, direction = { x: 0, y: 0, z: -1 }) => ({
    ...createInitialFrequencyState(),
    velocity,
    direction,
  });

  function settle(orb: PlayerOrb, state: ReturnType<typeof flying>, seconds: number) {
    for (let t = 0; t < seconds; t += 1 / 60) orb.update(state, 0, 1 / 60, t);
  }

  it('stretches into an oval with speed instead of wobbling', () => {
    const orb = new PlayerOrb();
    settle(orb, flying(0), 1);
    const still = orb.mesh.scale.clone();
    expect(still.z / still.x).toBeCloseTo(1, 2); // round at rest
    settle(orb, flying(66), 1);
    expect(orb.mesh.scale.z / orb.mesh.scale.x).toBeGreaterThan(1.8);
    // And the surface itself stays calm: the shape comes from the flight.
    expect(orb.material.uniforms.uDeform!.value).toBeLessThan(0.12);
    orb.dispose();
  });

  it('leans into a turn, and the lean settles instead of snapping', () => {
    const orb = new PlayerOrb();
    settle(orb, flying(30), 0.5);
    const level = orb.mesh.rotation.z;
    for (let t = 0; t < 1; t += 1 / 60) {
      orb.setFlight(2.5, 0, 1 / 60);
      orb.update(flying(30), 0, 1 / 60, t);
    }
    expect(Math.abs(orb.mesh.rotation.z - level)).toBeGreaterThan(0.05);
    orb.dispose();
  });
});
