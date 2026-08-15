import { describe, expect, it } from 'vitest';
// @ts-expect-error — the bake is a plain node script; its pure parts are exported for this.
import { parseBvh, poseAt, buildBody, classify } from '../../scripts/bake-mocap.mjs';

/**
 * §176. The bake is the only place mocap is ever interpreted, so if it is wrong
 * every dancer in the world is wrong and nothing downstream can tell. These
 * tests use a skeleton small enough to work out by hand.
 *
 * A two-bone arm, one metre up, one metre out, rotating 90 degrees about Z:
 *
 *      rest              frame 1
 *      tip                  hips ---- tip
 *       |
 *      hips
 */
const ARM_BVH = `HIERARCHY
ROOT Hips
{
  OFFSET 0.0 0.0 0.0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Head
  {
    OFFSET 0.0 100.0 0.0
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site
    {
      OFFSET 0.0 20.0 0.0
    }
  }
}
MOTION
Frames: 2
Frame Time: 0.0333333
0.0 0.0 0.0 0.0 0.0 0.0 0.0 0.0 0.0
0.0 0.0 0.0 0.0 0.0 0.0 90.0 0.0 0.0
`;

describe('§176 the BVH parser', () => {
  it('reads the hierarchy, the channels and the motion block', () => {
    const clip = parseBvh(ARM_BVH);
    expect(clip.joints.map((j: { name: string }) => j.name)).toEqual(['Hips', 'Head', 'Head_tip']);
    expect(clip.frameCount).toBe(2);
    expect(clip.frameTime).toBeCloseTo(1 / 30, 4);
    // Six root channels plus three for the head; the End Site has none.
    expect(clip.channelCount).toBe(9);
  });

  it('refuses a file that is not mocap instead of baking nonsense', () => {
    // The likeliest failure by far: a 404 page downloaded under a .bvh name.
    expect(() => parseBvh('<!DOCTYPE html><html><body>Not Found</body></html>')).toThrow(/HIERARCHY/);
    expect(() => parseBvh(ARM_BVH.replace('Frames: 2', 'Frames: 0'))).toThrow(/frame count/);
    expect(() => parseBvh(ARM_BVH.replace('90.0', 'banana'))).toThrow(/non-numeric/);
  });

  it('places joints where the offsets say, at rest', () => {
    const clip = parseBvh(ARM_BVH);
    const pose = poseAt(clip, 0);
    // Column 3 of each row is the translation.
    expect([pose[0][3], pose[0][7], pose[0][11]]).toEqual([0, 0, 0]);
    expect([pose[1][3], pose[1][7], pose[1][11]]).toEqual([0, 100, 0]);
    expect([pose[2][3], pose[2][7], pose[2][11]]).toEqual([0, 120, 0]);
  });

  it('rotates children about their parent, not about the world', () => {
    const clip = parseBvh(ARM_BVH);
    const pose = poseAt(clip, 1);
    // The head itself has not moved — its offset is applied before its rotation.
    expect(pose[1][7]).toBeCloseTo(100, 6);
    // The tip has swung 90 degrees about Z: from (0,120) to (-20,100).
    expect(pose[2][3]).toBeCloseTo(-20, 6);
    expect(pose[2][7]).toBeCloseTo(100, 6);
  });
});

describe('§176 the body', () => {
  it('recognises a joint from its name whatever the mocap provider called it', () => {
    // §09: CMU's two common conversions disagree on every name and agree on
    // every word inside them. Both of these have to land on "this is a hand".
    expect(classify('LeftHand').region).toBe(classify('lradius_hand').region);
    expect(classify('RightFoot').region).toBe(2);
    expect(classify('Spine1').region).toBe(3);
    // §177: CMU calls the thigh "LeftUpLeg" and the SHIN "LeftLeg". A rule
    // looking for "shin" or "calf" matches neither, so every shin quietly fell
    // through to the thigh and calves were built thigh-thick. The names that
    // actually appear in the data are the ones under test.
    expect(classify('LeftUpLeg').radius).toBeGreaterThan(classify('LeftLeg').radius);
    expect(classify('RightLeg').radius).toBe(classify('LeftLeg').radius);
    // And the bone out to the shoulder is chest width, not another arm.
    expect(classify('LeftShoulder').radius).toBeGreaterThan(classify('LeftArm').radius);
    expect(classify('LeftForeArm').radius).toBeLessThan(classify('LeftArm').radius);

    // Perception hangs off hands and heads, so they get more points than a shin.
    expect(classify('LeftHand').weight).toBeGreaterThan(classify('LeftLeg').weight);
    expect(classify('Head').weight).toBeGreaterThan(classify('Spine').weight);
  });

  it('fills the texture row exactly, so no dancer has a hole in them', () => {
    const clip = parseBvh(ARM_BVH);
    const body = buildBody(clip, 0.01);
    expect(body).toHaveLength(2048);
    for (const point of body) {
      expect(point.joint).toBeGreaterThanOrEqual(0);
      expect(point.joint).toBeLessThan(clip.joints.length);
      expect(point.local.every((v: number) => Number.isFinite(v))).toBe(true);
    }
  });

  it('bakes the same body from the same clip, every time', () => {
    const clip = parseBvh(ARM_BVH);
    expect(buildBody(clip, 0.01)).toEqual(buildBody(clip, 0.01));
  });
});
