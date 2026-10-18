import { describe, expect, it } from "vitest";
import { describeMotion, holdItem, findBone, findCube } from "@/lib/model3d/aiOps";
import { makeAnimation, setKeyframe } from "@/lib/model3d/animation";
import { makeBone, makeCube } from "@/lib/model3d/geometry";
import type { EntityModel, ModelCube, Vec3 } from "@/lib/model3d/types";

function orc(): EntityModel {
  const body = makeBone({ name: "body", origin: [0, 24, 0] });
  const arm = makeBone({ name: "right_arm", parent: body.id, origin: [5, 22, 0] });
  const axe = makeBone({ name: "axe", origin: [20, 0, 20] });
  return {
    textureWidth: 64, textureHeight: 64, texture: "",
    bones: [body, arm, axe],
    cubes: [
      makeCube({ name: "body", bone: body.id, from: [-4, 12, -2], to: [4, 24, 2] }),
      makeCube({ name: "arm", bone: arm.id, from: [4, 12, -2], to: [8, 24, 2] }),
      // Floating somewhere: vertical handle with the axe head at its top.
      makeCube({ name: "handle", bone: axe.id, from: [20, 0, 20], to: [21, 20, 21] }),
      makeCube({ name: "blade", bone: axe.id, from: [21, 15, 19], to: [26, 20, 22] }),
    ],
  };
}
const inside = (c: ModelCube, p: Vec3) => [0, 1, 2].every((i) => p[i] >= Math.min(c.from[i], c.to[i]) - 1e-6 && p[i] <= Math.max(c.from[i], c.to[i]) + 1e-6);
const mid = (c: ModelCube, i: number) => (c.from[i] + c.to[i]) / 2;

describe("hold_item", () => {
  it("puts the grip into the hand, parents the item to the arm, head pointing forward", () => {
    const { model, hand } = holdItem(orc(), "axe", "right_arm", { direction: "forward" });
    expect(hand).toEqual([6, 13.5, 0]);
    const axe = findBone(model, "axe")!;
    expect(axe.parent).toBe(findBone(model, "right_arm")!.id);
    expect(axe.origin).toEqual(hand);
    const handle = findCube(model, "handle")!;
    const blade = findCube(model, "blade")!;
    expect(inside(handle, hand)).toBe(true);
    // Handle now runs along Z, the blade sits in front (-Z) of the hand.
    expect(Math.abs(handle.to[2] - handle.from[2])).toBe(20);
    expect(mid(blade, 2)).toBeLessThan(hand[2]);
  });

  it("staffs point up and keep their length", () => {
    const { model, hand } = holdItem(orc(), "axe", "right_arm", { direction: "up", grip: 0.35 });
    const handle = findCube(model, "handle")!;
    expect(Math.abs(handle.to[1] - handle.from[1])).toBe(20);
    expect(inside(handle, hand)).toBe(true);
    expect(mid(findCube(model, "blade")!, 1)).toBeGreaterThan(hand[1]);
    expect(Math.min(handle.from[1], handle.to[1])).toBeCloseTo(hand[1] - 7);
  });

  it("refuses an item that contains the arm", () => {
    expect(() => holdItem(orc(), "body", "right_arm")).toThrow(/part of the item/);
  });
});

describe("describeMotion", () => {
  const anim = (x: number) => setKeyframe(setKeyframe(makeAnimation("attack"), findBone(orc(), "right_arm")!.id, "rotation", 0, [0, 0, 0]), findBone(orc(), "right_arm")!.id, "rotation", 0.3, [x, 0, 0]);
  it("+X swings a hanging arm forward", () => {
    const m = orc();
    const lines = describeMotion(m, { ...anim(90), bones: Object.fromEntries(Object.entries(anim(90).bones).map(([, t]) => [findBone(m, "right_arm")!.id, t])) });
    expect(lines.join()).toMatch(/right_arm @0\.3s rotation \[90, 0, 0\]: its tip moves .*\d+px forward \(-Z/);
  });
  it("-X swings it backward", () => {
    const m = orc();
    const lines = describeMotion(m, { ...anim(-90), bones: Object.fromEntries(Object.entries(anim(-90).bones).map(([, t]) => [findBone(m, "right_arm")!.id, t])) });
    expect(lines.join()).toMatch(/tip moves .*\d+px backward \(\+Z\)/);
  });
});
