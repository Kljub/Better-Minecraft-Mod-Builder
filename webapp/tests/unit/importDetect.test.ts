import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { detectByShape, detectImport } from "../../lib/importDetect";
import { ITEM_DEFAULT } from "../../lib/itemRegistry";
import { BLOCK_DEFAULT } from "../../lib/blockRegistry";
import { ARMOR_DEFAULT } from "../../lib/armorRegistry";
import { EFFECT_DEFAULT } from "../../lib/effectRegistry";
import { POTION_DEFAULT } from "../../lib/potionRegistry";
import { ACHIEVEMENT_DEFAULT } from "../../lib/achievementRegistry";
import { RECIPE_DEFAULT } from "../../lib/recipeRegistry";
import { TRADE_DEFAULT } from "../../lib/tradeRegistry";
import { LOOT_ENTRY_DEFAULT } from "../../lib/lootRegistry";
import { BIOME_DEFAULT } from "../../lib/biomeRegistry";
import { DIMENSION_DEFAULT } from "../../lib/dimensionRegistry";
import { ELEMENT_KINDS } from "../../lib/elements/registry";

const BUILTIN: [string, object][] = [
  ["items", ITEM_DEFAULT], ["blocks", BLOCK_DEFAULT], ["armors", ARMOR_DEFAULT], ["effects", EFFECT_DEFAULT],
  ["potions", POTION_DEFAULT], ["achievements", ACHIEVEMENT_DEFAULT], ["recipes", RECIPE_DEFAULT], ["trades", TRADE_DEFAULT],
  ["lootEntries", LOOT_ENTRY_DEFAULT], ["biomes", BIOME_DEFAULT], ["dimensions", DIMENSION_DEFAULT],
];

const file = (name: string, content: BlobPart) => new File([content], name);

describe("detectByShape", () => {
  it.each(BUILTIN)("recognises %s by its fields", (target, defaults) => {
    expect(detectByShape([{ id: "x", ...defaults }])).toBe(target);
  });
  it.each(ELEMENT_KINDS.map((d) => [d.kind, d] as const))("recognises element kind %s", (kind, def) => {
    expect(detectByShape([{ id: "x", ...def.defaults() }])).toBe(`element:${kind}`);
  });
  it("gives up on unrelated JSON", () => {
    expect(detectByShape([{ id: "x", foo: 1, bar: 2 }])).toBeNull();
  });
});

describe("detectImport", () => {
  it("uses the export file name", async () => {
    expect((await detectImport(file("mymod.blocks.json", "[]"))).target).toBe("blocks");
  });
  it("detects a single block JSON by shape", async () => {
    expect((await detectImport(file("ruby_block.json", JSON.stringify({ id: "ruby_block", ...BLOCK_DEFAULT })))).target).toBe("blocks");
  });
  it("detects a single item export zip by shape", async () => {
    const zip = new JSZip();
    zip.file("ruby.json", JSON.stringify({ id: "ruby", ...ITEM_DEFAULT }));
    zip.file("assets/mymod/textures/item/ruby.png", "png");
    expect((await detectImport(file("ruby.zip", await zip.generateAsync({ type: "arraybuffer" })))).target).toBe("items");
  });
  it("detects a full project export", async () => {
    const zip = new JSZip();
    zip.file("mymod/mymod.json", JSON.stringify({ screens: [], items: [] }));
    expect((await detectImport(file("mymod.zip", await zip.generateAsync({ type: "arraybuffer" })))).target).toBe("project");
  });
  it("detects a screen", async () => {
    expect((await detectImport(file("main.json", JSON.stringify({ id: "main", width: 176, height: 166, widgets: [] })))).target).toBe("screens");
  });
});
