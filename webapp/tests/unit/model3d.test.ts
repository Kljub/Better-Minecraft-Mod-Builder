import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { boxUvRects, faceVertexUvs, makeBone, makeCube, translateBone } from "@/lib/model3d/geometry";
import { toBedrockGeo, fromBedrockGeo, toBbmodel, fromBbmodel, toJavaModel } from "@/lib/model3d/codecs";
import type { EntityModel } from "@/lib/model3d/types";

/** Vanilla humanoid head + body, authored the way Blockbench stores them (absolute, Y up). */
function humanoid(): EntityModel {
  const head = makeBone({ name: "head", origin: [0, 24, 0] });
  const body = makeBone({ name: "body", origin: [0, 24, 0] });
  const arm = makeBone({ name: "right_arm", origin: [-5, 22, 0], rotation: [10, 0, 0], parent: body.id });
  return {
    textureWidth: 64, textureHeight: 64, texture: "",
    bones: [head, body, arm],
    cubes: [
      makeCube({ name: "head", bone: head.id, from: [-4, 24, -4], to: [4, 32, 4], uvOffset: [0, 0] }),
      makeCube({ name: "body", bone: body.id, from: [-4, 12, -2], to: [4, 24, 2], uvOffset: [16, 16] }),
      makeCube({ name: "arm", bone: arm.id, from: [-8, 12, -2], to: [-4, 24, 2], uvOffset: [40, 16] }),
    ],
  };
}

describe("box UV", () => {
  it("lays out faces like vanilla ModelPart.Cube (head at 0,0: 8x8x8)", () => {
    const r = boxUvRects([8, 8, 8], [0, 0], false);
    expect(r.east).toEqual([0, 8, 8, 16]);
    expect(r.north).toEqual([8, 8, 16, 16]);
    expect(r.west).toEqual([16, 8, 24, 16]);
    expect(r.south).toEqual([24, 8, 32, 16]);
    expect(r.up).toEqual([16, 8, 8, 0]);
    expect(r.down).toEqual([24, 0, 16, 8]);
  });
  it("mirror flips every face and swaps east/west", () => {
    const r = boxUvRects([4, 12, 4], [40, 16], true);
    expect(r.east).toEqual([52, 20, 48, 32]);
    expect(r.west).toEqual([44, 20, 40, 32]);
  });
  it("face rotation rotates the vertex UVs like Blockbench", () => {
    const base = faceVertexUvs([0, 0, 16, 16], 0, 16, 16, false);
    const rot = faceVertexUvs([0, 0, 16, 16], 90, 16, 16, false);
    expect(rot).toEqual([base[2], base[0], base[3], base[1]]);
  });
});

describe("Java export", () => {
  it("reproduces vanilla's humanoid head/body boxes and arm pose", () => {
    const java = toJavaModel(humanoid(), { className: "TestModel", modId: "mymod", layer: "test", mcVersion: "26.2" });
    expect(java).toContain(`.addBox(-4.0F, -8.0F, -4.0F, 8.0F, 8.0F, 8.0F, new CubeDeformation(0.0F))`);
    expect(java).toContain(`PartDefinition head = partdefinition.addOrReplaceChild("head", CubeListBuilder.create()`);
    expect(java).toContain(`.texOffs(16, 16).addBox(-4.0F, 0.0F, -2.0F, 8.0F, 12.0F, 4.0F`);
    expect(java).toContain(`PartPose.offset(0.0F, 0.0F, 0.0F)`);
    // arm: pivot relative to body (-5,-2,0) -> x negated, y negated
    expect(java).toContain(`PartPose.offsetAndRotation(5.0F, 2.0F, 0.0F, -0.1745F, 0.0F, 0.0F)`);
    expect(java).toContain("extends EntityModel<LivingEntityRenderState>");
    fs.mkdirSync("/tmp/claude-1000/javacheck", { recursive: true });
    fs.writeFileSync("/tmp/claude-1000/javacheck/TestModel.java", java);
  });
  it("targets the 1.21.1 API when asked", () => {
    const java = toJavaModel(humanoid(), { className: "TestModel", modId: "mymod", layer: "test", mcVersion: "1.21.1" });
    expect(java).toContain("public class TestModel<T extends Entity> extends EntityModel<T>");
    expect(java).toContain("ResourceLocation.fromNamespaceAndPath(\"mymod\", \"test\")");
    expect(java).toContain("public void renderToBuffer(PoseStack poseStack, VertexConsumer vertexConsumer, int packedLight, int packedOverlay, int color)");
    expect(java).toContain("head.render(poseStack, vertexConsumer, packedLight, packedOverlay, color);");
    expect(java).not.toContain("super(root)");
  });
  it("wraps rotated cubes in their own child part", () => {
    const m = humanoid();
    m.cubes[0] = { ...m.cubes[0], rotation: [0, 45, 0], origin: [0, 28, 0] };
    const java = toJavaModel(m, { className: "T", modId: "m", layer: "t", mcVersion: "26.2" });
    expect(java).toContain(`PartDefinition head_r = head.addOrReplaceChild("head_r"`);
    expect(java).toContain(`PartPose.offsetAndRotation(0.0F, -4.0F, 0.0F, 0.0F, -0.7854F, 0.0F)`);
  });
});

describe("Bedrock / GeckoLib geometry", () => {
  it("negates X like Blockbench and round-trips", () => {
    const geo = toBedrockGeo(humanoid(), { identifier: "test" }) as { "minecraft:geometry": { bones: Record<string, unknown>[] }[] };
    const bones = geo["minecraft:geometry"][0].bones;
    const arm = bones.find((b) => b.name === "right_arm")!;
    expect(arm.pivot).toEqual([5, 22, 0]);
    expect(arm.rotation).toEqual([-10, 0, 0]);
    expect(arm.parent).toBe("body");
    expect((arm.cubes as Record<string, unknown>[])[0]).toEqual({ origin: [4, 12, -2], size: [4, 12, 4], uv: [40, 16] });

    const back = fromBedrockGeo(geo).model;
    const orig = humanoid();
    expect(back.cubes.map((c) => [c.from, c.to, c.uvOffset])).toEqual(orig.cubes.map((c) => [c.from, c.to, c.uvOffset]));
    expect(back.bones.map((b) => [b.name, b.origin, b.rotation])).toEqual(orig.bones.map((b) => [b.name, b.origin, b.rotation]));
  });
  it("flips up/down per-face UVs like Blockbench", () => {
    const m = humanoid();
    m.cubes[0] = { ...m.cubes[0], boxUv: false, faces: { ...m.cubes[0].faces, up: { uv: [8, 0, 16, 8], rotation: 0, enabled: true } } };
    const geo = toBedrockGeo(m, { identifier: "t" }) as { "minecraft:geometry": { bones: { cubes?: { uv: Record<string, { uv: number[]; uv_size: number[] }> }[] }[] }[] };
    const up = geo["minecraft:geometry"][0].bones[0].cubes![0].uv.up;
    expect(up).toEqual({ uv: [16, 8], uv_size: [-8, -8] });
    expect(fromBedrockGeo(geo).model.cubes[0].faces.up.uv).toEqual([8, 0, 16, 8]);
  });
});

describe(".bbmodel", () => {
  it("round-trips hierarchy, transforms and UV", () => {
    const m = translateBone(humanoid(), humanoid().bones[0].id, [0, 0, 0]);
    const bb = toBbmodel(m, { name: "test", format: "bedrock" });
    const back = fromBbmodel(JSON.parse(JSON.stringify(bb)));
    expect(back.model.bones.map((b) => b.name)).toEqual(["head", "body", "right_arm"]);
    const arm = back.model.bones.find((b) => b.name === "right_arm")!;
    expect(back.model.bones.find((b) => b.id === arm.parent)?.name).toBe("body");
    const rows = (cs: typeof m.cubes) => cs.map((c) => [c.name, c.from, c.to, c.uvOffset]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect(rows(back.model.cubes)).toEqual(rows(m.cubes));
  });
  it("reads Blockbench 5 files (groups stored separately, outliner by uuid)", () => {
    const file = {
      meta: { format_version: "5.0", model_format: "bedrock", box_uv: true },
      resolution: { width: 32, height: 32 },
      elements: [{ type: "cube", uuid: "c1", name: "c", from: [0, 0, 0], to: [2, 2, 2], origin: [0, 0, 0], uv_offset: [4, 4], box_uv: true, faces: {} }],
      groups: [{ uuid: "g1", name: "root", origin: [1, 2, 3], rotation: [0, 0, 0] }],
      outliner: [{ uuid: "g1", children: ["c1"] }],
    };
    const { model } = fromBbmodel(file);
    expect(model.bones).toHaveLength(1);
    expect(model.bones[0]).toMatchObject({ name: "root", origin: [1, 2, 3] });
    expect(model.cubes[0]).toMatchObject({ bone: model.bones[0].id, uvOffset: [4, 4], to: [2, 2, 2] });
  });
});

import { copySelection, pasteClipboard, deleteSelection } from "@/lib/model3d/edit";

describe("copy / paste", () => {
  it("copies a bone subtree and pastes it with fresh ids and unique names", () => {
    const m = humanoid();
    const body = m.bones.find((b) => b.name === "body")!;
    expect(copySelection(m, { type: "bone", id: body.id })).toBe(true);
    const { model: pasted, selection } = pasteClipboard(m, null);
    expect(pasted.bones.map((b) => b.name)).toEqual(["head", "body", "right_arm", "body2", "right_arm2"]);
    const newBody = pasted.bones.find((b) => b.id === selection?.id)!;
    expect(newBody.name).toBe("body2");
    expect(pasted.bones.find((b) => b.name === "right_arm2")!.parent).toBe(newBody.id);
    expect(pasted.cubes).toHaveLength(5);
    // deleting the copy leaves the original intact
    expect(deleteSelection(pasted, selection).cubes).toHaveLength(3);
  });
});
