import {
  AdditiveBlending,
  BufferAttribute,
  DataTexture,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  NearestFilter,
  Points,
  RGBAFormat,
  ShaderMaterial,
} from 'three';
import { DOME_SCANNER_GLSL, type ScannerState } from './domeScanner';

/**
 * §176 THE CROWD.
 *
 * Real mocap, rendered as signal. The motion is human because it was recorded
 * from a human; the body is a point cloud because that is what this world is
 * made of. Nothing here is a character — there is no mesh, no skeleton and no
 * bone matrix at runtime. `scripts/bake-mocap.mjs` did all of that once and
 * left a texture: points across, frames down. The vertex shader reads a texel
 * and that is the dancer.
 *
 * Which means the three things that usually make a crowd expensive are free:
 *   - every dancer is on a different beat, because phase is a row offset
 *   - hands and heads leave a trail, because a trail is rows -2, -4, -8
 *   - detail falls off with distance, because detail is a stride
 *
 * And the thing that makes it belong here: the crowd is not scenery that is
 * always on. It is what the track has earned. In silence the field is empty. At
 * five layers you are standing in the middle of it.
 */

export interface CrowdManifest {
  points: number;
  frames: number;
  clips: { name: string; file: string; points: number; frames: number; seconds: number }[];
}

/**
 * Fetches the baked clips. Returns null on anything at all going wrong — a
 * missing bake is a world without a crowd, which is exactly what the world was
 * yesterday, and never a world that fails to start.
 */
export async function loadCrowdPose(): Promise<{ manifest: CrowdManifest; buffers: ArrayBuffer[] } | null> {
  try {
    const response = await fetch('mocap/manifest.json');
    if (!response.ok) return null;
    const manifest = (await response.json()) as CrowdManifest;
    if (!manifest?.clips?.length || !manifest.points || !manifest.frames) return null;
    const buffers = await Promise.all(
      manifest.clips.map(async (clip) => {
        const data = await fetch(`mocap/${clip.file}`);
        if (!data.ok) throw new Error(`crowd: ${clip.file} missing`);
        return data.arrayBuffer();
      }),
    );
    return { manifest, buffers };
  } catch {
    return null;
  }
}

export const CROWD_CONFIG = {
  /**
   * World units a person is tall. The bake normalises every clip to 1.0, so
   * this is the only place the crowd's scale is decided. Measured against the
   * orb, which is about eight units: a dancer stands a head and shoulders over
   * it, the way the reference frame has them.
   */
  height: 14,
  /** How far out dancers are placed, in world units. */
  radius: 260,
  /** Nobody stands closer than this to the orb — the crowd is around you, not on you. */
  clearance: 22,
  /** Instance capacity per detail tier. Placement never exceeds these. */
  near: 24,
  mid: 90,
  far: 340,
  nearDistance: 90,
  midDistance: 220,
  /** Trail samples on the near tier: current frame plus three older ones. */
  trail: 4,
  /** Points drawn per dancer, per tier. The bake writes 1024. */
  nearPoints: 1024,
  midPoints: 256,
  farPoints: 40,
  /** Clusters the crowd forms up into, rather than a uniform scatter. */
  clusters: 9,
  clusterRadius: 62,
  /** Loops per second at rest; the beat pulls this around. */
  rate: 0.24,
} as const;

interface Tier {
  points: Points;
  geometry: InstancedBufferGeometry;
  origins: Float32Array;
  variants: Float32Array;
  capacity: number;
  /** Indices into `placed` currently drawn by this tier. */
  members: number[];
}

interface Dancer {
  x: number;
  z: number;
  y: number;
  yaw: number;
  scale: number;
  phase: number;
  clip: number;
  seed: number;
}

const VERTEX = /* glsl */ `
uniform sampler2D uPose;
uniform vec2 uPoseSize;      // points across, rows down
uniform float uFrames;       // rows per clip
uniform float uTime;
uniform float uRate;
uniform float uHeight;
uniform float uIntensity;    // 0..1 how present the crowd is allowed to be
uniform float uCoherence;    // 0 everyone alone, 1 everyone as one
uniform float uKick;
uniform float uBass;
uniform float uHigh;
uniform float uReduced;

attribute float aPointId;
attribute float aTrail;      // 0 is now, higher is further into the past

attribute vec3 aOrigin;      // where this dancer stands, feet on the ground
attribute vec4 aVariant;     // yaw, scale, phase, clip row
attribute float aSeed;

varying float vFade;
varying float vRegion;
varying float vLit;
varying float vSeed;

${DOME_SCANNER_GLSL}

float hash(float n) {
  return fract(sin(n * 91.3458) * 47453.5453);
}

void main() {
  float yaw = aVariant.x;
  float scale = aVariant.y;
  float clipRow = aVariant.w;

  // Phase is what stops sixty dancers being one dancer copied sixty times.
  // Coherence pulls them together instead of playing identical frames: at 1.0
  // the crowd breathes as one body and still moves as many.
  float phase = mix(aVariant.z, 0.0, uCoherence);
  float speed = mix(0.94, 1.06, hash(aSeed * 3.1));
  speed = mix(speed, 1.0, uCoherence);

  // The past is just an earlier row. No history buffer exists anywhere.
  float back = aTrail * (2.0 + aTrail * 1.4);
  float frame = fract(uTime * uRate * speed + phase) * uFrames - back;
  frame = mod(frame + uFrames, uFrames);

  vec2 uv = vec2((aPointId + 0.5) / uPoseSize.x, (clipRow + floor(frame) + 0.5) / uPoseSize.y);
  vec4 pose = texture2D(uPose, uv);
  vRegion = pose.w;

  vec3 body = pose.xyz * uHeight * scale;

  // Bass moves the body outward from its own spine — the only place audio is
  // allowed to touch the motion itself, and gently. The mocap stays the mocap.
  body.xz *= 1.0 + uBass * 0.14 * (1.0 - uReduced);
  body.y *= 1.0 + uKick * 0.05 * (1.0 - uReduced);

  float s = sin(yaw);
  float c = cos(yaw);
  vec3 world = aOrigin + vec3(body.x * c - body.z * s, body.y, body.x * s + body.z * c);

  // §28: the dome does not spotlight a character, it reveals a signal. Out of
  // the beam a dancer is barely there; the sweep passes and a person resolves
  // out of the dark. The floor is what keeps the crowd from vanishing entirely.
  float beam = domeBeam(world.xz);
  vLit = clamp(0.16 + beam * 2.6, 0.0, 1.8);

  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  float distance = max(1.0, -mv.z);

  // Trailing samples are dimmer, and the further back the fainter — movement
  // remembered by the signal rather than motion blur.
  float trailFade = exp(-aTrail * 0.85);

  // §14: readable but unstable. Points come and go; hands and heads survive
  // longest because they are what a body is read from.
  float steadiness = vRegion < 1.5 ? 0.92 : (vRegion < 2.5 ? 0.74 : 0.66);
  float flicker = hash(aPointId + aSeed * 17.0 + floor(uTime * 11.0) * 0.017);
  float present = step(flicker, steadiness * (0.55 + uIntensity * 0.45) + uHigh * 0.2);

  vFade = trailFade * uIntensity * present;
  vSeed = aSeed;

  if (vFade <= 0.001) {
    // Off the back of the near plane: the cheapest way to not exist.
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  // Small on purpose. At five pixels the points of a near dancer overlap into
  // a blob and the body stops reading as a person; the silhouette lives in the
  // gaps between the points, not in the points.
  gl_PointSize = clamp((190.0 * scale) / distance, 1.0, 2.6);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vFade;
varying float vRegion;
varying float vLit;
varying float vSeed;

void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float core = exp(-r2 * 8.0);

  // §03: the crowd owns no colour. It is white signal, tinted by the region it
  // is standing in, exactly like everything else in this world.
  vec3 tint = mix(vec3(1.0), uColor, 0.55);
  float body = vFade * vLit * core;
  gl_FragColor = vec4(tint * body, 1.0);
}
`;

export class CrowdField {
  readonly tiers: Points[] = [];
  private readonly material: ShaderMaterial;
  private readonly built: Tier[] = [];
  private readonly placed: Dancer[] = [];
  private pose: DataTexture | null = null;
  private clipCount = 0;
  private noise = 991;
  private anchorX = Number.NaN;
  private anchorZ = Number.NaN;
  private groundCursor = 0;
  private groundAt: ((x: number, z: number) => number) | null = null;

  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uPose: { value: null },
        uPoseSize: { value: [1, 1] },
        uFrames: { value: 128 },
        uTime: { value: 0 },
        uRate: { value: CROWD_CONFIG.rate },
        uHeight: { value: CROWD_CONFIG.height },
        uIntensity: { value: 0 },
        uCoherence: { value: 0 },
        uKick: { value: 0 },
        uBass: { value: 0 },
        uHigh: { value: 0 },
        uReduced: { value: 0 },
        uColor: { value: [1, 1, 1] },
        uBeam: { value: 0 },
        uBeamCounter: { value: -1 },
        uBeamGhost: { value: -1 },
        uBeamWidth: { value: 0.22 },
        uBeamTail: { value: 0.9 },
        uBeamIntensity: { value: 0 },
        uBeamElevation: { value: 0.5 },
        uBeamDirection: { value: 1 },
        uBeamPlayer: { value: [0, 0] },
      },
    });

    const tiers: [number, number, number][] = [
      [CROWD_CONFIG.near, CROWD_CONFIG.nearPoints, CROWD_CONFIG.trail],
      [CROWD_CONFIG.mid, CROWD_CONFIG.midPoints, 2],
      [CROWD_CONFIG.far, CROWD_CONFIG.farPoints, 1],
    ];
    for (const [capacity, points, trail] of tiers) {
      this.built.push(this.makeTier(capacity, points, trail));
    }
    for (const tier of this.built) this.tiers.push(tier.points);
  }

  /**
   * One geometry per detail tier. The point count is a stride over the same
   * baked body — a far dancer is the same person sampled more coarsely, not a
   * different asset.
   */
  private makeTier(capacity: number, pointCount: number, trail: number): Tier {
    const geometry = new InstancedBufferGeometry();
    const vertices = pointCount * trail;
    const position = new Float32Array(vertices * 3);
    const ids = new Float32Array(vertices);
    const trails = new Float32Array(vertices);
    const stride = CROWD_CONFIG.nearPoints / pointCount;
    for (let t = 0; t < trail; t++) {
      for (let p = 0; p < pointCount; p++) {
        const v = t * pointCount + p;
        ids[v] = Math.floor(p * stride);
        trails[v] = t;
      }
    }
    geometry.setAttribute('position', new BufferAttribute(position, 3));
    geometry.setAttribute('aPointId', new BufferAttribute(ids, 1));
    geometry.setAttribute('aTrail', new BufferAttribute(trails, 1));

    const origins = new Float32Array(capacity * 3);
    const variants = new Float32Array(capacity * 4);
    const seeds = new Float32Array(capacity);
    geometry.setAttribute('aOrigin', new InstancedBufferAttribute(origins, 3));
    geometry.setAttribute('aVariant', new InstancedBufferAttribute(variants, 4));
    geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
    geometry.instanceCount = 0;

    const points = new Points(geometry, this.material);
    points.frustumCulled = false;
    points.visible = false;
    return { points, geometry, origins, variants, capacity, members: [] };
  }

  /** Loads the baked clips into one texture: points across, every clip's frames stacked down. */
  setPose(manifest: CrowdManifest, buffers: ArrayBuffer[]): void {
    if (buffers.length === 0 || buffers.length !== manifest.clips.length) {
      throw new Error('crowd: manifest and baked clips disagree');
    }
    const width = manifest.points;
    const height = manifest.frames * manifest.clips.length;
    // Half precision, as baked: two bytes a channel, so the whole crowd's
    // motion is five megabytes instead of ten.
    const expected = width * manifest.frames * 4 * 2;
    const data = new Uint16Array(width * height * 4);
    for (let c = 0; c < buffers.length; c++) {
      if (buffers[c]!.byteLength !== expected) {
        throw new Error(
          `crowd: clip ${manifest.clips[c]!.name} is ${buffers[c]!.byteLength} bytes, expected ${expected}`,
        );
      }
      data.set(new Uint16Array(buffers[c]!), c * manifest.frames * width * 4);
    }

    this.pose?.dispose();
    this.pose = new DataTexture(data, width, height, RGBAFormat, HalfFloatType);
    // §132's lesson again: a filtered pose texture blends the last frame of one
    // clip into the first of the next, and blends one body point into its
    // neighbour. Both are nonsense. Nearest, always.
    this.pose.minFilter = NearestFilter;
    this.pose.magFilter = NearestFilter;
    this.pose.needsUpdate = true;
    this.clipCount = manifest.clips.length;

    this.material.uniforms['uPose']!.value = this.pose;
    (this.material.uniforms['uPoseSize']!.value as number[])[0] = width;
    (this.material.uniforms['uPoseSize']!.value as number[])[1] = height;
    this.material.uniforms['uFrames']!.value = manifest.frames;
    this.anchorX = Number.NaN;
  }

  private random(): number {
    this.noise = (this.noise * 1664525 + 1013904223) >>> 0;
    return this.noise / 4294967296;
  }

  /**
   * How much crowd the track has earned. `layers` is the ladder (0-7) and
   * `intensity` is what is actually sounding right now, so a break empties the
   * field just as it empties the terrain.
   */
  setSignal(intensity: number, layers: number): void {
    const earned = Math.min(1, layers / 5);
    const present = Math.min(1, earned * (0.35 + intensity * 0.65));
    this.material.uniforms['uIntensity']!.value = present;
    // §25: nobody shares a beat until the track has something to share.
    this.material.uniforms['uCoherence']!.value = Math.max(0, (earned - 0.4) / 0.6) * intensity;
    const total = CROWD_CONFIG.near + CROWD_CONFIG.mid + CROWD_CONFIG.far;
    this.material.uniforms['uRate']!.value = CROWD_CONFIG.rate * (0.8 + intensity * 0.5);
    for (const tier of this.built) tier.points.visible = present > 0.02 && total > 0;
  }

  setDrums(kick: number, bass: number, high: number): void {
    this.material.uniforms['uKick']!.value = kick;
    this.material.uniforms['uBass']!.value = bass;
    this.material.uniforms['uHigh']!.value = high;
  }

  setColor(color: { r: number; g: number; b: number }): void {
    const value = this.material.uniforms['uColor']!.value as number[];
    value[0] = color.r;
    value[1] = color.g;
    value[2] = color.b;
  }

  setReducedMotion(reduced: boolean): void {
    this.material.uniforms['uReduced']!.value = reduced ? 1 : 0;
  }

  setScanner(scanner: ScannerState, player: { x: number; z: number }): void {
    const u = this.material.uniforms;
    u['uBeam']!.value = scanner.bearing;
    u['uBeamCounter']!.value = scanner.counterBearing ?? -1;
    u['uBeamGhost']!.value = scanner.ghostBearing ?? -1;
    u['uBeamWidth']!.value = scanner.width;
    u['uBeamTail']!.value = scanner.tail;
    u['uBeamIntensity']!.value = scanner.intensity;
    u['uBeamElevation']!.value = scanner.elevation;
    u['uBeamDirection']!.value = scanner.mode === 'reverse' ? -1 : 1;
    const centre = u['uBeamPlayer']!.value as number[];
    centre[0] = player.x;
    centre[1] = player.z;
  }

  /**
   * `groundAt` is the terrain's own height function — the same one the player
   * stands on. §153's rule for the forest applies here too and for the same
   * reason: a person floating a metre above the grid destroys the whole thing.
   */
  update(
    player: { x: number; y: number; z: number },
    groundAt: (x: number, z: number) => number,
    time: number,
    dtSeconds: number,
  ): void {
    this.material.uniforms['uTime']!.value = time;
    this.groundAt = groundAt;
    if (!this.pose) return;

    // Rebuild when the player has actually gone somewhere, not every frame —
    // same trigger the forest uses.
    if (
      !Number.isFinite(this.anchorX) ||
      Math.hypot(player.x - this.anchorX, player.z - this.anchorZ) > CROWD_CONFIG.radius * 0.35
    ) {
      this.place(player, groundAt);
      this.anchorX = player.x;
      this.anchorZ = player.z;
      return;
    }

    this.assign(player);
    this.reground(groundAt, dtSeconds);
  }

  /**
   * §19: clusters, not a grid. People stand in groups with gaps between them,
   * and the gaps are as much of the read as the groups.
   */
  private place(player: { x: number; z: number }, groundAt: (x: number, z: number) => number): void {
    this.placed.length = 0;
    this.noise = 991;
    const total = CROWD_CONFIG.near + CROWD_CONFIG.mid + CROWD_CONFIG.far;
    // Scattering clusters uniformly over the disc reads as "a crowd at the
    // horizon": with nine of them over 260 units, the odds of any landing
    // inside the near tier are about one. So the RANGE is laid out on purpose
    // — some close enough to see a face-worth of points, some at the edge —
    // and only the bearing is left to chance.
    const clusters: { x: number; z: number }[] = [];
    for (let c = 0; c < CROWD_CONFIG.clusters; c++) {
      const angle = this.random() * Math.PI * 2;
      const rung = c / (CROWD_CONFIG.clusters - 1);
      const reach =
        CROWD_CONFIG.clearance +
        Math.pow(rung, 1.4) * (CROWD_CONFIG.radius - CROWD_CONFIG.clearance) +
        (this.random() - 0.5) * 30;
      clusters.push({ x: player.x + Math.cos(angle) * reach, z: player.z + Math.sin(angle) * reach });
    }

    for (let i = 0; i < total; i++) {
      const cluster = clusters[Math.floor(this.random() * clusters.length)]!;
      const angle = this.random() * Math.PI * 2;
      const reach = Math.sqrt(this.random()) * CROWD_CONFIG.clusterRadius;
      const x = cluster.x + Math.cos(angle) * reach;
      const z = cluster.z + Math.sin(angle) * reach;
      if (Math.hypot(x - player.x, z - player.z) < CROWD_CONFIG.clearance) continue;
      this.placed.push({
        x,
        z,
        y: groundAt(x, z),
        yaw: this.random() * Math.PI * 2,
        scale: 0.88 + this.random() * 0.24,
        phase: this.random(),
        clip: Math.floor(this.random() * Math.max(1, this.clipCount)),
        seed: this.random() * 64,
      });
    }
    this.assign(player);
  }

  /** Nearest dancers get the detailed body; the rest get less of the same one. */
  private assign(player: { x: number; z: number }): void {
    for (const tier of this.built) tier.members.length = 0;
    const order = this.placed
      .map((dancer, index) => ({ index, d: Math.hypot(dancer.x - player.x, dancer.z - player.z) }))
      .sort((a, b) => a.d - b.d);

    const frames = this.material.uniforms['uFrames']!.value as number;
    for (const entry of order) {
      const tier =
        entry.d < CROWD_CONFIG.nearDistance
          ? this.built[0]!
          : entry.d < CROWD_CONFIG.midDistance
            ? this.built[1]!
            : this.built[2]!;
      if (tier.members.length >= tier.capacity) continue;
      const slot = tier.members.length;
      const dancer = this.placed[entry.index]!;
      tier.members.push(entry.index);
      tier.origins[slot * 3] = dancer.x;
      tier.origins[slot * 3 + 1] = dancer.y;
      tier.origins[slot * 3 + 2] = dancer.z;
      tier.variants[slot * 4] = dancer.yaw;
      tier.variants[slot * 4 + 1] = dancer.scale;
      tier.variants[slot * 4 + 2] = dancer.phase;
      tier.variants[slot * 4 + 3] = dancer.clip * frames;
      (tier.geometry.getAttribute('aSeed') as InstancedBufferAttribute).setX(slot, dancer.seed);
    }

    for (const tier of this.built) {
      tier.geometry.instanceCount = tier.members.length;
      tier.geometry.getAttribute('aOrigin').needsUpdate = true;
      tier.geometry.getAttribute('aVariant').needsUpdate = true;
      tier.geometry.getAttribute('aSeed').needsUpdate = true;
    }
  }

  /**
   * The ground is not static — it breathes with the music and the dome presses
   * on it — so standing on it is a per-frame problem. Doing all of them every
   * frame is hundreds of field evaluations for a change of a few centimetres,
   * so it sweeps: a slice each frame, everybody current within a fifth of a
   * second. Nobody is ever off the ground, only slightly behind it.
   */
  private reground(groundAt: (x: number, z: number) => number, dtSeconds: number): void {
    if (this.placed.length === 0) return;
    const slice = Math.max(1, Math.ceil(this.placed.length * Math.min(1, dtSeconds * 5)));
    for (let n = 0; n < slice; n++) {
      this.groundCursor = (this.groundCursor + 1) % this.placed.length;
      const dancer = this.placed[this.groundCursor]!;
      dancer.y = groundAt(dancer.x, dancer.z);
    }
    for (const tier of this.built) {
      for (let slot = 0; slot < tier.members.length; slot++) {
        tier.origins[slot * 3 + 1] = this.placed[tier.members[slot]!]!.y;
      }
      tier.geometry.getAttribute('aOrigin').needsUpdate = true;
    }
  }

  /** What the shader is actually being told — the thing that was missing before. */
  uniformSnapshot(): Record<string, number | boolean> {
    const u = this.material.uniforms;
    return {
      posed: this.pose !== null,
      clips: this.clipCount,
      intensity: u['uIntensity']!.value as number,
      coherence: u['uCoherence']!.value as number,
      beamIntensity: u['uBeamIntensity']!.value as number,
      kick: u['uKick']!.value as number,
      bass: u['uBass']!.value as number,
      visible: this.built.some((t) => t.points.visible),
    };
  }

  /**
   * Live counts, for the performance readout — measured, never assumed.
   *
   * `feetError` is the hard rule made checkable: the worst gap between where a
   * dancer's feet are and where the ground is. The trees had this rule stated
   * three times before it stuck; the crowd gets a number instead.
   */
  stats(): { dancers: number; drawn: number[]; points: number; feetError: number } {
    const drawn = this.built.map((t) => t.members.length);
    let feetError = 0;
    if (this.groundAt) {
      for (const dancer of this.placed) {
        feetError = Math.max(feetError, Math.abs(dancer.y - this.groundAt(dancer.x, dancer.z)));
      }
    }
    const points =
      drawn[0]! * CROWD_CONFIG.nearPoints * CROWD_CONFIG.trail +
      drawn[1]! * CROWD_CONFIG.midPoints * 2 +
      drawn[2]! * CROWD_CONFIG.farPoints;
    return { dancers: this.placed.length, drawn, points, feetError };
  }

  dispose(): void {
    for (const tier of this.built) tier.geometry.dispose();
    this.material.dispose();
    this.pose?.dispose();
  }
}
