import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { blockEntityModel } from "@/lib/model3d/blockImport";
import { faceVertexUvs } from "@/lib/model3d/geometry";
import { chestQuads } from "@/lib/chestModel";

const BOX_FACE_ORDER = ["east", "west", "up", "down", "south", "north"] as const;
const QUAD_FACE = { down: 0, up: 1, west: 2, north: 3, east: 4, south: 5 } as const;

describe("block import (Entity Models)", () => {
  it("a chest skin gives the vanilla chest with the game's UV at every corner", () => {
    const m = blockEntityModel("entity/chest/normal.png", { width: 64, height: 64 }, true);
    expect(m.bones.map((b) => b.name)).toEqual(["chest", "lid"]);
    expect(m.cubes.map((c) => c.name)).toEqual(["bottom", "lid", "lock"]);
    const offsets = { bottom: [-8, 0, -8], lid: [-8, 9, -7], lock: [-8, 9, -7] } as const;
    for (const c of m.cubes) {
      const name = c.name as keyof typeof offsets;
      const size = [c.to[0] - c.from[0], c.to[1] - c.from[1], c.to[2] - c.from[2]];
      const center = [(c.from[0] + c.to[0]) / 2, (c.from[1] + c.to[1]) / 2, (c.from[2] + c.to[2]) / 2];
      const pos = new THREE.BoxGeometry(size[0], size[1], size[2]).getAttribute("position");
      const quads = chestQuads(name);
      BOX_FACE_ORDER.forEach((face, fi) => {
        const f = c.faces[face];
        const uvs = faceVertexUvs(f.uv, f.rotation, 64, 64, false);
        for (let vi = 0; vi < 4; vi++) {
          const p = [pos.getX(fi * 4 + vi) + center[0] - offsets[name][0], pos.getY(fi * 4 + vi) + center[1] - offsets[name][1], pos.getZ(fi * 4 + vi) + center[2] - offsets[name][2]];
          const v = quads[QUAD_FACE[face]].find((q) => q.x === p[0] && q.y === p[1] && q.z === p[2])!;
          expect([uvs[vi][0] * 64, (1 - uvs[vi][1]) * 64]).toEqual([v.u * 64, v.v * 64]);
        }
      });
    }
  });

  it("a block texture gives one full block with the texture on every face", () => {
    const m = blockEntityModel("block/oak_planks.png", { width: 16, height: 16 }, false);
    expect(m.cubes).toHaveLength(1);
    expect(m.cubes[0].from).toEqual([-8, 0, -8]);
    expect(m.cubes[0].to).toEqual([8, 16, 8]);
    expect(m.cubes[0].faces.north.uv).toEqual([0, 0, 16, 16]);
    expect(m.texture).toBe("block/oak_planks.png");
  });
});
