import {
  BoxGeometry,
  BufferAttribute,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { Vec3Data } from '../player/FrequencyState';
import { blocksInPatch, CITY, type CityBlock } from '../world/cityBlocks';
import type { LandField } from '../world/LandField';

/**
 * §134: the city as mass. One instanced box per sample of built-up land,
 * hanging DOWN from the ground the orb collides with — so the roof you see is
 * the roof you hit, and the block below it is only the body of that height.
 *
 * Rebuilt when the player crosses a cell, never per frame (§22), exactly like
 * the forest.
 */
export const CITY_RENDER = {
  /** Distance the player must travel before the patch is rebuilt. */
  cellSize: 40,
  /** Shortest block still drawn as mass, in world units. */
  minDrawHeight: CITY.minHeight,
  /** Blocks are drawn slightly narrower than their cell, so streets read. */
  inset: 0.82,
} as const;

export class CityRenderer {
  readonly mesh: InstancedMesh;
  private readonly material: MeshBasicMaterial;
  private land: LandField | null = null;
  private blocks: CityBlock[] = [];
  private cellX = Number.NaN;
  private cellZ = Number.NaN;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly color = new Color();
  private tint = new Color(0.5, 0.58, 0.6);
  private groundAt: (x: number, z: number) => number = () => -6;

  constructor() {
    const geometry = new BoxGeometry(1, 1, 1);
    // Anchor at the ROOF: the top of the box is the surface the orb collides
    // with, and the building is what hangs beneath it.
    geometry.translate(0, -0.5, 0);
    geometry.setAttribute('color', new BufferAttribute(boxFaceShading(), 3));
    // Everything else in this world is additive glow. Mass cannot be: five
    // thousand overlapping additive boxes is a pink carpet, not a city. These
    // are the one thing that OCCLUDES — they write depth, so the grid behind
    // them disappears and the skyline gets a silhouette.
    this.material = new MeshBasicMaterial({
      transparent: true,
      opacity: 0.9,
      depthWrite: true,
      vertexColors: true,
    });
    this.mesh = new InstancedMesh(geometry, this.material, CITY.maxBlocks);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  setLand(land: LandField): void {
    this.land = land;
    this.cellX = Number.NaN; // force a rebuild on the next update
  }

  /** The same ground the collision uses, so roofs and terrain never disagree. */
  setGroundSampler(sampler: (x: number, z: number) => number): void {
    this.groundAt = sampler;
  }

  /** §33: the city takes the colour of its region, like everything else. */
  setTint(color: { r: number; g: number; b: number }): void {
    this.tint.setRGB(0.14 + color.r * 0.86, 0.14 + color.g * 0.86, 0.14 + color.b * 0.86);
  }

  update(position: Vec3Data): void {
    if (!this.land) return;
    const cx = Math.floor(position.x / CITY_RENDER.cellSize);
    const cz = Math.floor(position.z / CITY_RENDER.cellSize);
    if (cx === this.cellX && cz === this.cellZ) return;
    this.cellX = cx;
    this.cellZ = cz;
    this.blocks = blocksInPatch(this.land, position.x, position.z);
    // Only on a rebuild. Five thousand roofs sampled every frame would cost
    // more than everything else on screen put together, and a building does
    // not move — what it stands on breathes, by a unit or so, and that is not
    // worth a frame budget.
    this.draw();
  }

  private draw(): void {
    const count = Math.min(this.blocks.length, CITY.maxBlocks);
    for (let i = 0; i < count; i++) {
      const block = this.blocks[i]!;
      const roof = this.groundAt(block.x, block.z);
      this.position.set(block.x, roof, block.z);
      const side = block.footprint * CITY_RENDER.inset;
      this.scale.set(side, block.height, side);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      // Taller reads brighter: the skyline is legible from the air.
      const lift = Math.min(1, block.height / 8);
      // Brighter the taller they stand: the skyline is what reads from the
      // air, not the individual roof.
      this.color.copy(this.tint).multiplyScalar(0.3 + lift * 0.7);
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * Per-face shading baked into the cube, because nothing in this scene is lit:
 * a roof and a wall have to be told apart by the geometry itself or a block of
 * flats reads as a plateau. Instance colour multiplies this, so the region's
 * tint and the height still come through.
 *
 * BoxGeometry lays its faces out +x, −x, +y, −y, +z, −z, four vertices each.
 */
function boxFaceShading(): Float32Array {
  const faces = [0.62, 0.4, 1, 0.12, 0.55, 0.34];
  const colors = new Float32Array(24 * 3);
  faces.forEach((shade, face) => {
    for (let v = 0; v < 4; v++) {
      const o = (face * 4 + v) * 3;
      colors[o] = shade;
      colors[o + 1] = shade;
      colors[o + 2] = shade;
    }
  });
  return colors;
}
