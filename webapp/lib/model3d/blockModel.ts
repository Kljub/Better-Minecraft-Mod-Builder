import { effectiveFaceUvs } from "./geometry";
import { FACE_KEYS, type EntityModel, type FaceKey, type ModelCube, type Vec3 } from "./types";

/**
 * Entity model → Minecraft block model(s), for blocks with `model: "custom"` (BlockSpec.customModel).
 *
 * Editor space is the entity editor's: x/z centred on 0 (one block = -8..8), y 0..16 up, the front
 * facing north (-Z). Block space is 0..16 per block with the placed block at cell (0,0,0); a model
 * bigger than one block is cut into 16³ cells — each occupied cell becomes its own block (a part
 * of the multiblock), with a model clipped to its cell and an outline/collision made of its boxes.
 *
 * Java block models can't do everything entity models can: bone rotations are ignored, a cube may
 * only turn around one axis by ±22.5°/±45° (other angles snap), and a rotated cube (or one with
 * rotated faces) isn't cut at cell borders — it stays whole in the cell holding its centre.
 */

export type Box6 = [number, number, number, number, number, number];
export interface BlockPart {
  /** cell offset from the placed block, in blocks (unrotated — the runtime turns it with the facing) */
  offset: Vec3;
  /** model.json `elements` in this cell's 0..16 space */
  elements: Record<string, unknown>[];
  /** outline/collision boxes in this cell's 0..16 space */
  boxes: Box6[];
}
export interface BlockModelResult {
  parts: BlockPart[];
  /** every cube, whole, scaled to fit one block — the item model */
  itemElements: Record<string, unknown>[];
  /** size in blocks [x, y, z] */
  size: Vec3;
  warnings: string[];
}

const ANGLES = [-45, -22.5, 0, 22.5, 45];
const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** cell index → part block id suffix: [1,0,-2] → "1_0_m2" */
export const partSuffix = (o: Vec3) => o.map((n) => (n < 0 ? `m${-n}` : String(n))).join("_");
export const partBlockId = (blockId: string, o: Vec3) => (o.every((n) => n === 0) ? blockId : `${blockId}_p_${partSuffix(o)}`);

/** The texture-axis each face's u / v runs along, and which end of the cube u1 / v1 sit at. */
const FACE_AXES: Record<FaceKey, { u: number; v: number; uFromMax: boolean; vFromMax: boolean }> = {
  north: { u: 0, v: 1, uFromMax: true, vFromMax: true },
  south: { u: 0, v: 1, uFromMax: false, vFromMax: true },
  east: { u: 2, v: 1, uFromMax: true, vFromMax: true },
  west: { u: 2, v: 1, uFromMax: false, vFromMax: true },
  up: { u: 0, v: 2, uFromMax: false, vFromMax: false },
  down: { u: 0, v: 2, uFromMax: false, vFromMax: true },
};
/** the axis a face is perpendicular to, and whether it sits at the max end */
const FACE_PLANE: Record<FaceKey, { axis: number; max: boolean }> = {
  north: { axis: 2, max: false }, south: { axis: 2, max: true },
  west: { axis: 0, max: false }, east: { axis: 0, max: true },
  down: { axis: 1, max: false }, up: { axis: 1, max: true },
};

/** Cube corners in block space (x/z shifted by 8), inflate applied. */
function blockSpace(c: ModelCube): { from: Vec3; to: Vec3 } {
  const lo = (i: number) => Math.min(c.from[i], c.to[i]) - c.inflate + (i === 1 ? 0 : 8);
  const hi = (i: number) => Math.max(c.from[i], c.to[i]) + c.inflate + (i === 1 ? 0 : 8);
  return { from: [lo(0), lo(1), lo(2)], to: [hi(0), hi(1), hi(2)] };
}

function cubeRotation(c: ModelCube, warn: (w: string) => void): { axis: "x" | "y" | "z"; angle: number } | null {
  const turned = [0, 1, 2].filter((i) => Math.abs(c.rotation[i]) > 1e-6);
  if (!turned.length) return null;
  if (turned.length > 1) warn(`cube "${c.name}": rotated around more than one axis — only the ${"xyz"[turned[0]]} rotation is kept`);
  const i = turned[0];
  const want = c.rotation[i];
  const angle = ANGLES.reduce((best, a) => (Math.abs(a - want) < Math.abs(best - want) ? a : best), 0);
  if (Math.abs(angle - want) > 1e-6) warn(`cube "${c.name}": ${want}° snapped to ${angle}° (block models allow ±22.5° / ±45°)`);
  return angle === 0 ? null : { axis: "xyz"[i] as "x" | "y" | "z", angle };
}

/**
 * One element (model.json) for the part of a cube inside [lo, hi] (block space), shifted by -shift.
 * `clip` false: the whole cube. Faces on a cut (not on the cube's own surface) are left out.
 */
function element(model: EntityModel, c: ModelCube, rot: ReturnType<typeof cubeRotation>, lo: Vec3, hi: Vec3, shift: Vec3, scale = 1): Record<string, unknown> {
  const full = blockSpace(c);
  const uvs = effectiveFaceUvs(c);
  const su = 16 / model.textureWidth, sv = 16 / model.textureHeight;
  const faces: Record<string, unknown> = {};
  for (const k of FACE_KEYS) {
    const f = c.faces[k];
    if (!f.enabled) continue;
    const plane = FACE_PLANE[k];
    // a face on a cut is inside the model — nothing to draw
    const at = plane.max ? hi[plane.axis] : lo[plane.axis];
    const own = plane.max ? full.to[plane.axis] : full.from[plane.axis];
    if (Math.abs(at - own) > 1e-6) continue;
    const [u1, v1, u2, v2] = uvs[k];
    const ax = FACE_AXES[k];
    // where along the cube [lo, hi] sits, 0..1 from the u1/v1 end
    const span = (axis: number, fromMax: boolean, a: number) => {
      const len = full.to[axis] - full.from[axis] || 1;
      return fromMax ? (full.to[axis] - a) / len : (a - full.from[axis]) / len;
    };
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const uA = lerp(u1, u2, span(ax.u, ax.uFromMax, ax.uFromMax ? hi[ax.u] : lo[ax.u]));
    const uB = lerp(u1, u2, span(ax.u, ax.uFromMax, ax.uFromMax ? lo[ax.u] : hi[ax.u]));
    const vA = lerp(v1, v2, span(ax.v, ax.vFromMax, ax.vFromMax ? hi[ax.v] : lo[ax.v]));
    const vB = lerp(v1, v2, span(ax.v, ax.vFromMax, ax.vFromMax ? lo[ax.v] : hi[ax.v]));
    faces[k] = {
      uv: [round(uA * su), round(vA * sv), round(uB * su), round(vB * sv)],
      texture: "#tex",
      ...(f.rotation ? { rotation: f.rotation } : {}),
    };
  }
  const tx = (p: Vec3) => p.map((n, i) => round((n - shift[i]) * scale + (scale !== 1 ? 8 - 8 * scale : 0))) as Vec3;
  const origin: Vec3 = [c.origin[0] + 8, c.origin[1], c.origin[2] + 8];
  return {
    name: c.name,
    from: tx(lo), to: tx(hi),
    ...(rot ? { rotation: { origin: tx(origin), axis: rot.axis, angle: rot.angle } } : {}),
    faces,
  };
}

export function modelBoundsBlocks(model: EntityModel): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const c of model.cubes) {
    const b = blockSpace(c);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.from[i]); max[i] = Math.max(max[i], b.to[i]); }
  }
  return model.cubes.length ? { min, max } : { min: [0, 0, 0], max: [16, 16, 16] };
}

/** Does the model fit into one block (0..16 on every axis)? */
export function fitsOneBlock(model: EntityModel): boolean {
  const { min, max } = modelBoundsBlocks(model);
  return min.every((n) => n >= -1e-6) && max.every((n) => n <= 16 + 1e-6);
}

export function buildBlockModel(model: EntityModel, multiblock: boolean): BlockModelResult {
  const warnings: string[] = [];
  const warn = (w: string) => { if (!warnings.includes(w)) warnings.push(w); };
  if (model.bones.some((b) => b.rotation.some((r) => Math.abs(r) > 1e-6))) warn("bone rotations are ignored — block models only know cube rotations");
  if (!multiblock && !fitsOneBlock(model)) warn("the model is bigger than one block (16×16×16 px) — enable Multiblock, or only the part inside the block is used");

  const cells = new Map<string, BlockPart>();
  const cell = (o: Vec3) => {
    const key = o.join(",");
    let p = cells.get(key);
    if (!p) { p = { offset: o, elements: [], boxes: [] }; cells.set(key, p); }
    return p;
  };
  cell([0, 0, 0]);
  const allowed = (o: Vec3) => multiblock || o.every((n) => n === 0);

  for (const c of model.cubes) {
    const b = blockSpace(c);
    const rot = cubeRotation(c, warn);
    const lo3 = b.from.map((n) => Math.floor(n / 16)) as Vec3;
    const hi3 = b.to.map((n, i) => Math.max(lo3[i], Math.ceil(n / 16) - 1)) as Vec3;
    const whole = !!rot || FACE_KEYS.some((k) => c.faces[k].enabled && c.faces[k].rotation);
    // outline/collision: the cube's (unrotated) box, cut per cell
    for (let x = lo3[0]; x <= hi3[0]; x++) for (let y = lo3[1]; y <= hi3[1]; y++) for (let z = lo3[2]; z <= hi3[2]; z++) {
      const o: Vec3 = [x, y, z];
      if (!allowed(o)) continue;
      const lo = b.from.map((n, i) => Math.max(n, o[i] * 16)) as Vec3;
      const hi = b.to.map((n, i) => Math.min(n, o[i] * 16 + 16)) as Vec3;
      // a flat cube (a plane, size 0 on one axis) is drawn but has no outline/collision
      if (hi.some((n, i) => n - lo[i] <= 1e-6 && b.to[i] - b.from[i] > 1e-6)) continue;
      const part = cell(o);
      const shift = o.map((n) => n * 16) as Vec3;
      if (hi.every((n, i) => n - lo[i] > 1e-6)) part.boxes.push([...lo.map((n, i) => round(n - shift[i])), ...hi.map((n, i) => round(n - shift[i]))] as Box6);
      if (!whole) part.elements.push(element(model, c, null, lo, hi, shift));
    }
    if (whole) {
      // rotated: kept in one piece, in the cell holding its centre (block models allow -16..32)
      const centre = b.from.map((n, i) => Math.floor((n + b.to[i]) / 2 / 16)) as Vec3;
      if (!allowed(centre)) continue;
      const shift = centre.map((n) => n * 16) as Vec3;
      if (b.from.some((n, i) => n - shift[i] < -16) || b.to.some((n, i) => n - shift[i] > 32)) warn(`cube "${c.name}" is rotated and reaches more than a block past its cell — it may be cut off in game`);
      cell(centre).elements.push(element(model, c, rot, b.from, b.to, shift));
    }
  }

  // item: everything, scaled down to one block when bigger
  const { min, max } = modelBoundsBlocks(model);
  const extent = Math.max(...max.map((n, i) => n - min[i]));
  const scale = extent > 16 ? 16 / extent : 1;
  const centre = min.map((n, i) => (n + max[i]) / 2) as Vec3;
  // scaled about the model's centre, which ends up at the block's centre (8, y-centre, 8)
  const itemShift: Vec3 = scale === 1 ? [0, 0, 0] : [centre[0] - 8, centre[1] - 8, centre[2] - 8];
  const itemElements = model.cubes.map((c) => {
    const b = blockSpace(c);
    return element(model, c, cubeRotation(c, () => {}), b.from, b.to, itemShift, scale);
  });

  const size = max.map((n, i) => Math.max(1, Math.ceil(n / 16) - Math.floor(min[i] / 16))) as Vec3;
  return { parts: [...cells.values()], itemElements, size: multiblock ? size : [1, 1, 1], warnings };
}

/** model.json for one part / the item */
export function blockModelFile(texture: string, elements: Record<string, unknown>[], item = false): string {
  return JSON.stringify({
    parent: item ? "minecraft:block/block" : undefined,
    textures: { tex: texture, particle: texture },
    elements,
  }, null, 2);
}

/** blockstate: four horizontal facings (front = north in the model) */
export function facingBlockstate(modelRef: string): string {
  const y = { north: 0, east: 90, south: 180, west: 270 } as const;
  return JSON.stringify({
    variants: Object.fromEntries(Object.entries(y).map(([f, r]) => [`facing=${f}`, r ? { model: modelRef, y: r } : { model: modelRef }])),
  }, null, 2);
}
