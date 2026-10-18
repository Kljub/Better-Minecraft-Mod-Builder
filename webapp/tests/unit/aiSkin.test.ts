import { describe, expect, it } from "vitest";
import { clipOps, faceSize, skinContext, validateAiSkin } from "@/lib/model3d/aiSkin";
import { emptyModel } from "@/lib/model3d/geometry";
import { buildPrompt, buildTask } from "@/app/api/ai/tasks";

describe("AI skin", () => {
  it("face sizes as seen from outside", () => {
    expect(faceSize([4, 6, 2], "north")).toEqual([4, 6]);
    expect(faceSize([4, 6, 2], "east")).toEqual([2, 6]);
    expect(faceSize([4, 6, 2], "up")).toEqual([4, 2]);
  });

  it("context lists cubes with their face sizes", () => {
    const ctx = skinContext(emptyModel());
    expect(ctx.bones).toEqual([{ name: "body", parent: null }]);
    expect(ctx.cubes[0]).toMatchObject({ name: "body", bone: "body", size: [8, 8, 8], faces: { north: [8, 8] } });
    expect(buildPrompt("skin", "a slime", ctx)).toContain("body (bone body), size [8, 8, 8], faces north 8x8");
  });

  it("validation drops bad colours/faces and bounds numbers", () => {
    const v = validateAiSkin({
      default_color: "red", noise: 3,
      parts: [{ name: "body", color: "#AABBCC" }, { name: "x", color: "nope" }],
      faces: [{ cube: "body", face: "north", color: "", ops: [{ x: -2, y: 1.6, w: 0, h: 2, color: "#ffffff" }, { x: 0, y: 0, w: 1, h: 1, color: "bad" }] }, { cube: "body", face: "inside", color: "#000000", ops: [] }],
    });
    expect(v.default_color).toBe("#8a8a8a");
    expect(v.noise).toBe(1);
    expect(v.parts).toEqual([{ name: "body", color: "#aabbcc" }]);
    expect(v.faces).toEqual([{ cube: "body", face: "north", color: "", ops: [{ x: 0, y: 2, w: 1, h: 2, color: "#ffffff" }] }]);
    expect(() => validateAiSkin({ parts: [], faces: [] })).toThrow();
    expect(buildTask("skin", {})?.validate).toBe(validateAiSkin);
  });

  it("clips ops to the face", () => {
    expect(clipOps([{ x: 6, y: 6, w: 5, h: 5, color: "#fff" }, { x: 9, y: 0, w: 1, h: 1, color: "#fff" }], [8, 8])).toEqual([{ x: 6, y: 6, w: 2, h: 2, color: "#fff" }]);
  });
});
