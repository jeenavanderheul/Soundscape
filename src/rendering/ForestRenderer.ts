import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Points,
  ShaderMaterial,
} from 'three';
import type { TrackState } from '../music/TrackState';
import type { Vec3Data } from '../player/FrequencyState';
import {
  ecologyFor,
  FOREST_GRID,
  growthsInCell,
  type Ecology,
  type FormName,
  type Growth,
} from './ForestEcology';
import type { TrackGenre } from '../music/TrackState';

/**
 * §137: THE FOREST IS A MEASUREMENT OF A REAL TREE.
 *
 * The shapes come from Kenney's Nature Kit (CC0), sampled offline into clouds
 * of surface points by `npm run trees:bake` — real proportions, real
 * silhouettes, which is the one thing hand-built primitives could not give.
 * Nothing about the model survives into the runtime: no glTF, no texture, no
 * material, only positions.
 *
 * They are drawn as points, never as surfaces (§136.4, user decision): a tree
 * reads because its points crowd at the silhouette, the way the reference does
 * it, and depth comes from occlusion and density instead of shading. Distance
 * costs points before it costs brightness (§136.13).
 *
 * HARD USER RULE: every tree stands on the ground. The baked clouds have their
 * base at y = 0 and the renderer places them at exactly the terrain height, so
 * floating is not something that can be tuned wrong — it has nowhere to come
 * from. `tests/unit/forestGrounded.test.ts` reads the uploaded attributes back.
 */

export const FOREST_RENDER = {
  /**
   * §137: a tree is now ~1200 points, not eight triangles, so the old ceiling
   * of 1400 would put nearly two million vertices on screen. This is the
   * number the frame budget allows; the disc of cells around the player is
   * filled nearest-first.
   */
  maxInstances: 460,
  /** Dim, half-size: what this place COULD give you. */
  potentialScale: 0.45,
  potentialBrightness: 0.55,
  swayAmplitude: 0.06,
  /**
   * Point size in pixels-times-units: the size on screen is this divided by
   * the distance, so a point is a fixed size in the WORLD and shrinks like
   * everything else. Roughly 4 cm at this scale — fine speckle, never a blob.
   */
  pointSize: 42,
} as const;

/** Which baked species draws which shape language (§55). */
const FORM_SPECIES: Record<FormName, string> = {
  pillar: 'tall',
  blade: 'thin',
  shard: 'pine-tall',
  spire: 'pine-round',
  arch: 'plateau',
  membrane: 'fat',
  ring: 'pine-small',
  monolith: 'detailed',
  frond: 'detailed',
};

const FORM_NAMES: readonly FormName[] = [
  'pillar', 'shard', 'spire', 'arch', 'membrane', 'ring', 'monolith', 'blade', 'frond',
];

export interface TreeSpecies {
  id: string;
  /** Surface points, base at y = 0 and tip at y = 1. */
  points: Float32Array;
}

/** Reads what `npm run trees:bake` wrote. Null is a valid world: no trees. */
export async function loadTreeSpecies(base = '/trees'): Promise<Map<string, TreeSpecies> | null> {
  try {
    const manifest = (await (await fetch(`${base}/trees.json`)).json()) as {
      species: { id: string; points: number }[];
    };
    const loaded = new Map<string, TreeSpecies>();
    await Promise.all(
      manifest.species.map(async (entry) => {
        const buffer = await (await fetch(`${base}/${entry.id}.bin`)).arrayBuffer();
        if (buffer.byteLength !== entry.points * 12) return;
        loaded.set(entry.id, { id: entry.id, points: new Float32Array(buffer) });
      }),
    );
    return loaded.size > 0 ? loaded : null;
  } catch {
    return null;
  }
}

const VERTEX = /* glsl */ `
attribute vec3 iPosition;   // where this tree stands, world space
attribute float iScale;     // its height in world units
attribute float iPhase;     // its own randomness: spin, sway, which points survive
attribute vec3 iTint;
uniform float uTime;
uniform float uPulse;
uniform float uSize;
varying vec3 vTint;
varying float vFade;
varying float vSurvives;

void main() {
  // Every tree faces its own way. Without it, one silhouette repeated reads as
  // wallpaper however good the silhouette is.
  float a = iPhase * 6.2831;
  float c = cos(a);
  float s = sin(a);
  vec3 local = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c);
  // Sway grows with height up the tree: the base does not move, the crown does.
  float sway = sin(uTime * (0.4 + iPhase * 0.6) + iPhase * 6.2831) * ${FOREST_RENDER.swayAmplitude.toFixed(3)} * position.y;
  vec3 world = iPosition + local * iScale * (1.0 + uPulse * 0.04) + vec3(sway * iScale, 0.0, 0.0);

  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  float distance = -mv.z;
  // §136.13: distance costs INFORMATION first. Each point has its own place in
  // the queue, and the far a tree is, the fewer of them are still being sent.
  float keep = fract(sin(dot(position.xz, vec2(12.9898, 78.233)) + iPhase * 31.7) * 43758.5453);
  vSurvives = step(keep, clamp(1.25 - distance / 190.0, 0.0, 1.0));
  // NOT scaled by the tree: a point is a measurement, always the same size in
  // the world, or a big tree turns into cotton wool.
  gl_PointSize = clamp(uSize / max(1.0, distance), 1.0, 3.5);
  vFade = clamp(1.0 - distance / 240.0, 0.0, 1.0);
  vTint = iTint;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vTint;
varying float vFade;
varying float vSurvives;
void main() {
  if (vSurvives < 0.5) discard;
  // A round point with a hot centre: a measurement, not a sprite.
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  float core = 1.0 - r * 3.2;
  // Dim: the forest is made of density, not of brightness. Additive blending
  // does the rest where points crowd — which is exactly the silhouette.
  gl_FragColor = vec4(vTint * vFade * core * 0.4, 1.0);
}
`;

interface Cloud {
  points: Points;
  geometry: InstancedBufferGeometry;
  offsets: InstancedBufferAttribute;
  scales: InstancedBufferAttribute;
  phases: InstancedBufferAttribute;
  tints: InstancedBufferAttribute;
}

export class ForestRenderer {
  /** All the shape languages; the Game adds this to the scene. */
  readonly group = new Group();
  private readonly clouds = new Map<FormName, Cloud>();
  private readonly material: ShaderMaterial;
  private readonly seedNumber: number;
  private growths: Growth[] = [];
  private readonly color = new Color();
  private cellX = Number.NaN;
  private cellZ = Number.NaN;
  private ecology: Ecology = ecologyFor(null);
  private tint = new Color(0.5, 0.58, 0.6);
  private pulse = 0;
  private depth = 0;
  private groundAt: (x: number, z: number) => number = () => -6;

  constructor(seed: string) {
    this.seedNumber = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uSize: { value: FOREST_RENDER.pointSize },
      },
    });
  }

  /**
   * Hands the baked species over. Until this happens the forest is empty —
   * which is a legitimate world, not an error state.
   */
  setSpecies(species: Map<string, TreeSpecies>): void {
    for (const form of FORM_NAMES) {
      const source = species.get(FORM_SPECIES[form]);
      if (!source) continue;
      const geometry = new InstancedBufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(source.points, 3));
      const capacity = FOREST_RENDER.maxInstances;
      const offsets = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      const scales = new InstancedBufferAttribute(new Float32Array(capacity), 1);
      const phases = new InstancedBufferAttribute(new Float32Array(capacity), 1);
      const tints = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      for (const attribute of [offsets, scales, phases, tints]) attribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute('iPosition', offsets);
      geometry.setAttribute('iScale', scales);
      geometry.setAttribute('iPhase', phases);
      geometry.setAttribute('iTint', tints);
      geometry.instanceCount = 0;
      const points = new Points(geometry, this.material);
      points.frustumCulled = false;
      this.clouds.set(form, { points, geometry, offsets, scales, phases, tints });
      this.group.add(points);
    }
    this.cellX = Number.NaN; // whatever was placed, place it again with real trees
  }

  /** §55 user decision: the deeper into a world you are, the bigger it grows. */
  setDepth(value: number): void {
    this.depth = Math.min(1, Math.max(0, value));
  }

  setGroundSampler(sampler: (x: number, z: number) => number): void {
    this.groundAt = sampler;
  }

  /** §33: the forest takes the colour of its region. */
  setTint(color: { r: number; g: number; b: number }): void {
    // Saturated: the forest is the second thing that names a world (§55).
    this.tint.setRGB(0.12 + color.r * 0.88, 0.12 + color.g * 0.88, 0.12 + color.b * 0.88);
  }

  setPulse(value: number): void {
    this.pulse = value;
  }

  /** The formations big enough to stop the orb (§36: only the largest). */
  solidObstacles(): readonly Growth[] {
    return this.growths.filter((g) => g.solid);
  }

  /**
   * Rebuilds only when the player crosses into a new cell, or when the region
   * or the earned track changes — never per frame.
   */
  update(
    position: Vec3Data,
    genre: TrackGenre,
    track: Readonly<TrackState> | undefined,
    elapsedSeconds: number,
  ): void {
    const cx = Math.floor(position.x / FOREST_GRID.cellSize);
    const cz = Math.floor(position.z / FOREST_GRID.cellSize);
    const ecology = ecologyFor(genre);
    if (cx !== this.cellX || cz !== this.cellZ || ecology !== this.ecology) {
      this.cellX = cx;
      this.cellZ = cz;
      this.ecology = ecology;
      this.rebuild(track);
    } else if (track) {
      // Cheap: earning a layer only flips flags, it does not move the forest.
      for (const growth of this.growths) {
        growth.earned = growth.earned || isEarnedNow(growth, track);
      }
    }
    this.material.uniforms['uTime']!.value = elapsedSeconds;
    this.material.uniforms['uPulse']!.value = this.pulse;
    this.draw();
  }

  private rebuild(track: Readonly<TrackState> | undefined): void {
    const r = FOREST_GRID.radiusInCells;
    const next: Growth[] = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue; // a disc, not a square
        for (const growth of growthsInCell(
          this.seedNumber,
          this.cellX + dx,
          this.cellZ + dz,
          this.ecology,
          track,
        )) {
          if (next.length >= FOREST_RENDER.maxInstances) break;
          next.push(growth);
        }
      }
    }
    this.growths = next;
  }

  private draw(): void {
    if (this.clouds.size === 0) return;
    const used = new Map<FormName, number>();
    const depthScale = 0.75 + this.depth * 0.7;
    for (const growth of this.growths) {
      const form = growth.phase < this.ecology.formBias
        ? this.ecology.forms[0]
        : this.ecology.forms[1];
      const cloud = this.clouds.get(form);
      if (!cloud) continue;
      const slot = used.get(form) ?? 0;
      if (slot >= FOREST_RENDER.maxInstances) continue;
      used.set(form, slot + 1);

      const grown = growth.earned ? 1 : FOREST_RENDER.potentialScale;
      // HARD USER RULE: on the ground, always. The baked cloud has its base at
      // y = 0, so this is the whole guarantee.
      cloud.offsets.setXYZ(slot, growth.x, this.groundAt(growth.x, growth.z), growth.z);
      cloud.scales.setX(slot, growth.height * grown * depthScale);
      cloud.phases.setX(slot, growth.phase);
      const brightness = growth.earned ? 1 : FOREST_RENDER.potentialBrightness;
      this.color.copy(this.tint).multiplyScalar(brightness);
      cloud.tints.setXYZ(slot, this.color.r, this.color.g, this.color.b);
    }
    for (const [form, cloud] of this.clouds) {
      cloud.geometry.instanceCount = used.get(form) ?? 0;
      cloud.offsets.needsUpdate = true;
      cloud.scales.needsUpdate = true;
      cloud.phases.needsUpdate = true;
      cloud.tints.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const cloud of this.clouds.values()) cloud.geometry.dispose();
    this.material.dispose();
  }
}

function isEarnedNow(growth: Growth, track: Readonly<TrackState>): boolean {
  switch (growth.role) {
    case 'trunk':
      return track.drums.kick.unlocked;
    case 'thin':
      return track.drums.hats.unlocked;
    case 'giant':
      return track.drums.snare.unlocked;
    case 'root':
      return track.bass.unlocked;
    case 'canopy':
      return track.harmony.unlocked;
    case 'branch':
      return track.melody.unlocked;
    case 'spore':
      return track.texture.unlocked;
  }
}
