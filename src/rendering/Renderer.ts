import { Color, FogExp2, Scene, WebGLRenderer } from 'three';
import { RENDER_CONFIG } from '../app/Config';
import { Camera } from './Camera';

/**
 * Owns the WebGLRenderer, near-black Scene and resize handling (spec §13).
 * Three.js runtime objects live here, never in stores.
 */
export class Renderer {
  readonly scene: Scene;
  readonly camera: Camera;
  private readonly webgl: WebGLRenderer;
  private readonly container: HTMLElement;
  private readonly onResize = (): void => {
    this.applySize();
  };

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new Scene();
    this.scene.background = new Color(RENDER_CONFIG.clearColor);
    this.scene.fog = this.fog;
    this.camera = new Camera(window.innerWidth / window.innerHeight);
    this.webgl = new WebGLRenderer({ antialias: true });
    this.webgl.setClearColor(RENDER_CONFIG.clearColor);
    this.applySize();
    container.appendChild(this.webgl.domElement);
    window.addEventListener('resize', this.onResize);
  }

  /** Distance fog is always on (game-style depth reference, §13); the
   * ambient attractor only thickens it toward its ceiling (§9.2). */
  private readonly fog = new FogExp2(RENDER_CONFIG.clearColor, RENDER_CONFIG.baseFogDensity);

  /**
   * §33: the air itself carries the region's colour, so the horizon changes
   * as the player turns — the strongest signal that a direction is a place.
   */
  setZoneColor(color: { r: number; g: number; b: number }): void {
    // The world stays near-black (§13): the region only TINTS the darkness.
    // Anything brighter turns the screen into a colour wash and the terrain
    // loses its contrast.
    this.fog.color.setRGB(color.r * 0.17, color.g * 0.17, color.b * 0.2);
    (this.scene.background as Color).setRGB(
      0.004 + color.r * 0.05,
      0.004 + color.g * 0.05,
      0.008 + color.b * 0.06,
    );
    this.webgl.setClearColor(this.scene.background as Color);
  }

  setAtmosphere(amount: number): void {
    const clamped = Math.min(1, Math.max(0, amount));
    this.fog.density =
      RENDER_CONFIG.baseFogDensity +
      clamped * (RENDER_CONFIG.maxFogDensity - RENDER_CONFIG.baseFogDensity);
    this.scene.fog = this.fog;
  }

  render(): void {
    this.webgl.render(this.scene, this.camera.instance);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.webgl.dispose();
    if (this.webgl.domElement.parentElement === this.container) {
      this.container.removeChild(this.webgl.domElement);
    }
  }

  private applySize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, RENDER_CONFIG.maxPixelRatio));
    this.webgl.setSize(width, height);
    this.camera.setAspect(width / height);
  }
}
