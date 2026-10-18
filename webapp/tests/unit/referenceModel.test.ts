import { describe, it, expect } from "vitest";
import { parseReferenceModel } from "@/lib/model3d/referenceModel";
import { toBbmodel } from "@/lib/model3d/codecs";
import { templateModel } from "@/lib/model3d/aiOps";

describe("reference models for the generator", () => {
  it("reads a .bbmodel with its embedded texture", () => {
    const bb = toBbmodel(templateModel("humanoid"), { name: "knight", format: "bedrock", textureDataUrl: "data:image/png;base64,iVBORw0KGgo=", textureName: "knight.png" });
    const ref = parseReferenceModel(JSON.stringify(bb), "knight.bbmodel");
    expect(ref.name).toBe("knight");
    expect(ref.cubes).toBeGreaterThan(5);
    expect(ref.textureDataUrl).toMatch(/^data:image\/png/);
    const summary = JSON.parse(ref.summary);
    expect(summary.bones.map((b: { name: string }) => b.name)).toContain("head");
  });

  it("reads a GeckoLib / Bedrock geo.json and rejects junk", () => {
    const geo = { format_version: "1.12.0", "minecraft:geometry": [{ description: { identifier: "geometry.blob", texture_width: 32, texture_height: 32 },
      bones: [{ name: "body", pivot: [0, 0, 0], cubes: [{ origin: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] }] }] }] };
    const ref = parseReferenceModel(JSON.stringify(geo), "blob.geo.json");
    expect(ref).toMatchObject({ name: "blob.geo", bones: 1, cubes: 1 });
    expect(ref.textureDataUrl).toBeUndefined();
    expect(() => parseReferenceModel("not json", "x.json")).toThrow(/JSON/);
  });
});
