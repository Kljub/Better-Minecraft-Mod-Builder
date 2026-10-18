import { describe, it, expect } from "vitest";
import { VANILLA_MOBS, mobGeometryJson, parseBedrockJson, decodeTga, findGeometry, vanillaLabel } from "@/lib/model3d/vanillaImport";
import { fromBedrockGeo } from "@/lib/model3d/codecs";

const cube = (origin: number[], size: number[], uv = [0, 0]) => ({ origin, size, uv });

describe("vanilla mob import", () => {
  it("indexes the common mobs", () => {
    for (const id of ["zombie", "iron_golem", "creeper", "skeleton", "cow", "pig", "spider", "enderman"]) expect(VANILLA_MOBS.map((m) => m.id)).toContain(id);
    expect(vanillaLabel("iron_golem")).toBe("Iron Golem");
  });

  it("reads legacy files with comments and resolves inheritance (child bones replace the parent's)", () => {
    const file = parseBedrockJson(`// comment line
    {
      "format_version": "1.8.0",
      "geometry.base": { "texturewidth": 64, "textureheight": 32, "bones": [
        { "name": "body", "pivot": [0, 24, 0], "cubes": [${JSON.stringify(cube([-4, 12, -2], [8, 12, 4]))}] },
        { "name": "head", "pivot": [0, 24, 0], "cubes": [${JSON.stringify(cube([-4, 24, -4], [8, 8, 8]))}] } ] },
      "geometry.child:geometry.base": { "bones": [
        { "name": "head", "pivot": [0, 24, 0], "cubes": [${JSON.stringify(cube([-5, 24, -5], [10, 10, 10]))}] },
        { "name": "horn", "parent": "head", "pivot": [0, 32, 0], "cubes": [${JSON.stringify(cube([-1, 32, -1], [2, 4, 2]))}] } ] }
    }`);
    expect(findGeometry(file, "geometry.child")?.legacy).toBe(true);
    const json = mobGeometryJson({ id: "child", geo: "a.geo.json", geometry: "geometry.child", texture: "t.png", parent: { geo: "a.geo.json", geometry: "geometry.base" } }, { "a.geo.json": file });
    const { model } = fromBedrockGeo(json);
    expect(model.bones.map((b) => b.name).sort()).toEqual(["body", "head", "horn"]);
    expect(model.cubes).toHaveLength(3);
    expect(model.textureWidth).toBe(64);
  });

  it("reads 1.12+ files", () => {
    const file = { format_version: "1.12.0", "minecraft:geometry": [{ description: { identifier: "geometry.golem", texture_width: 128, texture_height: 128 }, bones: [{ name: "body", pivot: [0, 31, 0], cubes: [cube([-9, 21, -6], [18, 12, 11])] }] }] };
    const { model } = fromBedrockGeo(mobGeometryJson({ id: "golem", geo: "g.json", geometry: "geometry.golem", texture: "t.png" }, { "g.json": file }));
    expect(model.textureWidth).toBe(128);
    expect(model.cubes).toHaveLength(1);
  });

  it("decodes uncompressed and RLE TGA, bottom-up rows", () => {
    // 2x1, 32-bit BGRA: red, then semi-transparent blue; origin bottom-left (descriptor 8 alpha bits, no top flag)
    const header = (type: number, w: number, h: number) => [0, 0, type, 0, 0, 0, 0, 0, 0, 0, 0, 0, w, 0, h, 0, 32, 8];
    const raw = new Uint8Array([...header(2, 2, 1), 0, 0, 255, 255, 255, 0, 0, 128]);
    expect(Array.from(decodeTga(raw).data)).toEqual([255, 0, 0, 255, 0, 0, 255, 128]);
    // 1x2 RLE: one run of 2 green pixels; bottom-up → same rows either way
    const rle = new Uint8Array([...header(10, 1, 2), 0x81, 0, 255, 0, 255]);
    expect(Array.from(decodeTga(rle).data)).toEqual([0, 255, 0, 255, 0, 255, 0, 255]);
    // 1x2 raw bottom-up: first stored row is the bottom one
    const flip = new Uint8Array([...header(2, 1, 2), 0, 0, 255, 255, 255, 0, 0, 255]);
    expect(Array.from(decodeTga(flip).data)).toEqual([0, 0, 255, 255, 255, 0, 0, 255]);
  });
});
