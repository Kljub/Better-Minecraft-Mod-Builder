import { FACE_KEYS, type EntityModel, type FaceKey, type ModelBone, type ModelCube, type ModelFace, type Vec3 } from "./types";

export const cubeSize = (c: ModelCube): Vec3 => [c.to[0] - c.from[0], c.to[1] - c.from[1], c.to[2] - c.from[2]];

/**
 * Box-UV face rectangles for a cube — Blockbench's Cube.preview_controller.updateUV table,
 * which matches vanilla ModelPart.Cube: east | north | west | south across the middle band,
 * up | down above. Returned in texture pixels as [u1, v1, u2, v2] (reversed = flipped).
 */
export function boxUvRects(size: Vec3, uvOffset: [number, number], mirror: boolean): Record<FaceKey, [number, number, number, number]> {
  // Box UV sizes are floored to whole pixels, like Blockbench (box_uv_float_size off).
  const [w, h, d] = size.map((s) => Math.floor(Math.abs(s) + 1e-6)) as Vec3;
  const list: { face: FaceKey; from: [number, number]; size: [number, number] }[] = [
    { face: "east", from: [0, d], size: [d, h] },
    { face: "west", from: [d + w, d], size: [d, h] },
    { face: "up", from: [d + w, d], size: [-w, -d] },
    { face: "down", from: [d + w * 2, 0], size: [-w, d] },
    { face: "south", from: [d * 2 + w, d], size: [w, h] },
    { face: "north", from: [d, d], size: [w, h] },
  ];
  if (mirror) {
    for (const f of list) { f.from[0] += f.size[0]; f.size[0] *= -1; }
    const east = list[0], west = list[1];
    [east.from, west.from] = [west.from, east.from];
    [east.size, west.size] = [west.size, east.size];
  }
  const out = {} as Record<FaceKey, [number, number, number, number]>;
  for (const f of list) {
    out[f.face] = [
      f.from[0] + uvOffset[0], f.from[1] + uvOffset[1],
      f.from[0] + f.size[0] + uvOffset[0], f.from[1] + f.size[1] + uvOffset[1],
    ];
  }
  return out;
}

/** The face UVs actually used for rendering/export (box UV computed, else stored per face). */
export function effectiveFaceUvs(cube: ModelCube): Record<FaceKey, [number, number, number, number]> {
  if (cube.boxUv) return boxUvRects(cubeSize(cube), cube.uvOffset, cube.mirror);
  return Object.fromEntries(FACE_KEYS.map((k) => [k, cube.faces[k].uv])) as Record<FaceKey, [number, number, number, number]>;
}

/**
 * Normalized vertex UVs for one face, in three.js BoxGeometry's per-face vertex order
 * (top-left, top-right, bottom-left, bottom-right) — Blockbench's exact mapping incl. face
 * rotation, with V flipped for three.js (v=0 at the bottom of the image).
 */
export function faceVertexUvs(uv: [number, number, number, number], rotation: number, texW: number, texH: number, boxUv: boolean): [number, number][] {
  let [u1, v1, u2, v2] = uv;
  if (boxUv) {
    // Blockbench's texture-bleeding guard: pull each edge 1/64 px inwards.
    const m = 1 / 64;
    const mu = u1 > u2 ? -m : m, mv = v1 > v2 ? -m : m;
    u1 += mu; u2 -= mu; v1 += mv; v2 -= mv;
  }
  let arr: [number, number][] = [
    [u1 / texW, 1 - v1 / texH],
    [u2 / texW, 1 - v1 / texH],
    [u1 / texW, 1 - v2 / texH],
    [u2 / texW, 1 - v2 / texH],
  ];
  for (let rot = rotation; rot > 0; rot -= 90) arr = [arr[2], arr[0], arr[3], arr[1]];
  return arr;
}

export function defaultFaces(): Record<FaceKey, ModelFace> {
  return Object.fromEntries(FACE_KEYS.map((k) => [k, { uv: [0, 0, 0, 0], rotation: 0, enabled: true }])) as Record<FaceKey, ModelFace>;
}

let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function makeCube(partial: Partial<ModelCube> = {}): ModelCube {
  return {
    id: newId("cube"), name: "cube", bone: null,
    from: [-4, 0, -4], to: [4, 8, 4], origin: [0, 0, 0], rotation: [0, 0, 0],
    inflate: 0, boxUv: true, uvOffset: [0, 0], mirror: false, faces: defaultFaces(),
    ...partial,
  };
}

export function makeBone(partial: Partial<ModelBone> = {}): ModelBone {
  return { id: newId("bone"), name: "bone", parent: null, origin: [0, 0, 0], rotation: [0, 0, 0], ...partial };
}

export function emptyModel(): EntityModel {
  const body = makeBone({ name: "body", origin: [0, 0, 0] });
  return {
    textureWidth: 64, textureHeight: 64, texture: "",
    bones: [body],
    cubes: [makeCube({ name: "body", bone: body.id, from: [-4, 0, -4], to: [4, 8, 4] })],
  };
}

/** Bone ids under `boneId` (inclusive), depth-first. */
export function boneSubtree(model: EntityModel, boneId: string): string[] {
  const out = [boneId];
  for (let i = 0; i < out.length; i++) for (const b of model.bones) if (b.parent === out[i]) out.push(b.id);
  return out;
}

export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Moves a bone (pivot + every descendant bone and cube) by `delta`. */
export function translateBone(model: EntityModel, boneId: string, delta: Vec3): EntityModel {
  const ids = new Set(boneSubtree(model, boneId));
  return {
    ...model,
    bones: model.bones.map((b) => (ids.has(b.id) ? { ...b, origin: add3(b.origin, delta) } : b)),
    cubes: model.cubes.map((c) => (c.bone && ids.has(c.bone)
      ? { ...c, from: add3(c.from, delta), to: add3(c.to, delta), origin: add3(c.origin, delta) }
      : c)),
  };
}

/** Unique name within the model ("arm", "arm2", …) — bone names must be unique for every export format. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const clean = base.replace(/[^A-Za-z0-9_]/g, "_") || "bone";
  if (!used.has(clean)) return clean;
  let n = 2;
  while (used.has(`${clean}${n}`)) n++;
  return `${clean}${n}`;
}
