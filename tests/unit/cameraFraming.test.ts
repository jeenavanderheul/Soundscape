import { describe, expect, it } from 'vitest';
import { CAMERA_CONFIG } from '../../src/app/Config';
import { Camera } from '../../src/rendering/Camera';

/**
 * User (15 aug): at top speed the orb has to sit exactly as far away as it does
 * standing still. The lens is what was moving it, not the camera.
 */
describe('the orb is framed the same at any speed', () => {
  const apparentSize = (camera: Camera, distance: number): number => {
    // Half-height of what the lens covers at that distance: the orb's share of
    // the frame is its own size divided by this.
    return Math.tan((camera.instance.fov * Math.PI) / 360) * distance;
  };

  it('does not move the camera while the lens is at rest', () => {
    const camera = new Camera(1.6);
    camera.setSpeedFactor(0);
    expect(camera.instance.fov).toBe(CAMERA_CONFIG.fov);
    expect(camera.framingScale()).toBeCloseTo(1, 6);
  });

  it('keeps the orb the same size on screen from standstill to top speed', () => {
    const camera = new Camera(1.6);
    const base = 8;
    camera.setSpeedFactor(0);
    const atRest = apparentSize(camera, base * camera.framingScale());
    camera.setSpeedFactor(1);
    const flatOut = apparentSize(camera, base * camera.framingScale());
    expect(flatOut).toBeCloseTo(atRest, 6);
  });

  it('holds that framing high up too, where the lens opens furthest', () => {
    const camera = new Camera(1.6);
    const base = 8;
    camera.setSpeedFactor(0);
    const atRest = apparentSize(camera, base * camera.framingScale());
    camera.setSpeedFactor(1, 1.55);
    expect(camera.instance.fov).toBeGreaterThan(100);
    expect(apparentSize(camera, base * camera.framingScale())).toBeCloseTo(atRest, 6);
  });

  it('still opens the lens — the speed cue must survive the correction', () => {
    const camera = new Camera(1.6);
    camera.setSpeedFactor(1);
    expect(camera.instance.fov).toBeGreaterThan(CAMERA_CONFIG.fov + 25);
    // Compensating by pulling in means the camera really does sit closer.
    expect(camera.framingScale()).toBeLessThan(0.75);
  });
});
