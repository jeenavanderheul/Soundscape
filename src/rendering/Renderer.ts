import { Color, Scene, WebGLRenderer } from 'three';
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
    this.camera = new Camera(window.innerWidth / window.innerHeight);
    this.webgl = new WebGLRenderer({ antialias: true });
    this.webgl.setClearColor(RENDER_CONFIG.clearColor);
    this.applySize();
    container.appendChild(this.webgl.domElement);
    window.addEventListener('resize', this.onResize);
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
