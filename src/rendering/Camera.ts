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

  setAspect(aspect: number): void {
    this.instance.aspect = aspect;
    this.instance.updateProjectionMatrix();
  }
}
