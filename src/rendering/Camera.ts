import { PerspectiveCamera } from 'three';
import { CAMERA_CONFIG } from '../app/Config';

/** Owns the Three.js PerspectiveCamera runtime object (never stored in stores). */
export class Camera {
  readonly instance: PerspectiveCamera;

  constructor(aspect: number) {
    this.instance = new PerspectiveCamera(
      CAMERA_CONFIG.fov,
      aspect,
      CAMERA_CONFIG.near,
      CAMERA_CONFIG.far,
    );
    const { x, y, z } = CAMERA_CONFIG.initialPosition;
    this.instance.position.set(x, y, z);
  }

  /**
   * §36: speed widens the lens. Subtle on purpose — enough to feel the push
   * of an acceleration, never enough to read as a fisheye effect.
   */
  setSpeedFactor(factor: number, altitudeLift = 1): void {
    const clamped = Math.min(1, Math.max(0, factor));
    // Top gear has to feel like a motorway: the lens opens up much further.
    // High up the ground is too far away to sell the speed, so the same push
    // opens the lens further there — the widening carries what parallax can't.
    const fov = CAMERA_CONFIG.fov + clamped * 30 * altitudeLift;
    if (Math.abs(this.instance.fov - fov) < 0.05) return;
    this.instance.fov = fov;
    this.instance.updateProjectionMatrix();
  }

  /**
   * How much closer the camera must sit for the orb to stay the size it is at
   * rest. A wider lens shrinks everything in frame, which reads as the camera
   * having backed away — user (15 aug): "op topsnelheid wil ik de afstand van
   * de camera hetzelfde houden als in het begin".
   *
   * Pulling in by the ratio of the half-angle tangents keeps the orb exactly
   * the same size on screen while the world around it still stretches, which is
   * the dolly zoom: the speed cue survives, the subject does not move.
   */
  framingScale(): number {
    const half = (deg: number) => Math.tan((deg * Math.PI) / 360);
    return half(CAMERA_CONFIG.fov) / half(this.instance.fov);
  }

  setAspect(aspect: number): void {
    this.instance.aspect = aspect;
    this.instance.updateProjectionMatrix();
  }
}
