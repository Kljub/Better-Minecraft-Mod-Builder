import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { templateModel, packUv, mirrorTarget, deleteTargets, editTarget, addCubes, generateAnimation, findBone, findCube, describeModel } from "@/lib/model3d/aiOps";
import { cubeSize } from "@/lib/model3d/geometry";
import { javaParts } from "@/lib/model3d/codecs";

describe("AI model ops", () => {
  it("humanoid template matches vanilla part placement in Java space", () => {
    const parts = javaParts(templateModel("humanoid"));
    const arm = parts.find((p) => p.name === "left_arm")!;
    expect(arm.pose).toMatchObject({ x: 5, y: 2, z: 0 }); // vanilla HumanoidModel left_arm offset(5, 2, 0)
    expect(arm.cubes[0]).toMatchObject({ x: -1, y: -2, z: -2, w: 4, h: 12, d: 4 }); // addBox(-1, -2, -2, 4, 12, 4)
  });

  it("pack_uv lays out box UVs without overlaps in a power-of-two texture", () => {
    let m = templateModel("quadruped");
    m = addCubes(m, [{ name: "horn", bone: "head", from: [-1, 24, -14], size: [2, 4, 2] }, { name: "tail", bone: "body", from: [-1, 18, 10], size: [2, 2, 8] }]);
    const p = packUv(m);
    expect([16, 32, 64, 128, 256]).toContain(p.textureWidth);
    const rects = p.cubes.map((c) => {
      const [w, h, d] = cubeSize(c).map(Math.floor);
      return { x0: c.uvOffset[0], y0: c.uvOffset[1], x1: c.uvOffset[0] + 2 * (w + d), y1: c.uvOffset[1] + d + h };
    });
    for (const r of rects) expect(r.x1 <= p.textureWidth && r.y1 <= p.textureHeight).toBe(true);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1, `UV overlap ${p.cubes[i].name}/${p.cubes[j].name}`).toBe(false);
    }
  });

  it("mirrors a bone subtree (bone wins over a same-named cube) with left/right swapped", () => {
    let m = templateModel("humanoid");
    m = deleteTargets(m, ["right_arm"]);
    expect(findBone(m, "right_arm")).toBeUndefined();
    m = mirrorTarget(m, "left_arm");
    const right = findBone(m, "right_arm")!;
    expect(right.origin).toEqual([5, 22, 0]);
    const cube = m.cubes.find((c) => c.bone === right.id)!;
    expect(cube.from).toEqual([4, 12, -2]);
    expect(cube.to).toEqual([8, 24, 2]);
    expect(cube.mirror).toBe(true);
  });

  it("bone:/cube: prefixes disambiguate", () => {
    const m = templateModel("humanoid");
    expect(findCube(m, "bone:head")).toBeUndefined();
    expect(findBone(m, "cube:head")).toBeUndefined();
    const moved = editTarget(m, "cube:head", { from: [-4, 25, -4] });
    expect(findCube(moved, "head")!.to).toEqual([4, 33, 4]);
    expect(() => editTarget(m, "head", { parent: "head" })).toThrow(/own child/);
  });

  it("generates a walk with legs in opposite phase", () => {
    const m = templateModel("humanoid");
    const walk = generateAnimation(m, "walk");
    const l = walk.bones[findBone(m, "left_leg")!.id].rotation[0].value[0];
    const r = walk.bones[findBone(m, "right_leg")!.id].rotation[0].value[0];
    expect(l).toBe(-r);
    expect(Math.abs(l)).toBeGreaterThan(20);
    expect(describeModel({ ...m, animations: [walk] }).animations).toHaveLength(1);
  });

  it("attacks towards the face (north, -Z), the same way the viewport renders it", () => {
    const m = templateModel("humanoid");
    const attack = generateAnimation(m, "attack");
    // Where a direction ends up after a keyframe rotation, applied like ModelViewport does (ZYX, degrees).
    const turn = (rot: number[], dir: [number, number, number]) =>
      new THREE.Vector3(...dir).applyEuler(new THREE.Euler(rot[0] * Math.PI / 180, rot[1] * Math.PI / 180, rot[2] * Math.PI / 180, "ZYX"));
    const peak = (bone: string) => attack.bones[findBone(m, bone)!.id].rotation.reduce((a, k) => (Math.abs(k.value[0]) > Math.abs(a.value[0]) ? k : a)).value;
    for (const arm of ["left_arm", "right_arm"]) expect(turn(peak(arm), [0, -1, 0]).z).toBeLessThan(-0.5); // hanging arm swings forward
    expect(turn(peak("head"), [0, 0, -1]).y).toBeLessThan(0); // head dips
    const lunge = attack.bones[findBone(m, "body")!.id].position.map((k) => k.value[2]);
    expect(Math.min(...lunge)).toBeLessThan(0); // body lunges forward
  });
});
