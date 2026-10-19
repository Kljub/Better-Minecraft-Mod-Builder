import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { writeChestBlockFiles } from "@/lib/exportBundle";
import { chestQuads, isChestSkinKey } from "@/lib/chestModel";
import { BLOCK_DEFAULT } from "@/lib/blockRegistry";

describe("chest blocks", () => {
  it("exports the skin to the chests atlas folder and a chest special item model", async () => {
    const zip = new JSZip();
    const skin = new Uint8Array([1, 2, 3]) as unknown as Blob; // JSZip in node takes bytes
    writeChestBlockFiles(zip, "", "mymod", { ...BLOCK_DEFAULT, id: "ruby_chest", model: "chest", texture: "entity/chest/normal.png" }, { "pack:entity/chest/normal.png": skin });
    expect(zip.file("assets/mymod/textures/entity/chest/ruby_chest.png")).toBeTruthy();
    const item = JSON.parse(await zip.file("assets/mymod/items/ruby_chest.json")!.async("string"));
    expect(item.model).toEqual({ type: "minecraft:special", base: "mymod:item/ruby_chest", model: { type: "minecraft:chest", texture: "mymod:ruby_chest" } });
    const model = JSON.parse(await zip.file("assets/mymod/models/block/ruby_chest.json")!.async("string"));
    expect(model).toEqual({ textures: { particle: "mymod:block/ruby_chest_chest" } });
    expect(JSON.parse(await zip.file("assets/mymod/models/item/ruby_chest.json")!.async("string")).parent).toBe("minecraft:item/template_chest");
  });

  it("lays out UVs like vanilla ModelPart.Cube (bottom part, south face)", () => {
    // south face of the bottom box: u3..u4 = 42..56, v1..v2 = 33..43 (texOffs 0,19; 14×10×14)
    const south = chestQuads("bottom")[5];
    const us = south.map((v) => v.u * 64), vs = south.map((v) => v.v * 64);
    expect(Math.min(...us)).toBe(42); expect(Math.max(...us)).toBe(56);
    expect(Math.min(...vs)).toBe(33); expect(Math.max(...vs)).toBe(43);
    expect(south.every((v) => v.z === 15)).toBe(true);
  });

  it("recognizes chest skins by their pack path", () => {
    expect(isChestSkinKey("entity/chest/normal.png")).toBe(true);
    expect(isChestSkinKey("block/oak_planks.png")).toBe(false);
  });
});
