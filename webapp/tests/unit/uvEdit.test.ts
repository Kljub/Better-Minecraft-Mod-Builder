import { describe, it, expect } from "vitest";
import { makeCube } from "@/lib/model3d/geometry";
import { effectiveFaceUvs } from "@/lib/model3d/geometry";
import { hitTestUv, moveUv, toPerFaceUv, toBoxUv, shareFaceOnAllSides, targetRects } from "@/lib/model3d/uvEdit";
import type { EntityModel } from "@/lib/model3d/types";

const model = (): EntityModel => ({
  textureWidth: 64, textureHeight: 64, texture: "", bones: [],
  cubes: [makeCube({ id: "a", from: [0, 0, 0], to: [8, 8, 8], uvOffset: [0, 0] }), makeCube({ id: "b", from: [0, 0, 0], to: [4, 4, 4], uvOffset: [32, 0] })],
});

describe("UV editing", () => {
  it("hit-tests islands (not their empty corners)", () => {
    const m = model();
    expect(hitTestUv(m, 10, 2)).toEqual({ cubeId: "a", face: null }); // up face of a (8..16, 0..8)
    expect(hitTestUv(m, 2, 2)).toBeNull(); // empty corner of the box-UV cross
    expect(hitTestUv(m, 33, 6)).toEqual({ cubeId: "b", face: null });
  });
  it("moves a box-UV island onto another (shared texture area)", () => {
    const m = moveUv(model(), { cubeId: "b", face: null }, -32, 0);
    expect(m.cubes[1].uvOffset).toEqual([0, 0]);
  });
  it("per-face UV keeps the layout, then moves one face; all sides can share one face", () => {
    let m = toPerFaceUv(model(), "a");
    const before = effectiveFaceUvs(model().cubes[0]);
    expect(m.cubes[0].boxUv).toBe(false);
    expect(effectiveFaceUvs(m.cubes[0])).toEqual(before);
    m = moveUv(m, { cubeId: "a", face: "north" }, 40, 20);
    expect(m.cubes[0].faces.north.uv).toEqual([48, 28, 56, 36]);
    expect(m.cubes[0].faces.south.uv).toEqual(before.south);
    m = shareFaceOnAllSides(m, "a", "north");
    for (const f of ["north", "east", "south", "west", "up", "down"] as const) expect(m.cubes[0].faces[f].uv).toEqual([48, 28, 56, 36]);
    expect(targetRects(m.cubes[0], null)).toHaveLength(6);
    const back = toBoxUv(m, "a");
    expect(back.cubes[0].boxUv).toBe(true);
    expect(back.cubes[0].uvOffset).toEqual([40, 20]);
  });
});
