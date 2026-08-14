import { Color, DirectionalLight, FogExp2, HemisphereLight, Scene, WebGLRenderer } from 'three';
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
    // §135: until now nothing in this scene was LIT — every material was
    // additive glow, which has no shaded side and no occlusion, so solid
    // objects read as flat cut-outs. One key light and one sky light is all it
    // takes for mass to look like mass; only lit materials see them, so the
    // grid, the orb and the trails are unaffected.
    // LOW and to the side, not overhead: this forest is made of verticals, and
    // a light from above only lights their caps — which is how a lit scene can
    // still come out as black cut-outs.
    this.sun.position.set(1, 0.5, 0.6).multiplyScalar(100);
    this.fill.position.set(-0.9, 0.35, -0.7).multiplyScalar(100);
    this.scene.add(this.sun);
    this.scene.add(this.fill);
    this.scene.add(this.sky);
    this.camera = new Camera(window.innerWidth / window.innerHeight);
    this.webgl = new WebGLRenderer({ antialias: true });
    this.webgl.setClearColor(RENDER_CONFIG.clearColor);
    this.applySize();
    container.appendChild(this.webgl.domElement);
    window.addEventListener('resize', this.onResize);
  }

  /** §135: one key light, low and to the side, so verticals get a lit face
   * and a dark face — that difference IS the depth cue. */
  private readonly sun = new DirectionalLight(0xffffff, 2.6);
  /** Opposite side, weak: keeps the shaded face dark but never a hole. */
  private readonly fill = new DirectionalLight(0xffffff, 0.7);
  /** Sky above, near-black ground below: keeps the underside from going flat. */
  private readonly sky = new HemisphereLight(0x9fb4c8, 0x0b0d14, 1.7);

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
    // A region has to be nameable at a glance. The world still reads as
    // near-black (§13) — the fog and the sky are what carry the hue, and the
    // scan lines stay bright on top of it.
    this.fog.color.setRGB(color.r * 0.34, color.g * 0.34, color.b * 0.38);
    (this.scene.background as Color).setRGB(
      0.004 + color.r * 0.11,
      0.004 + color.g * 0.11,
      0.008 + color.b * 0.13,
    );
    this.webgl.setClearColor(this.scene.background as Color);
    // The region colours its own daylight, so a forest is lit by the world it
    // stands in rather than tinted after the fact.
    this.sky.color.setRGB(0.35 + color.r * 0.65, 0.4 + color.g * 0.6, 0.45 + color.b * 0.55);
    this.sun.color.setRGB(0.65 + color.r * 0.35, 0.62 + color.g * 0.38, 0.6 + color.b * 0.4);
    this.fill.color.setRGB(0.3 + color.r * 0.4, 0.32 + color.g * 0.4, 0.4 + color.b * 0.4);
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
