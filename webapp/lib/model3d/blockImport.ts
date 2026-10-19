import * as THREE from "three";
import { chestQuads, type ChestVertex } from "@/lib/chestModel";
import { makeBone, makeCube } from "./geometry";
import { FACE_KEYS, type EntityModel, type FaceKey, type ModelFace, type Vec3 } from "./types";

/**
 * Entity Models: start from a Minecraft block — a full 16×16×16 cube with the block texture on
 * every face, or, for a chest skin (entity/chest/…), the vanilla chest (bottom, lid bone with the
 * lock) with exactly the UVs the game uses. Editor space: x/z centred on 0, the block on y 0..16.
 */
export function blockEntityModel(texture: string, size: { width: number; height: number }, chest: boolean): EntityModel {
  return chest ? chestEntityModel(texture) : cubeEntityModel(texture, size);
}

function cubeEntityModel(texture: string, { width, height }: { width: number; height: number }): EntityModel {
  const bone = makeBone({ name: "block", origin: [0, 0, 0] });
  // Animated block textures are vertical strips — the first frame is the top square.
  const frame = Math.max(1, Math.min(width, height));
  const face = (): ModelFace => ({ uv: [0, 0, frame, frame], rotation: 0, enabled: true });
  const faces = Object.fromEntries(FACE_KEYS.map((k) => [k, face()])) as Record<FaceKey, ModelFace>;
  return {
    textureWidth: width, textureHeight: height, texture,
    bones: [bone],
    cubes: [makeCube({ name: "block", bone: bone.id, from: [-8, 0, -8], to: [8, 16, 8], boxUv: false, faces })],
  };
}

const BOX_FACE_ORDER = ["east", "west", "up", "down", "south", "north"] as const;
/** chestQuads order: down, up, west, north, east, south */
const QUAD_FACE: Record<FaceKey, number> = { down: 0, up: 1, west: 2, north: 3, east: 4, south: 5 };

function chestEntityModel(texture: string): EntityModel {
  const chest = makeBone({ name: "chest", origin: [0, 0, 0] });
  // Vanilla lid pivot (0, 9, 1) in chest space (0..16), shifted to the centred editor space.
  const lid = makeBone({ name: "lid", parent: chest.id, origin: [-8, 9, -7] });
  const part = (name: "bottom" | "lid" | "lock", bone: string, offset: Vec3) => {
    const quads = chestQuads(name).map((q) => q.map((v) => ({ ...v, x: v.x + offset[0], y: v.y + offset[1], z: v.z + offset[2] })));
    const xs = quads.flat().map((v) => v.x), ys = quads.flat().map((v) => v.y), zs = quads.flat().map((v) => v.z);
    const from: Vec3 = [Math.min(...xs), Math.min(...ys), Math.min(...zs)];
    const to: Vec3 = [Math.max(...xs), Math.max(...ys), Math.max(...zs)];
    return makeCube({ name, bone, from, to, origin: [...(bone === lid.id ? lid.origin : chest.origin)] as Vec3, boxUv: false, faces: matchFaces(from, to, quads) });
  };
  return {
    textureWidth: 64, textureHeight: 64, texture,
    bones: [chest, lid],
    cubes: [
      part("bottom", chest.id, [-8, 0, -8]),
      part("lid", lid.id, [-8, 9, -7]),
      part("lock", lid.id, [-8, 9, -7]),
    ],
  };
}

/**
 * Per-face UV rects (+ rotation) that put each vanilla polygon's texture corners on the same
 * corners of the editor's box faces (three.js BoxGeometry vertex order, see faceVertexUvs).
 */
function matchFaces(from: Vec3, to: Vec3, quads: ChestVertex[][]): Record<FaceKey, ModelFace> {
  const size = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const center = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const pos = geo.getAttribute("position");
  const faces = {} as Record<FaceKey, ModelFace>;
  BOX_FACE_ORDER.forEach((face, fi) => {
    const quad = quads[QUAD_FACE[face]];
    const uvs = [0, 1, 2, 3].map((vi) => {
      const p = [pos.getX(fi * 4 + vi) + center[0], pos.getY(fi * 4 + vi) + center[1], pos.getZ(fi * 4 + vi) + center[2]];
      const v = quad.find((q) => Math.abs(q.x - p[0]) < 1e-4 && Math.abs(q.y - p[1]) < 1e-4 && Math.abs(q.z - p[2]) < 1e-4)!;
      return [v.u * 64, v.v * 64];
    });
    faces[face] = rectFor(uvs);
  });
  geo.dispose();
  return faces;
}

/** Inverts faceVertexUvs: corner uvs (TL, TR, BL, BR after rotation) → rect + rotation. */
function rectFor(out: number[][]): ModelFace {
  let a = out;
  for (let rotation = 0; rotation < 360; rotation += 90) {
    if (a[0][1] === a[1][1] && a[0][0] === a[2][0] && a[3][0] === a[1][0] && a[3][1] === a[2][1]) {
      return { uv: [a[0][0], a[0][1], a[1][0], a[2][1]], rotation, enabled: true };
    }
    // undo one 90° step of faceVertexUvs ([a2, a0, a3, a1])
    a = [a[1], a[3], a[0], a[2]];
  }
  return { uv: [out[0][0], out[0][1], out[3][0], out[3][1]], rotation: 0, enabled: true };
}
