import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildTexturesZip, textureFileName } from "@/lib/textureDownload";

describe("textureFileName", () => {
  it("strips the folder from a texture key", () => {
    expect(textureFileName("custom/ruby.png")).toBe("ruby.png");
    expect(textureFileName("plain.png")).toBe("plain.png");
  });
});

describe("buildTexturesZip", () => {
  it("lays textures out like the export zips", async () => {
    const png = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const zip = await JSZip.loadAsync(await (await buildTexturesZip([{ key: "custom/ruby.png", blob: png }, { key: "custom/gem.png", blob: png }], "mymod")).arrayBuffer());
    expect(Object.keys(zip.files).filter((p) => !zip.files[p].dir).sort()).toEqual([
      "assets/mymod/textures/custom/gem.png",
      "assets/mymod/textures/custom/ruby.png",
    ]);
    expect(Array.from(await zip.file("assets/mymod/textures/custom/ruby.png")!.async("uint8array"))).toEqual([1, 2, 3]);
  });
});
