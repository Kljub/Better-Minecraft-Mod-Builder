import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { readSpecBundle, mergeSpecsById } from "@/lib/importBundle";

const attrs = [
  { id: "mod_speed", displayName: "Speed", defaultBase: 1, min: 0, max: 10, sentiment: "positive", addToAllLiving: false, addToPlayers: true },
  { id: "mod_luck", displayName: "Luck", defaultBase: 0, min: 0, max: 5, sentiment: "neutral", addToAllLiving: false, addToPlayers: false },
];

async function zipFile(files: Record<string, string | Uint8Array>, name = "export.zip"): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return new File([await zip.generateAsync({ type: "arraybuffer" })], name);
}

describe("readSpecBundle", () => {
  it("reads the root JSON of a per-category export zip", async () => {
    const file = await zipFile({
      "mod.attributes.json": JSON.stringify(attrs),
      "assets/mod/screenspec/attributes.json": JSON.stringify([{ id: "stale" }]),
    });
    const bundle = await readSpecBundle(file, "customAttributes");
    expect(bundle.specs.map((s) => s.id)).toEqual(["mod_speed", "mod_luck"]);
    expect(bundle.skipped).toBe(0);
  });

  it("wraps a single-entry export in a list", async () => {
    const file = await zipFile({ "mod_speed.json": JSON.stringify(attrs[0]) });
    const bundle = await readSpecBundle(file, "customAttributes");
    expect(bundle.specs).toEqual([attrs[0]]);
  });

  it("falls back to the runtime manifest when there is no root JSON", async () => {
    const file = await zipFile({ "assets/mod/screenspec/attributes.json": JSON.stringify(attrs) });
    const bundle = await readSpecBundle(file, "customAttributes");
    expect(bundle.specs).toHaveLength(2);
  });

  it("picks the requested category out of a full-project zip", async () => {
    const project = { name: "p", screens: [{ id: "s", widgets: [] }], customAttributes: attrs, items: [{ id: "sword" }] };
    const file = await zipFile({ "p/p.json": JSON.stringify(project) });
    expect((await readSpecBundle(file, "customAttributes")).specs).toHaveLength(2);
    expect((await readSpecBundle(file, "items")).specs.map((s) => s.id)).toEqual(["sword"]);
  });

  it("reads a plain .json file and drops entries without an id", async () => {
    const file = new File([JSON.stringify([...attrs, { displayName: "no id" }, 5])], "a.json");
    const bundle = await readSpecBundle(file, "customAttributes");
    expect(bundle.specs).toHaveLength(2);
    expect(bundle.skipped).toBe(2);
  });

  it("only returns textures the imported specs reference", async () => {
    const png = new Uint8Array([1, 2, 3]);
    const file = await zipFile({
      "mod.items.json": JSON.stringify([{ id: "sword", texture: "custom/sword.png" }]),
      "assets/mod/textures/custom/sword.png": png,
      "assets/mod/textures/custom/unused.png": png,
    });
    const bundle = await readSpecBundle(file, "items");
    expect(Object.keys(bundle.textures)).toEqual(["custom/sword.png"]);
  });

  it("rejects a zip without importable JSON", async () => {
    const file = await zipFile({ "readme.txt": "hi" });
    await expect(readSpecBundle(file, "items")).rejects.toThrow();
  });
});

describe("mergeSpecsById", () => {
  it("appends new ids and replaces known ones in place", () => {
    const existing = [{ id: "a", v: 1 }, { id: "b", v: 1 }];
    const result = mergeSpecsById(existing, [{ id: "b", v: 2 }, { id: "c", v: 2 }]);
    expect(result.list).toEqual([{ id: "a", v: 1 }, { id: "b", v: 2 }, { id: "c", v: 2 }]);
    expect(result).toMatchObject({ added: 1, updated: 1, firstIdx: 1 });
    expect(existing[1].v).toBe(1);
  });

  it("points firstIdx at the first appended entry when everything is new", () => {
    expect(mergeSpecsById([{ id: "a" }], [{ id: "x" }, { id: "y" }]).firstIdx).toBe(1);
  });

  it("returns firstIdx -1 for an empty import", () => {
    expect(mergeSpecsById([{ id: "a" }], []).firstIdx).toBe(-1);
  });
});
