import * as THREE from "three";
import type { EntityCuboid } from "./types";

/** 1 Minecraft model unit (1/16 block) in three.js scene units — matches SteveViewer3D's PX. */
export const MODEL_PX = 1 / 16;

interface FaceRect { u0: number; v0: number; u1: number; v1: number }

/**
 * The exact box-UV "cross" auto-layout every vanilla Minecraft cuboid uses — ported from this
 * project's own decompiled `net.minecraft.client.model.geom.ModelPart.Cube` constructor (not
 * guessed): given one `texOffs(u,v)` origin and the box's width/height/depth, all 6 faces lay out
 * in fixed bands (`u1=u0+depth, u2=u1+width, u3=u2+depth, u4=u3+width`, `v1=v0+depth, v2=v1+height`).
 * Values are texture-pixel coordinates (not yet normalized to 0..1 or three.js's flipped V).
 */
function faceRectsPx(uOff: number, vOff: number, w: number, h: number, d: number) {
  const u0 = uOff, u1 = u0 + d, u2 = u1 + w, u22 = u2 + w, u3 = u2 + d, u4 = u3 + w;
  const v0 = vOff, v1 = v0 + d, v2 = v1 + h;
  return {
    down: { u0: u1, v0, u1: u2, v1 } as FaceRect,
    up: { u0: u2, v0: v1, u1: u22, v1: v0 } as FaceRect,
    west: { u0, v0: v1, u1, v1: v2 } as FaceRect,
    north: { u0: u1, v0: v1, u1: u2, v1: v2 } as FaceRect,
    east: { u0: u2, v0: v1, u1: u3, v1: v2 } as FaceRect,
    south: { u0: u3, v0: v1, u1: u4, v1: v2 } as FaceRect,
  };
}

// three.js BoxGeometry (segments=1) groups its 24 vertices into 6 faces of 4, in this fixed order:
// +x, -x, +y, -y, +z, -z. Minecraft's own axis meaning lines up directly (WEST=-x, EAST=+x,
// DOWN=-y, UP=+y, NORTH=-z, SOUTH=+z) — no axis remapping needed, just this face-order mapping.
const FACE_ORDER = ["east", "west", "up", "down", "south", "north"] as const;

/**
 * Rewrites a fresh `THREE.BoxGeometry`'s UV attribute in place to match the real box-UV layout
 * above, for a WYSIWYG-ish preview. Reads each vertex's *existing* default UV (always a 0/1 corner
 * per three.js's own box construction) as a lerp parameter into our computed rectangle, so this
 * doesn't have to assume three.js's exact per-face vertex winding order — only its face grouping.
 * `mirror` isn't applied here (preview-only simplification; the flag still round-trips to Java,
 * where it's the authoritative, correctly-mirrored render).
 */
export function applyBoxUV(geometry: THREE.BoxGeometry, cuboid: EntityCuboid, texW: number, texH: number): void {
  const rects = faceRectsPx(cuboid.uv[0], cuboid.uv[1], cuboid.size[0], cuboid.size[1], cuboid.size[2]);
  const uvAttr = geometry.getAttribute("uv") as THREE.BufferAttribute;
  const defaultU = new Float32Array(uvAttr.count);
  const defaultV = new Float32Array(uvAttr.count);
  for (let i = 0; i < uvAttr.count; i++) { defaultU[i] = uvAttr.getX(i); defaultV[i] = uvAttr.getY(i); }

  for (let face = 0; face < 6; face++) {
    const rect = rects[FACE_ORDER[face]];
    const nu0 = rect.u0 / texW, nu1 = rect.u1 / texW;
    // three.js UV space has v=0 at the bottom of the loaded image (default flipY), Minecraft's v
    // is top-down pixel rows — flip here.
    const nv0 = 1 - rect.v0 / texH, nv1 = 1 - rect.v1 / texH;
    for (let v = 0; v < 4; v++) {
      const idx = face * 4 + v;
      uvAttr.setXY(idx, nu0 + defaultU[idx] * (nu1 - nu0), nv0 + defaultV[idx] * (nv1 - nv0));
    }
  }
  uvAttr.needsUpdate = true;
}

/** Box center, in model units — the implicit rotation pivot (no separate stored pivot field). */
export function cuboidCenter(cuboid: EntityCuboid): [number, number, number] {
  return [
    cuboid.position[0] + cuboid.size[0] / 2,
    cuboid.position[1] + cuboid.size[1] / 2,
    cuboid.position[2] + cuboid.size[2] / 2,
  ];
}

/** Builds a `Group` at the box's center (world position, scaled to scene units) containing one
 * `Mesh` offset back to the box's min corner — so rotating the group rotates the box around its
 * own center, matching how the Java side poses each cuboid's own PartDefinition. */
export function buildCuboidGroup(cuboid: EntityCuboid, material: THREE.Material, texW: number, texH: number): THREE.Group {
  const group = new THREE.Group();
  const [cx, cy, cz] = cuboidCenter(cuboid);
  group.position.set(cx * MODEL_PX, cy * MODEL_PX, cz * MODEL_PX);
  group.rotation.set(
    THREE.MathUtils.degToRad(cuboid.rotation[0]),
    THREE.MathUtils.degToRad(cuboid.rotation[1]),
    THREE.MathUtils.degToRad(cuboid.rotation[2]),
  );

  const [w, h, d] = cuboid.size;
  const geo = new THREE.BoxGeometry(Math.max(w, 0.01) * MODEL_PX, Math.max(h, 0.01) * MODEL_PX, Math.max(d, 0.01) * MODEL_PX);
  applyBoxUV(geo, cuboid, texW, texH);
  const mesh = new THREE.Mesh(geo, material);
  // mesh sits at the group's local origin (0,0,0) = box center; no offset needed since the box
  // geometry is already centered on its own origin — the group's world position IS the center.
  mesh.userData.cuboidId = cuboid.id;
  group.add(mesh);
  group.userData.cuboidId = cuboid.id;
  return group;
}

/** A small checkerboard placeholder texture for when the entity has no skin picked yet. */
export function createCheckerTexture(): THREE.Texture {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#8b8b8b" : "#6e6e6e";
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

/** Converts a group's current world transform (after a finished gizmo drag) back into the
 * cuboid's data fields — the inverse of `buildCuboidGroup`'s placement. */
export function readGroupTransform(group: THREE.Object3D, size: [number, number, number]): { position: [number, number, number]; rotation: [number, number, number] } {
  const cx = group.position.x / MODEL_PX, cy = group.position.y / MODEL_PX, cz = group.position.z / MODEL_PX;
  return {
    position: [cx - size[0] / 2, cy - size[1] / 2, cz - size[2] / 2],
    rotation: [
      THREE.MathUtils.radToDeg(group.rotation.x),
      THREE.MathUtils.radToDeg(group.rotation.y),
      THREE.MathUtils.radToDeg(group.rotation.z),
    ],
  };
}
