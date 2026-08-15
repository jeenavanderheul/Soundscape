import { describe, expect, it } from 'vitest';
import {
  LOGO_CAMERA_LIFT,
  LOGO_CAP_ANGLE,
  LOGO_GLOW_SPREAD,
  LOGO_PAD,
  LOGO_PATHS,
  LOGO_VIEWBOX,
  ORB_LOGO_GLSL,
  createLogoTexture,
  logoFit,
  logoPoleFor,
  logoUv,
} from '../../src/rendering/orbLogo';
import type { Vec3 } from '../../src/rendering/orbLogo';
import { PlayerOrb } from '../../src/rendering/PlayerOrb';
import { createInitialFrequencyState } from '../../src/player/FrequencyState';

/** Flying dead ahead: the heading that made the naive frame flip (see below). */
const AHEAD: Vec3 = { x: 0, y: 0, z: -1 };
const POLE = logoPoleFor(AHEAD);
const UP: Vec3 = { x: 0, y: 1, z: 0 };
const uv = (v: Vec3) => logoUv(v, POLE, UP);

/** A point on the cap, `theta` off the pole, spun `phi` around it. */
function onCap(theta: number, phi: number, pole: Vec3 = POLE): Vec3 {
  const along = UP.y * pole.y;
  let ux = -pole.x * along;
  let uy = 1 - pole.y * along;
  let uz = -pole.z * along;
  const ul = Math.hypot(ux, uy, uz);
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const rx = uy * pole.z - uz * pole.y;
  const ry = uz * pole.x - ux * pole.z;
  const rz = ux * pole.y - uy * pole.x;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    x: pole.x * c + s * (rx * Math.cos(phi) + ux * Math.sin(phi)),
    y: pole.y * c + s * (ry * Math.cos(phi) + uy * Math.sin(phi)),
    z: pole.z * c + s * (rz * Math.cos(phi) + uz * Math.sin(phi)),
  };
}

describe('the mark is real artwork, not a stand-in', () => {
  it('carries every outline of the DEKMANTEL mark', () => {
    expect(LOGO_PATHS).toHaveLength(3);
    for (const d of LOGO_PATHS) {
      expect(d.length).toBeGreaterThan(1000);
      expect(d.startsWith('M')).toBe(true);
    }
  });

  it('needs no network: the artwork is source, not an asset', () => {
    expect(ORB_LOGO_GLSL).not.toMatch(/http|fetch|\.svg|\.png/);
  });
});

describe('fitting the mark on its canvas', () => {
  it('centres the viewBox and keeps its proportion', () => {
    const size = 1024;
    const { scale, tx, ty } = logoFit(size);
    const cx = (LOGO_VIEWBOX.x + LOGO_VIEWBOX.width / 2) * scale + tx;
    const cy = (LOGO_VIEWBOX.y + LOGO_VIEWBOX.height / 2) * scale + ty;
    expect(cx).toBeCloseTo(size / 2, 6);
    expect(cy).toBeCloseTo(size / 2, 6);
    // The mark is wider than tall, so width is what fills the frame, and the
    // margin left over is where the glow gets to bleed.
    const span = 1 - 2 * LOGO_PAD;
    expect(LOGO_VIEWBOX.width * scale).toBeCloseTo(size * span, 6);
    expect(LOGO_VIEWBOX.height * scale).toBeLessThan(size * span);
    expect(size * LOGO_PAD).toBeGreaterThan(LOGO_GLOW_SPREAD * scale * 0.9);
  });

  it('never spills outside the canvas', () => {
    const size = 512;
    const { scale, tx, ty } = logoFit(size);
    expect(LOGO_VIEWBOX.x * scale + tx).toBeGreaterThan(0);
    expect((LOGO_VIEWBOX.x + LOGO_VIEWBOX.width) * scale + tx).toBeLessThan(size);
    expect(LOGO_VIEWBOX.y * scale + ty).toBeGreaterThan(0);
    expect((LOGO_VIEWBOX.y + LOGO_VIEWBOX.height) * scale + ty).toBeLessThan(size);
  });
});

describe('aiming the cap at the player', () => {
  it('points back down the flight line, lifted like the chase camera is', () => {
    const p = logoPoleFor({ x: 0, y: 0, z: -1 });
    expect(p.z).toBeGreaterThan(0.9);
    expect(p.y).toBeCloseTo(LOGO_CAMERA_LIFT / Math.hypot(1, LOGO_CAMERA_LIFT), 6);
  });

  it('turns with the heading, so the mark rides the same skin all the way round', () => {
    for (const dir of [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0.6, y: 0, z: 0.8 },
    ]) {
      const p = logoPoleFor(dir);
      expect(p.x * dir.x + p.z * dir.z).toBeLessThan(0);
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(1, 6);
    }
  });

  it('still has a pole when the orb is standing still', () => {
    const p = logoPoleFor({ x: 0, y: 0, z: 0 });
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(1, 6);
  });
});

describe('printing the mark on one cap of the sphere', () => {
  it('puts the centre of the mark exactly on the pole', () => {
    const { u, v, cap } = uv(POLE);
    expect(u).toBeCloseTo(0.5, 6);
    expect(v).toBeCloseTo(0.5, 6);
    expect(cap).toBeCloseTo(0, 6);
  });

  it('leaves the frame beyond the cap, so there is no second copy and no seam', () => {
    expect(uv({ x: -POLE.x, y: -POLE.y, z: -POLE.z }).cap).toBeGreaterThan(1);
    for (let i = 0; i < 64; i += 1) {
      const theta = LOGO_CAP_ANGLE * 1.02 + (Math.PI - LOGO_CAP_ANGLE * 1.02) * (i / 63);
      expect(uv(onCap(theta, i * 1.7)).cap).toBeGreaterThan(1);
    }
  });

  it('spreads by angle, not by its sine, so the rim does not smear', () => {
    const quarter = uv(onCap(LOGO_CAP_ANGLE * 0.25, 0));
    const half = uv(onCap(LOGO_CAP_ANGLE * 0.5, 0));
    expect(quarter.cap).toBeCloseTo(0.25, 3);
    expect(half.cap).toBeCloseTo(0.5, 3);
    // Equal angular steps are equal steps in uv — an orthographic decal would
    // bunch the second step up against the rim instead.
    expect(half.cap - quarter.cap).toBeCloseTo(quarter.cap, 3);
  });

  it('is symmetric left to right about the pole', () => {
    const right = uv(onCap(0.4, 0));
    const left = uv(onCap(0.4, Math.PI));
    expect(right.u - 0.5).toBeCloseTo(0.5 - left.u, 6);
    expect(right.v).toBeCloseTo(left.v, 6);
    expect(right.u).toBeGreaterThan(0.5);
  });

  it('puts the world-up side of the cap on the upper half of the mark', () => {
    const above = uv(onCap(0.4, Math.PI / 2));
    expect(above.v).toBeGreaterThan(0.5);
    expect(above.u).toBeCloseTo(0.5, 6);
  });

  it('covers a cap the camera can read whole, not a sliver and not a hemisphere', () => {
    expect(LOGO_CAP_ANGLE).toBeGreaterThan(0.6);
    expect(LOGO_CAP_ANGLE).toBeLessThan(Math.PI / 2);
  });

  it('never comes out mirrored, whatever heading the orb is on', () => {
    // Aiming a sphere along a heading leaves the roll about it undefined; a
    // frame built from the body flips the mark on a half turn. Taking up from
    // the world keeps right-of-centre on the right for every heading.
    for (let i = 0; i < 32; i += 1) {
      const a = (i / 32) * Math.PI * 2;
      const dir = { x: Math.cos(a), y: Math.sin(a) * 0.7, z: Math.sin(a) };
      const p = logoPoleFor(dir);
      // Screen-right for a viewer sitting along the pole with the world's up.
      const worldRight = { x: p.z, y: 0, z: -p.x };
      // A step towards world right must land right of centre on the mark.
      const step = {
        x: p.x * 0.92 + worldRight.x * 0.39,
        y: p.y * 0.92,
        z: p.z * 0.92 + worldRight.z * 0.39,
      };
      expect(logoUv(step, p, UP).u).toBeGreaterThan(0.5);
    }
  });
});

describe('the shader mirrors the projection', () => {
  it('agrees with the TypeScript on the constants it bakes in', () => {
    expect(ORB_LOGO_GLSL).toContain(LOGO_CAP_ANGLE.toFixed(4));
    // The frame comes in per frame, so the shader bakes in no direction at all.
    expect(ORB_LOGO_GLSL).toContain('logoUv(vec3 surface, vec3 rawPole, vec3 reference)');
  });

  it('declares no uniforms of its own, so it can never collide', () => {
    expect(ORB_LOGO_GLSL).not.toMatch(/\buniform\b/);
  });

  it('uses no reserved word as an identifier', () => {
    // A GLSL link failure here is silent: the orb just goes black (§valkuil).
    const reserved = /\b(?:half|flat|sample|input|output|active|filter|this|template)\s*[=;,)]/;
    expect(ORB_LOGO_GLSL).not.toMatch(reserved);
  });
});

describe('glass, not a solid ball', () => {
  it('keeps almost no flat core, so the ground reads through the middle', () => {
    const orb = new PlayerOrb();
    const flat = /float glass = ([0-9.]+) \+ rim/.exec(orb.material.fragmentShader);
    expect(flat).not.toBeNull();
    expect(Number(flat![1])).toBeLessThan(0.1);
    orb.dispose();
  });

  it('puts the light in the rim, where the surface turns away', () => {
    const orb = new PlayerOrb();
    const gain = /rim \* ([0-9.]+)/.exec(orb.material.fragmentShader);
    expect(Number(gain![1])).toBeGreaterThan(1.5);
    orb.dispose();
  });

  it('takes its colour from the region, in the palette the ground uses', () => {
    const orb = new PlayerOrb();
    // §136.2: three accent colours in this world and no fourth one.
    expect(orb.material.fragmentShader).toContain('vec3 red = vec3(1.0, 0.22, 0.18)');
    expect(orb.material.fragmentShader).toContain('vec3 purple = vec3(0.62, 0.35, 1.0)');
    expect(orb.material.fragmentShader).toContain('vec3 green = vec3(0.45, 1.0, 0.35)');
    orb.dispose();
  });

  it('takes the region colour the rest of the world is drawn in', () => {
    // The orb is handed the SAME colour as the terrain, forest, rig and crowd
    // rather than a second palette keyed on pitch — two palettes is how a world
    // ends up disagreeing with itself about which region you are in.
    const orb = new PlayerOrb();
    expect((orb.material.uniforms.uZoneTint!.value as number[])[0]).toBe(-1);
    orb.setTint({ r: 0.2, g: 0.9, b: 0.4 });
    expect(orb.material.uniforms.uZoneTint!.value).toEqual([0.2, 0.9, 0.4]);
    expect(orb.material.fragmentShader).toContain('uZoneTint.r < 0.0 ? orbZoneColor(uHzNorm) : uZoneTint');
    orb.dispose();
  });
});

describe('the mark glows, it is never outlined', () => {
  it('adds its bleed as light and never subtracts from the body', () => {
    const orb = new PlayerOrb();
    const fragment = orb.material.fragmentShader;
    // A dark contour would have to multiply the body down by the mask.
    expect(fragment).not.toMatch(/1\.0 - [0-9.]+ \* (?:mark|bleed|halo)/);
    expect(fragment).toContain('vec3 halo = tint * bleed');
    expect(fragment).toContain('body + letters + halo');
    orb.dispose();
  });

  it('bleeds well past the outline instead of hugging it', () => {
    // A stroked contour would be a few units wide; a glow is tens.
    expect(LOGO_GLOW_SPREAD).toBeGreaterThan(30);
  });

  it('rasterises the bleed with a blur, not with a stroke', () => {
    const source = createLogoTexture.toString();
    expect(source).toContain('blur(');
    expect(source).not.toContain('stroke');
  });
});

describe('the orb wears the mark', () => {
  it('hands the shader a mark texture and keeps its collision radius', () => {
    const orb = new PlayerOrb();
    expect(orb.material.uniforms.uLogoTex!.value).toBeTruthy();
    expect(orb.radius).toBeLessThanOrEqual(1.6);
    orb.dispose();
  });

  it('reads the mark off the rest surface, so the standing wave carries it', () => {
    const orb = new PlayerOrb();
    expect(orb.material.vertexShader).toContain('vLogo = logoUv(position, uLogoPole, uLogoUp)');
    expect(orb.material.fragmentShader).toContain('uLogoTex');
    orb.dispose();
  });

  it('re-aims the cap every frame from the heading it is flying', () => {
    const orb = new PlayerOrb();
    const state = createInitialFrequencyState();
    const poles: string[] = [];
    for (const dir of [
      { x: 0, y: 0, z: -1 },
      { x: 1, y: 0, z: 0 },
    ]) {
      state.direction.x = dir.x;
      state.direction.y = dir.y;
      state.direction.z = dir.z;
      orb.update(state, 0, 1 / 60, 0);
      const p = orb.material.uniforms.uLogoPole!.value as { x: number; y: number; z: number };
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(1, 3);
      poles.push(`${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`);
    }
    // In object space the cap barely moves — the body turns under it, which is
    // exactly what makes it skin rather than a billboard.
    expect(poles).toHaveLength(2);
    orb.dispose();
  });
});
