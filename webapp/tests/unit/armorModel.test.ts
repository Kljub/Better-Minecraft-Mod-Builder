import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { armorTemplate, armorRuntimeModel, validateArmorModel, ARMOR_BONES } from "@/lib/model3d/armorModel";
import { toBedrockGeo } from "@/lib/model3d/codecs";

/** vanilla HumanoidModel pivots in Java model space — same table as ArmorModelsClient.ANCHORS */
const ANCHORS: Record<string, [number, number, number]> = {
  head: [0, 0, 0], body: [0, 0, 0], right_arm: [-5, 2, 0], left_arm: [5, 2, 0], right_leg: [-1.9, 12, 0], left_leg: [1.9, 12, 0],
};

describe("armor models", () => {
  it("template: every ArmorModelAPI bone, no problems except the missing texture", () => {
    const m = armorTemplate();
    expect(m.bones.map((b) => b.name).sort()).toEqual(Object.keys(ARMOR_BONES).sort());
    expect(validateArmorModel(m)).toEqual(["The 3D armor model has no texture."]);
    expect(validateArmorModel({ ...m, texture: "custom/a.png" })).toEqual([]);
  });

  it("template bones sit exactly on the vanilla skeleton in Java space", () => {
    const rt = armorRuntimeModel({ ...armorTemplate(), texture: "custom/a.png" }, "ruby");
    expect(rt.texture).toBe("textures/armor/ruby.png");
    for (const [name, { anchor, slot }] of Object.entries(rt.anchors)) {
      expect(slot).toBe(ARMOR_BONES[name].slot);
      const part = rt.parts.find((p) => p.name === name)!;
      if (name === "armorWaist") continue; // anchored to the body but pivots at the hips on purpose
      const [ax, ay, az] = ANCHORS[anchor];
      expect([part.pose.x - ax, part.pose.y - ay, part.pose.z - az].map((v) => Math.round(v * 100) / 100)).toEqual([0, 0, 0]);
    }
  });

  it("flags stray top-level bones and per-face UV", () => {
    const m = armorTemplate();
    const bad = { ...m, texture: "x", bones: [...m.bones, { ...m.bones[0], id: "b_x", name: "spike" }], cubes: m.cubes.map((c, i) => (i === 0 ? { ...c, boxUv: false } : c)) };
    const problems = validateArmorModel(bad);
    expect(problems.join(" ")).toMatch(/"spike"/);
    expect(problems.join(" ")).toMatch(/box UV only/);
  });

  it("geo.json uses ArmorModelAPI's bone names and Bedrock pivots", () => {
    const geo = toBedrockGeo(armorTemplate(), { identifier: "ruby" }) as { "minecraft:geometry": { bones: { name: string; pivot: number[] }[] }[] };
    const bones = geo["minecraft:geometry"][0].bones;
    expect(bones.find((b) => b.name === "armorRightArm")!.pivot).toEqual([-5, 22, 0]);
    expect(bones.find((b) => b.name === "armorHead")!.pivot).toEqual([0, 24, 0]);
  });

  it("runtime manifest keys exist in ArmorSpec.java", () => {
    const java = fs.readFileSync("../neoforge-runtime/src/main/java/sheepfromheaven/screenspec/runtime/armor/ArmorSpec.java", "utf8");
    for (const key of ["customModel", "texture", "textureWidth", "textureHeight", "parts", "anchors", "anchor", "slot"]) expect(java).toMatch(new RegExp(`public [\\w<>.,\\s]+ ${key}\\b`));
  });
});
