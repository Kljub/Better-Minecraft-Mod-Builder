import { FACE_KEYS, type EntityModel, type FaceKey, type ModelCube } from "./types";
import { effectiveFaceUvs } from "./geometry";
import { updateCube } from "./edit";

/**
 * UV layout edits for the Skin tab: pick a UV island/face under a texture pixel, move it, switch
 * a cube between box UV and per-face UV, and share one face's area across all its sides.
 * Overlapping UVs are allowed on purpose — that's how faces/cubes share the same texture area.
 */

export interface UvTarget {
  cubeId: string;
  /** null = the cube's whole box-UV island (or all faces of a per-face cube) */
  face: FaceKey | null;
}

export interface PixelRect { x: number; y: number; w: number; h: number }

/** Normalized integer pixel rect of a face UV ([u1,v1,u2,v2] may be flipped). */
export function faceRect(uv: [number, number, number, number]): PixelRect {
  const x0 = Math.floor(Math.min(uv[0], uv[2])), y0 = Math.floor(Math.min(uv[1], uv[3]));
  return { x: x0, y: y0, w: Math.ceil(Math.max(uv[0], uv[2])) - x0, h: Math.ceil(Math.max(uv[1], uv[3])) - y0 };
}

const inside = (r: PixelRect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/** Topmost (last-drawn) UV under texture pixel (x, y): a box-UV cube's island, or a per-face cube's face. */
export function hitTestUv(model: EntityModel, x: number, y: number): UvTarget | null {
  for (let i = model.cubes.length - 1; i >= 0; i--) {
    const c = model.cubes[i];
    const uvs = effectiveFaceUvs(c);
    for (const face of FACE_KEYS) {
      if (!c.boxUv && !c.faces[face].enabled) continue;
      const r = faceRect(uvs[face]);
      if (r.w > 0 && r.h > 0 && inside(r, x, y)) return { cubeId: c.id, face: c.boxUv ? null : face };
    }
  }
  return null;
}

/** Texture areas a UV target covers (for highlighting and "move pixels too"). */
export function targetRects(cube: ModelCube, face: FaceKey | null): PixelRect[] {
  const uvs = effectiveFaceUvs(cube);
  const faces = face ? [face] : FACE_KEYS.filter((f) => cube.boxUv || cube.faces[f].enabled);
  return faces.map((f) => faceRect(uvs[f])).filter((r) => r.w > 0 && r.h > 0);
}

/** Moves a UV target by whole pixels. */
export function moveUv(model: EntityModel, target: UvTarget, dx: number, dy: number): EntityModel {
  const c = model.cubes.find((x) => x.id === target.cubeId);
  if (!c || (!dx && !dy)) return model;
  if (c.boxUv) return updateCube(model, c.id, { uvOffset: [c.uvOffset[0] + dx, c.uvOffset[1] + dy] });
  const shift = (uv: [number, number, number, number]): [number, number, number, number] => [uv[0] + dx, uv[1] + dy, uv[2] + dx, uv[3] + dy];
  const faces = { ...c.faces };
  for (const f of FACE_KEYS) if (target.face === null || target.face === f) faces[f] = { ...faces[f], uv: shift(faces[f].uv) };
  return updateCube(model, c.id, { faces });
}

/** Box UV → per-face UV, keeping exactly the current layout (then faces can move on their own). */
export function toPerFaceUv(model: EntityModel, cubeId: string): EntityModel {
  const c = model.cubes.find((x) => x.id === cubeId);
  if (!c || !c.boxUv) return model;
  const uvs = effectiveFaceUvs(c);
  const faces = Object.fromEntries(FACE_KEYS.map((f) => [f, { uv: uvs[f], rotation: 0, enabled: true }])) as ModelCube["faces"];
  return updateCube(model, cubeId, { boxUv: false, faces });
}

/** Back to box UV (automatic layout from the cube's UV offset). */
export function toBoxUv(model: EntityModel, cubeId: string): EntityModel {
  const c = model.cubes.find((x) => x.id === cubeId);
  if (!c || c.boxUv) return model;
  // Keep the island where the north face was, so it doesn't jump far away.
  const n = faceRect(c.faces.north.uv);
  const d = Math.floor(Math.abs(c.to[2] - c.from[2]));
  return updateCube(model, cubeId, { boxUv: true, uvOffset: [Math.max(0, n.x - d), Math.max(0, n.y - d)] });
}

/** Every side of the cube uses `face`'s texture area (same orientation). */
export function shareFaceOnAllSides(model: EntityModel, cubeId: string, face: FaceKey): EntityModel {
  const base = toPerFaceUv(model, cubeId);
  const c = base.cubes.find((x) => x.id === cubeId)!;
  const uv = c.faces[face].uv;
  const faces = Object.fromEntries(FACE_KEYS.map((f) => [f, { ...c.faces[f], uv: [...uv] as typeof uv, enabled: true }])) as ModelCube["faces"];
  return updateCube(base, cubeId, { faces });
}

/** Copies `face`'s texture area onto other faces of the same cube. */
export function copyFaceUv(model: EntityModel, cubeId: string, from: FaceKey, to: FaceKey[]): EntityModel {
  const base = toPerFaceUv(model, cubeId);
  const c = base.cubes.find((x) => x.id === cubeId)!;
  const faces = { ...c.faces };
  for (const f of to) faces[f] = { ...faces[f], uv: [...c.faces[from].uv] as [number, number, number, number], enabled: true };
  return updateCube(base, cubeId, { faces });
}
