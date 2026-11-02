import { describe, expect, it } from "vitest";
import { buildBlockModel, fitsOneBlock, partBlockId } from "../../lib/model3d/blockModel";
import { makeBone, makeCube } from "../../lib/model3d/geometry";
import { FACE_KEYS, type EntityModel, type FaceKey, type ModelFace, type Vec3 } from "../../lib/model3d/types";

function model(from: Vec3, to: Vec3, rotation: Vec3 = [0, 0, 0]): EntityModel {
  const bone = makeBone({ name: "block", origin: [0, 0, 0] });
  const faces = Object.fromEntries(FACE_KEYS.map((k) => [k, { uv: [0, 0, 16, 16], rotation: 0, enabled: true } satisfies ModelFace])) as Record<FaceKey, ModelFace>;
  return {
    textureWidth: 64, textureHeight: 64, texture: "custom/t.png", bones: [bone],
    cubes: [makeCube({ name: "c", bone: bone.id, from, to, boxUv: false, faces, rotation, origin: [0, 8, 0] })],
  };
}

describe("entity model → block model", () => {
  it("a full block becomes one 0..16 element with UVs in 16ths of the texture", () => {
    const m = model([-8, 0, -8], [8, 16, 8]);
    expect(fitsOneBlock(m)).toBe(true);
    const r = buildBlockModel(m, false);
    expect(r.parts).toHaveLength(1);
    const el = r.parts[0].elements[0] as { from: Vec3; to: Vec3; faces: Record<string, { uv: number[] }> };
    expect(el.from).toEqual([0, 0, 0]);
    expect(el.to).toEqual([16, 16, 16]);
    expect(el.faces.north.uv).toEqual([0, 0, 4, 4]);
    expect(r.parts[0].boxes).toEqual([[0, 0, 0, 16, 16, 16]]);
    expect(r.warnings).toEqual([]);
  });

  it("a two-block-wide model is cut into two parts; the cut faces disappear and the UVs split", () => {
    const m = model([-8, 0, -8], [24, 16, 8]);
    expect(fitsOneBlock(m)).toBe(false);
    const r = buildBlockModel(m, true);
    expect(r.size).toEqual([2, 1, 1]);
    expect(r.parts.map((p) => p.offset)).toEqual([[0, 0, 0], [1, 0, 0]]);
    const [a, b] = r.parts.map((p) => p.elements[0] as { from: Vec3; to: Vec3; faces: Record<string, { uv: number[] }> });
    expect(a.to).toEqual([16, 16, 16]);
    expect(b.from).toEqual([0, 0, 0]);
    expect(Object.keys(a.faces)).not.toContain("east");
    expect(Object.keys(b.faces)).not.toContain("west");
    // north is seen from the front: the right half of the face (x 0..16) is the u 8..16 half
    expect(a.faces.north.uv).toEqual([2, 0, 4, 4]);
    expect(b.faces.north.uv).toEqual([0, 0, 2, 4]);
    expect(partBlockId("big", [1, 0, -2])).toBe("big_p_1_0_m2");
    expect(partBlockId("big", [0, 0, 0])).toBe("big");
  });

  it("without multiblock only the first block is kept, with a warning", () => {
    const r = buildBlockModel(model([-8, 0, -8], [24, 16, 8]), false);
    expect(r.parts).toHaveLength(1);
    expect(r.warnings.join()).toMatch(/bigger than one block/);
  });

  it("rotations snap to block-model angles and the item model is scaled into one block", () => {
    const r = buildBlockModel(model([-8, 0, -8], [8, 48, 8], [0, 30, 0]), true);
    expect(r.size).toEqual([1, 3, 1]);
    const rotated = r.parts.flatMap((p) => p.elements) as { rotation?: { axis: string; angle: number } }[];
    expect(rotated).toHaveLength(1);
    expect(rotated[0].rotation).toMatchObject({ axis: "y", angle: 22.5 });
    expect(r.warnings.join()).toMatch(/snapped to 22.5/);
    const item = r.itemElements[0] as { from: Vec3; to: Vec3 };
    expect(item.to[1] - item.from[1]).toBeCloseTo(16);
  });
});

describe("custom block export", () => {
  it("writes one model + facing blockstate per part, the texture and a scaled item model", async () => {
    const JSZip = (await import("jszip")).default;
    const { writeCustomBlockFiles } = await import("../../lib/exportBundle");
    const zip = new JSZip();
    const m = model([-8, 0, -8], [8, 32, 8]);
    const block = { id: "pillar", displayName: "Pillar", texture: "", hardness: 1, resistance: 3, requiresTool: false, luminance: 0, soundType: "stone" as const, hasItem: true, creativeTab: "custom", model: "custom" as const, customModel: "m", multiblock: true };
    writeCustomBlockFiles(zip, "", "mymod", block, m, { "pack:custom/t.png": new Uint8Array([137, 80]) as unknown as Blob });
    const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir).sort();
    expect(files).toEqual([
      "assets/mymod/blockstates/pillar.json", "assets/mymod/blockstates/pillar_p_0_1_0.json",
      "assets/mymod/items/pillar.json",
      "assets/mymod/models/block/pillar.json", "assets/mymod/models/block/pillar_p_0_1_0.json",
      "assets/mymod/models/item/pillar.json",
      "assets/mymod/textures/block/pillar.png",
    ]);
    const state = JSON.parse(await zip.file("assets/mymod/blockstates/pillar_p_0_1_0.json")!.async("string"));
    expect(state.variants["facing=east"]).toEqual({ model: "mymod:block/pillar_p_0_1_0", y: 90 });
    const top = JSON.parse(await zip.file("assets/mymod/models/block/pillar_p_0_1_0.json")!.async("string"));
    expect(top.textures.tex).toBe("mymod:block/pillar");
    expect(top.elements[0].from).toEqual([0, 0, 0]);
    const item = JSON.parse(await zip.file("assets/mymod/models/item/pillar.json")!.async("string"));
    expect(item.elements[0].to[1] - item.elements[0].from[1]).toBeCloseTo(16);
  });
});
