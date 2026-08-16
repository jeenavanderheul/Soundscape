import { Color, FogExp2, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { RENDER_CONFIG } from '../app/Config';
import { Camera } from './Camera';
import { SignalPass } from './SignalPass';

/**
 * Owns the WebGLRenderer, near-black Scene and resize handling (spec §13).
 * Three.js runtime objects live here, never in stores.
 */
export class Renderer {
  readonly scene: Scene;
  readonly camera: Camera;
  /** §156: the world's treatment pass — persistence, ghosting, grain, clipping. */
  readonly post: SignalPass;
  private readonly webgl: WebGLRenderer;
  private readonly container: HTMLElement;
  private readonly onResize = (): void => {
    this.applySize();
  };
  /**
   * §159: a lost context is the worst failure this thing has. A laptop
   * switching GPUs or waking from sleep drops it, and without these two lines
   * the player is left looking at a frozen black canvas with no way back —
   * the browser will not even try to restore unless the default is prevented.
   */
  /** The picture itself, for the demo recorder (§191). */
  get canvas(): HTMLCanvasElement {
    return this.webgl.domElement;
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
  };
  private readonly onContextRestored = (): void => {
    this.contextLost = false;
    // Everything the pass owns lives in GPU memory that just went away.
    this.post.dispose();
    this.applySize();
  };
  private contextLost = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new Scene();
    this.scene.background = new Color(RENDER_CONFIG.clearColor);
    this.scene.fog = this.fog;
    this.camera = new Camera(window.innerWidth / window.innerHeight);
    this.webgl = new WebGLRenderer({ antialias: true });
    this.webgl.setClearColor(RENDER_CONFIG.clearColor);
    this.post = new SignalPass(this.webgl);
    this.applySize();
    container.appendChild(this.webgl.domElement);
    window.addEventListener('resize', this.onResize);
    this.webgl.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.webgl.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
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
    // A region has to be nameable at a glance. The world still reads as
    // near-black (§13) — the fog and the sky are what carry the hue, and the
    // scan lines stay bright on top of it.
    // §163: these are sRGB numbers, and they have to be declared as such.
    // three treats a bare setRGB as LINEAR light, so the "near-black tint" of
    // 0.11 was being encoded to 0.347 — about 88/255 on screen — and the fog's
    // 0.34 to roughly 156/255. An audit measured the empty sky at rgb(39,60,77)
    // in a world whose clear colour is 0x020202. Nothing in the frame was
    // black, and §136 asks for 85-95% of it to be.
    this.fog.color.setRGB(color.r * 0.34, color.g * 0.34, color.b * 0.38, SRGBColorSpace);
    (this.scene.background as Color).setRGB(
      0.004 + color.r * 0.11,
      0.004 + color.g * 0.11,
      0.008 + color.b * 0.13,
      SRGBColorSpace,
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
    // Drawing into a dead context throws on some drivers and silently corrupts
    // state on others; the loop keeps running so we come back when it returns.
    if (this.contextLost) return;
    this.post.render(this.scene, this.camera.instance);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.webgl.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.webgl.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.post.dispose();
    this.webgl.dispose();
    if (this.webgl.domElement.parentElement === this.container) {
      this.container.removeChild(this.webgl.domElement);
    }
  }

  private applySize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, RENDER_CONFIG.maxPixelRatio);
    this.webgl.setPixelRatio(pixelRatio);
    this.webgl.setSize(width, height);
    this.camera.setAspect(width / height);
    // The pass's targets are sized in device pixels from the same numbers, or
    // the world arrives on screen at the wrong resolution and reads as soft.
    this.post.setSize(width, height, pixelRatio);
  }
}
