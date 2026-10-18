import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture what the export functions would download; no IndexedDB in Node.
const downloads: { name: string; blob: Blob }[] = [];
// (Uint8Array: JSZip in Node can't read Blobs)
vi.mock("@/lib/textureStore", () => ({ loadAllTextures: async () => ({ "pack:custom/ruby.png": new Uint8Array([137, 80, 78, 71]) }), saveTexture: async () => {} }));
vi.mock("@/lib/structureStore", () => ({ loadStructureFiles: async () => ({}) }));
vi.mock("@/lib/cloud/sync", () => ({ cloudPutFile: () => {}, cloudDeleteFile: () => {}, cloudPutSetting: () => {} }));

import { downloadExport } from "@/lib/exportBundle";
import { detectImport } from "@/lib/importDetect";
import { readSpecBundle, type ImportCategory } from "@/lib/importBundle";
import { ITEM_DEFAULT } from "@/lib/itemRegistry";
import { BLOCK_DEFAULT } from "@/lib/blockRegistry";
import { ARMOR_DEFAULT } from "@/lib/armorRegistry";
import { EFFECT_DEFAULT } from "@/lib/effectRegistry";
import { POTION_DEFAULT } from "@/lib/potionRegistry";
import { ACHIEVEMENT_DEFAULT } from "@/lib/achievementRegistry";
import { RECIPE_DEFAULT } from "@/lib/recipeRegistry";
import { TRADE_DEFAULT } from "@/lib/tradeRegistry";
import { LOOT_ENTRY_DEFAULT } from "@/lib/lootRegistry";
import { BIOME_DEFAULT } from "@/lib/biomeRegistry";
import { DIMENSION_DEFAULT } from "@/lib/dimensionRegistry";
import { defaultCustomAttribute } from "@/lib/itemRegistry";
import { ELEMENT_KINDS } from "@/lib/elements/registry";

// downloadBlob → capture instead of a browser download
let pending: Blob | null = null;
vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => { pending = b; return "blob:test"; }, revokeObjectURL: () => {} }));
vi.stubGlobal("document", { createElement: () => { const a = { href: "", download: "", click: () => { if (pending) downloads.push({ name: a.download, blob: pending }); } }; return a; } });

async function exportAndDetect(file: string, json: string, input: Parameters<typeof downloadExport>[2]) {
  downloads.length = 0;
  await downloadExport(file, json, input);
  const d = downloads[0];
  if (!d) throw new Error("nothing downloaded");
  return { name: d.name, detection: await detectImport(new File([await d.blob.arrayBuffer()], d.name)).catch((e: Error) => ({ target: `ERROR: ${e.message}`, reason: "" })) };
}

const legacy: [ImportCategory, Record<string, unknown>, string][] = [
  ["items", { ...ITEM_DEFAULT, id: "ruby", texture: "custom/ruby.png" }, "items"],
  ["blocks", { ...BLOCK_DEFAULT, id: "ruby_block", texture: "custom/ruby.png" }, "blocks"],
  ["armors", { ...ARMOR_DEFAULT, id: "ruby_armor" }, "armors"],
  ["effects", { ...EFFECT_DEFAULT, id: "glow_up" }, "effects"],
  ["potions", { ...POTION_DEFAULT, id: "elixir" }, "potions"],
  ["customAttributes", { ...defaultCustomAttribute("mana") }, "attributes"],
  ["achievements", { ...ACHIEVEMENT_DEFAULT, id: "first_ruby" }, "achievements"],
  ["recipes", { ...RECIPE_DEFAULT, id: "ruby_recipe" }, "recipes"],
  ["trades", { ...TRADE_DEFAULT, id: "ruby_trade" }, "trades"],
  ["lootEntries", { ...LOOT_ENTRY_DEFAULT, id: "ruby_loot" }, "loot"],
  ["biomes", { ...BIOME_DEFAULT, id: "ruby_fields" }, "biomes"],
  ["dimensions", { ...DIMENSION_DEFAULT, id: "ruby_world" }, "dimensions"],
];

describe("every export can be imported again", () => {
  beforeEach(() => { downloads.length = 0; });
  const results: string[] = [];

  for (const [category, spec, suffix] of legacy) {
    it(`${category}: single + export all`, async () => {
      const single = await exportAndDetect(`${spec.id}.json`, JSON.stringify(spec, null, 2), { [category]: [spec], modId: "mymod" } as never);
      const all = await exportAndDetect(`mymod.${suffix}.json`, JSON.stringify([spec], null, 2), { [category]: [spec], modId: "mymod" } as never);
      results.push(`${category}: single(${single.name}) -> ${single.detection.target}; all(${all.name}) -> ${all.detection.target}`);
      expect.soft(single.detection.target, `single ${category} (${single.name})`).toBe(category);
      expect.soft(all.detection.target, `export all ${category} (${all.name})`).toBe(category);
      if (all.detection.target === category) {
        const bundle = await readSpecBundle(new File([await downloads[0].blob.arrayBuffer()], downloads[0].name), category);
        expect.soft(bundle.specs.length, `${category} specs read back`).toBe(1);
      }
    });
  }

  for (const def of ELEMENT_KINDS.filter((d) => !d.standalone)) {
    it(`element ${def.kind}: single + export all`, async () => {
      const spec = { id: `${def.idPrefix}_1`, ...def.defaults() } as { id: string } & Record<string, unknown>;
      // the generated spawn-egg PNG is a Blob, which JSZip can't read in Node
      if (def.kind === "entityModel") spec.entity = { ...(spec.entity as object), spawnEgg: false };
      const single = await exportAndDetect(`${spec.id}.json`, JSON.stringify([spec], null, 2), { elements: { [def.kind]: [spec] }, modId: "mymod", mcVersion: "26.2" });
      const all = await exportAndDetect(`mymod.${def.kind}.json`, JSON.stringify([spec], null, 2), { elements: { [def.kind]: [spec] }, modId: "mymod", mcVersion: "26.2" });
      expect.soft(single.detection.target, `single ${def.kind} (${single.name})`).toBe(`element:${def.kind}`);
      expect.soft(all.detection.target, `export all ${def.kind} (${all.name})`).toBe(`element:${def.kind}`);
    });
  }
});

describe("project export folders", () => {
  it("reads the category folders of a full-project export (zip and JSON)", async () => {
    const { readProjectFolders } = await import("@/lib/importBundle");
    const JSZip = (await import("jszip")).default;
    const project = { screens: [], items: [], elementFolders: { entityModel: ["Bosses", "  ", 3], "@items": ["Weapons"] } };
    const zip = new JSZip();
    zip.file("myproj/myproj.json", JSON.stringify(project));
    const blob = new Blob([await zip.generateAsync({ type: "uint8array" })]);
    expect(await readProjectFolders(blob)).toEqual({ entityModel: ["Bosses"], "@items": ["Weapons"] });
    expect(await readProjectFolders(new Blob([JSON.stringify(project)]))).toEqual({ entityModel: ["Bosses"], "@items": ["Weapons"] });
    expect(await readProjectFolders(new Blob([JSON.stringify({ screens: [] })]))).toEqual({});
  });
});
