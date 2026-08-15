import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  LinearFilter,
  Mesh,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type WebGLRenderer,
} from 'three';
import { BEAT_SYNC_CONFIG } from './BeatSync';

/**
 * §156: the world's post-processing pass (§136.8 persistence, §136.17 image
 * processing). Hand-rolled rather than three's EffectComposer, so the buffers
 * and the cost are ours: three render targets, one fullscreen triangle, one
 * shader program.
 *
 * Per frame: the scene goes into a target, one draw folds it into a ping-ponged
 * memory buffer, one draw grades scene + memory onto the screen. Two fullscreen
 * draws is the price of keeping the memory free of grain and misregistration —
 * feeding a graded image back into itself turns the world to mush within a
 * second, which is exactly what §136.18 calls a glitch overlay.
 *
 * With every input at 0 the shader is an identity and 90% of the frame comes
 * out byte-identical to the unprocessed render. The rest is antialiased edges,
 * which are now resolved in LINEAR light rather than in sRGB and so read a few
 * levels brighter — gamma-correct, and the better of the two on hairlines, but
 * it is a real difference and not a rounding error. Getting the old resolve
 * back would mean either an 8-bit linear buffer (which bands catastrophically
 * in a world that is 85–95% black) or a float one (which §22 cannot afford).
 *
 * `enabled = false` takes the whole thing out of the path.
 */

/** Longest sideways kick of a torn band, in CSS pixels (§23: bounded, never a jolt). */
const MAX_SLICE_PIXELS = 6;
/** Widest channel misregistration, in CSS pixels (§136.17: "very subtle normally"). */
const MAX_DISPLACE_PIXELS = 3.5;
/** How hard full clipping drives the signal into the ceiling. */
const CLIP_GAIN = 0.85;
/** How much full clipping crushes the low end, so fine information disappears. */
const CLIP_FLOOR = 0.05;
/** Amplitude of the world's grain at full. */
const GRAIN_AMOUNT = 0.09;
/** A slice is an event, not a state: it is gone this fast. */
export const SLICE_MS = 140;
/**
 * §22: the memory buffer runs at half the canvas's linear resolution. At the
 * capped pixel ratio of 2 a 2560×1440 window is a 14.7 Mpx target, and touching
 * that three times a frame is ~44 Mpx of bandwidth — 4–8 ms on integrated
 * graphics, half the frame budget for a decaying ghost. A ghost is soft by
 * definition, so it is the one buffer that can lose resolution for free; the
 * scene target and the screen stay sharp (§136.17 "very high sharpness").
 */
const HISTORY_SCALE = 0.5;
/**
 * §22: the post chain never follows the display's pixel ratio. `maxPixelRatio`
 * is 2, and on a 2560×1440 retina window that is a 14.7 Mpx surface the chain
 * touches three times a frame — measured at ~9 ms on an M3 Max, and an M3 Max
 * is not the machine to worry about. Pinning the world's own buffers to CSS
 * pixels makes the cost a function of the WINDOW and nothing else. The canvas
 * keeps its full ratio, so the composite still writes real device pixels.
 */
const POST_PIXEL_RATIO = 1;
/**
 * Antialiasing costs more offscreen than it does on the canvas: the driver
 * resolves the swapchain surface as part of presenting it, while a render
 * target needs an explicit full-surface resolve. Measured at 1440p on an M3
 * Max: 0 samples 1.0 ms, 2 samples 2.2 ms, 4 samples 2.9 ms. Two is the deal —
 * this world is hairlines on black (§136.4) and unresolved they crawl, but
 * four is a millisecond spent on the difference between good and slightly
 * better. One constant to change if the budget bites on real hardware.
 */
const SCENE_SAMPLES = 2;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * §23 SAFETY, not taste. Ghost frames, frame slicing, clipping and channel
 * displacement are all photosensitivity-relevant, and nothing else in the
 * render path reads `prefers-reduced-motion` — so the gate lives here.
 *
 * Luminance modulation is held under the same cap the beat pulse already
 * respects, so no two systems can add up to a strobe.
 */
export interface SignalAmounts {
  persistence: number;
  clip: number;
  slice: number;
  displace: number;
}

export function safeAmounts(raw: SignalAmounts, reducedMotion: boolean): SignalAmounts {
  const persistence = clamp01(raw.persistence);
  const clip = clamp01(raw.clip);
  const displace = clamp01(raw.displace);
  const slice = clamp01(raw.slice);
  if (!reducedMotion) return { persistence, clip, slice, displace };
  const cap = BEAT_SYNC_CONFIG.maxModulationDepth;
  return {
    // A held after-image is a slow brightness change, so it lives under the cap.
    persistence: Math.min(persistence, cap),
    // Clipping multiplies luminance by `1 + clip * CLIP_GAIN`; that lift is
    // what has to stay under the cap, not the input.
    clip: Math.min(clip, cap / CLIP_GAIN),
    // A tear is a hard, fast luminance edge with no soft version. It goes.
    slice: 0,
    displace,
  };
}

/**
 * Per-frame decay that leaves a visible tail `frames` long — "visible" being
 * 5% of the original, roughly where a line stops reading against near-black.
 */
export function echoDecay(frames: number): number {
  if (frames <= 0) return 0;
  return Math.pow(0.05, 1 / frames);
}

/** The slice fades out over `SLICE_MS`; 0 before it is fired and after it ends. */
export function sliceEnvelope(ageMs: number, strength: number): number {
  if (ageMs < 0 || ageMs >= SLICE_MS) return 0;
  return clamp01(strength) * (1 - ageMs / SLICE_MS);
}

export interface SignalUniforms {
  uScene: { value: unknown };
  uHistory: { value: unknown };
  uResolution: { value: { x: number; y: number } };
  uTime: { value: number };
  uAccumulate: { value: number };
  uDecay: { value: number };
  uPersistence: { value: number };
  uDisplace: { value: number };
  uGrain: { value: number };
  uClip: { value: number };
  uSlice: { value: number };
}

/** Every effect gated to 0 — the rest state is a plain copy of the scene. */
export function createSignalUniforms(): SignalUniforms {
  return {
    uScene: { value: null },
    uHistory: { value: null },
    uResolution: { value: { x: 1, y: 1 } },
    uTime: { value: 0 },
    uAccumulate: { value: 0 },
    uDecay: { value: 0 },
    uPersistence: { value: 0 },
    uDisplace: { value: 0 },
    uGrain: { value: 0 },
    uClip: { value: 0 },
    uSlice: { value: 0 },
  };
}

export const SIGNAL_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  // One triangle overhanging the viewport rather than two: no seam down the
  // diagonal, and one less vertex to transform. The camera is never consulted.
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const SIGNAL_FRAGMENT = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uHistory;
uniform vec2 uResolution;
uniform float uTime;
uniform float uAccumulate;
uniform float uDecay;
uniform float uPersistence;
uniform float uDisplace;
uniform float uGrain;
uniform float uClip;
uniform float uSlice;
varying vec2 vUv;

// §136.1/§136.18: the three accents the world already owns. No fourth colour
// may enter the image here, and a raw RGB split is forbidden.
const vec3 ACCENT_RED = vec3(1.0, 0.16, 0.18);
const vec3 ACCENT_GREEN = vec3(0.22, 1.0, 0.42);
const vec3 ACCENT_VIOLET = vec3(0.62, 0.24, 1.0);

float hash21(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p + 19.19);
  return fract((p.x + p.y) * p.x);
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

/** Horizontal bands kicked sideways a few pixels — a tear, not a wobble. */
vec2 sliceUv(vec2 uv) {
  if (uSlice <= 0.0) return uv;
  float band = floor(uv.y * 26.0);
  float pick = hash21(vec2(band, floor(uTime * 30.0)));
  // Only the top slice of the bands move at once, or the whole frame shears
  // and it reads as a broken projector instead of a dropped packet.
  float moved = step(0.72, pick);
  float direction = pick < 0.86 ? 1.0 : -1.0;
  return vec2(uv.x + (${MAX_SLICE_PIXELS}.0 * uSlice * moved * direction) / uResolution.x, uv.y);
}

void main() {
  vec2 uv = sliceUv(vUv);
  vec3 scene = texture2D(uScene, uv).rgb;

  if (uAccumulate > 0.5) {
    // The memory buffer (§136.8). Fade, then take whichever is brighter:
    // phosphor never darkens a spot that is still glowing, it only decays, so
    // a moving line leaves a tail and a still one simply stays lit.
    gl_FragColor = vec4(max(scene, texture2D(uHistory, uv).rgb * uDecay), 1.0);
    return;
  }

  vec3 col = max(scene, texture2D(uHistory, uv).rgb * uPersistence);

  if (uDisplace > 0.0) {
    // §136.17 chromatic displacement: ONE axis, deliberate misregistration,
    // and the fringes are tinted in the three accents rather than in R/G/B.
    float offset = (uDisplace * ${MAX_DISPLACE_PIXELS}) / uResolution.x;
    float lumaHere = luma(col);
    float lumaLeft = luma(texture2D(uScene, uv - vec2(offset, 0.0)).rgb);
    float lumaRight = luma(texture2D(uScene, uv + vec2(offset, 0.0)).rgb);
    float lumaInner = luma(texture2D(uScene, uv + vec2(offset * 0.45, 0.0)).rgb);
    col += ACCENT_RED * max(0.0, lumaLeft - lumaHere) * 0.9;
    col += ACCENT_GREEN * max(0.0, lumaRight - lumaHere) * 0.9;
    col += ACCENT_VIOLET * max(0.0, lumaInner - lumaHere) * 0.5;
  }

  // §136.17/§136.15 clipping, not bloom: drive the signal into the ceiling so
  // the brightest lines merge and what sits just under them is lost. No blur —
  // a blur would be the excessive bloom §136.18 rules out.
  col = clamp(col * (1.0 + uClip * ${CLIP_GAIN}) - uClip * ${CLIP_FLOOR}, 0.0, 1.0);

  if (uGrain > 0.0) {
    float n = hash21(gl_FragCoord.xy + floor(uTime * 24.0) * 71.0);
    // Stepped in level and in time, because analog noise does not interpolate.
    n = (floor((n - 0.5) * 5.0) + 0.5) / 5.0;
    // The interface lays a CSS grain field over EVERYTHING (§143), and that one
    // is screen-blended so it LIFTS THE FLAT BLACKS. This one is additive and
    // weighted by local luminance, so it only touches pixels that already carry
    // signal. The two therefore never spend their amplitude on the same pixel,
    // which is what would turn the world to mush.
    col += n * uGrain * ${GRAIN_AMOUNT} * (0.15 + luma(col));
  }

  // Three converts to the display's colour space only when it renders to the
  // CANVAS; a render target always receives the linear working space. This
  // shader writes to both, so the encode is ours, once, on the way out — and
  // that is also why every effect above is doing its arithmetic in linear
  // light, which is where a decaying phosphor and a clipped highlight belong.
  vec3 low = col * 12.92;
  vec3 high = 1.055 * pow(col, vec3(0.41666667)) - 0.055;
  gl_FragColor = vec4(mix(low, high, step(vec3(0.0031308), col)), 1.0);
}
`;

export class SignalPass {
  /** One flag takes the pass out of the path entirely; the game still renders. */
  enabled = true;

  private readonly renderer: WebGLRenderer;
  private readonly material: ShaderMaterial;
  private readonly uniforms: SignalUniforms;
  private readonly quadScene = new Scene();
  private readonly quadCamera = new Camera();
  private readonly triangle: Mesh;
  private readonly sceneTarget: WebGLRenderTarget;
  private historyRead: WebGLRenderTarget;
  private historyWrite: WebGLRenderTarget;

  private persistence = 0;
  private clip = 0;
  private displace = 0;
  private decay = 0;
  private sliceFiredAt = -Infinity;
  private sliceStrength = 0;
  private reducedMotion = typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
    this.uniforms = createSignalUniforms();
    this.material = new ShaderMaterial({
      uniforms: this.uniforms as unknown as Record<string, { value: unknown }>,
      vertexShader: SIGNAL_VERTEX,
      fragmentShader: SIGNAL_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    this.triangle = new Mesh(geometry, this.material);
    this.triangle.frustumCulled = false;
    this.quadScene.add(this.triangle);

    this.sceneTarget = this.createTarget(true);
    this.historyRead = this.createTarget(false);
    this.historyWrite = this.createTarget(false);

    // Dev-only handle, the same way Game exposes its state: the treatment has
    // to be tuned and measured by eye against a moving world, and there is no
    // other way to reach it from a browser. Dropped from production builds.
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>)['__SIGNAL_PASS__'] = this;
    }
  }

  /** §136.8 — how loudly the world remembers what moved. 0 is no memory at all. */
  setPersistence(amount01: number): void {
    this.persistence = clamp01(amount01);
  }

  /** §23 — the game may force the gate on; the media query only sets its default. */
  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
  }

  /** How many frames of visible lag the memory buffer holds (0 = none). */
  setEcho(frames: number): void {
    this.decay = echoDecay(frames);
  }

  /** §136.17 — channel misregistration, driven by `instability` (§136.11). */
  setDisplacement(instability01: number): void {
    this.displace = clamp01(instability01);
  }

  setGrain(amount01: number): void {
    this.uniforms.uGrain.value = clamp01(amount01);
  }

  /** §136.17 controlled highlight clipping — a gain into the ceiling, never a blur. */
  setClipping(amount01: number): void {
    this.clip = clamp01(amount01);
  }

  /** Fire one frame-slice. An event with an envelope, so it can never sit on. */
  triggerSlice(strength01: number): void {
    this.sliceStrength = clamp01(strength01);
    this.sliceFiredAt = performance.now();
  }

  /**
   * Targets are sized in device pixels, from the same numbers `applySize` gives
   * the canvas — a mismatch shows up as a soft, half-resolution world.
   */
  setSize(width: number, height: number, pixelRatio: number): void {
    const scale = Math.min(pixelRatio, POST_PIXEL_RATIO);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const hw = Math.max(1, Math.round(w * HISTORY_SCALE));
    const hh = Math.max(1, Math.round(h * HISTORY_SCALE));
    this.sceneTarget.setSize(w, h);
    this.historyRead.setSize(hw, hh);
    this.historyWrite.setSize(hw, hh);
    // Offsets are computed in UV against the SCREEN, so a slice of six pixels
    // is six pixels wherever the buffers happen to be rasterising.
    this.uniforms.uResolution.value = {
      x: Math.max(1, Math.round(width * pixelRatio)),
      y: Math.max(1, Math.round(height * pixelRatio)),
    };
    // A resized memory buffer holds a stretched copy of the old frame, which
    // would bleed across the whole world for as long as the decay lasts.
    this.clearHistory();
  }

  render(scene: Scene, camera: PerspectiveCamera): void {
    if (!this.enabled) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }

    const now = performance.now();
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.render(scene, camera);

    const amounts = safeAmounts(
      {
        persistence: this.persistence,
        clip: this.clip,
        displace: this.displace,
        slice: sliceEnvelope(now - this.sliceFiredAt, this.sliceStrength),
      },
      this.reducedMotion,
    );
    this.uniforms.uTime.value = now / 1000;
    this.uniforms.uSlice.value = amounts.slice;
    this.uniforms.uClip.value = amounts.clip;
    this.uniforms.uDisplace.value = amounts.displace;
    this.uniforms.uScene.value = this.sceneTarget.texture;

    // Draw 1 — fold this frame into the memory.
    this.uniforms.uAccumulate.value = 1;
    this.uniforms.uDecay.value = this.decay;
    this.uniforms.uHistory.value = this.historyRead.texture;
    this.renderer.setRenderTarget(this.historyWrite);
    this.renderer.render(this.quadScene, this.quadCamera);

    // Draw 2 — the screen, graded against the memory written a line ago.
    this.uniforms.uAccumulate.value = 0;
    this.uniforms.uPersistence.value = amounts.persistence * 0.94;
    this.uniforms.uHistory.value = this.historyWrite.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);

    const swap = this.historyRead;
    this.historyRead = this.historyWrite;
    this.historyWrite = swap;
  }

  dispose(): void {
    this.sceneTarget.dispose();
    this.historyRead.dispose();
    this.historyWrite.dispose();
    this.triangle.geometry.dispose();
    this.material.dispose();
  }

  private createTarget(isScene: boolean): WebGLRenderTarget {
    const target = new WebGLRenderTarget(1, 1, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: isScene,
      stencilBuffer: false,
      // The canvas asks for antialiasing and only the default framebuffer gets
      // it. Diverting the scene into a plain target throws it away, and this
      // world is made of ultra-fine white lines against black (§136.4) — the
      // one subject where the loss is not subtle. The memory buffer is soft by
      // definition and needs none.
      samples: isScene ? SCENE_SAMPLES : 0,
    });
    // An sRGB attachment, so the hardware encodes on write and decodes on read.
    // Eight bits of LINEAR would be a disaster in a world that is 85–95% black
    // (§136.14): everything from the fog to the far terrain lands on values
    // 0–3 and bands. This buys the precision without the bandwidth of a float
    // target, which is what §22 could not afford.
    target.texture.colorSpace = SRGBColorSpace;
    return target;
  }

  private clearHistory(): void {
    const previous = this.renderer.getRenderTarget();
    for (const target of [this.historyRead, this.historyWrite]) {
      this.renderer.setRenderTarget(target);
      this.renderer.clear();
    }
    this.renderer.setRenderTarget(previous);
  }
}
