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
  setSpeedFactor(factor: number): void {
    const clamped = Math.min(1, Math.max(0, factor));
    // Top gear has to feel like a motorway: the lens opens up much further.
    const fov = CAMERA_CONFIG.fov + clamped * 30;
    if (Math.abs(this.instance.fov - fov) < 0.05) return;
    this.instance.fov = fov;
    this.instance.updateProjectionMatrix();
  }

  setAspect(aspect: number): void {
    this.instance.aspect = aspect;
    this.instance.updateProjectionMatrix();
  }
}
