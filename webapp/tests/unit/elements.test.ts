import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { DAMAGE_TYPE, ENCHANTMENT, BANNER_PATTERN, PAINTING, FUNCTION, FEATURE, mcfunctionBody } from "@/lib/elements/datapackKinds";
import { writeElementFiles } from "@/lib/elements/export";
import { normalizeElements } from "@/lib/elements/registry";
import type { ElementKindDef, ElementSpec } from "@/lib/elements/types";

const ctx = { modId: "mymod", mcVersion: "26.2" as const, texture: (k: string) => (k ? new Blob(["png"]) : undefined) };
const ctx1211 = { ...ctx, mcVersion: "1.21.1" as const };
const vctx = { modId: "mymod", mcVersion: "26.2" as const };
const make = (def: ElementKindDef, patch: Record<string, unknown> = {}): ElementSpec => ({ id: "thing", ...def.defaults(), ...patch });
const parse = (def: ElementKindDef, spec: ElementSpec, path: string) => {
  const f = def.files(spec, ctx).find((x) => x.path === path);
  expect(f, `missing ${path}`).toBeDefined();
  return JSON.parse(f!.content as string);
};

describe("damage type", () => {
  it("writes vanilla-shaped JSON with a namespaced message id, omitting defaults", () => {
    const body = parse(DAMAGE_TYPE, make(DAMAGE_TYPE), "data/mymod/damage_type/thing.json");
    expect(body).toEqual({ exhaustion: 0.1, message_id: "mymod.thing", scaling: "when_caused_by_living_non_player" });
  });
  it("adds death messages to lang and itself to the chosen damage tags", () => {
    const shared = DAMAGE_TYPE.shared!(make(DAMAGE_TYPE, { damageTags: ["bypasses_armor"] }), vctx);
    expect(shared.lang).toMatchObject({ "death.attack.mymod.thing": "%1$s was hurt badly", "death.attack.mymod.thing.player": "%1$s was hurt badly by %2$s" });
    expect(shared.tags).toEqual({ "data/minecraft/tags/damage_type/bypasses_armor.json": ["mymod:thing"] });
  });
});

describe("enchantment", () => {
  it("maps effects to vanilla effect components (like sharpness / swift_sneak)", () => {
    const spec = make(ENCHANTMENT, {
      effects: [
        { kind: "damage", base: 1, perLevel: 0.5 },
        { kind: "attribute", base: 0.15, perLevel: 0.15, attribute: "sneaking_speed", operation: "add_value" },
      ],
    });
    const body = parse(ENCHANTMENT, spec, "data/mymod/enchantment/thing.json");
    expect(body.effects["minecraft:damage"]).toEqual([{ effect: { type: "minecraft:add", value: { type: "minecraft:linear", base: 1, per_level_above_first: 0.5 } } }]);
    expect(body.effects["minecraft:attributes"][0]).toEqual({
      amount: { type: "minecraft:linear", base: 0.15, per_level_above_first: 0.15 },
      attribute: "minecraft:sneaking_speed", id: "mymod:enchantment.thing.1", operation: "add_value",
    });
    expect(body.supported_items).toBe("#minecraft:enchantable/sharp_weapon");
    expect(body.description).toEqual({ translate: "enchantment.mymod.thing" });
  });
  it("non-treasure enchantments join the enchanting table via non_treasure only", () => {
    expect(ENCHANTMENT.shared!(make(ENCHANTMENT), vctx).tags).toEqual({ "data/minecraft/tags/enchantment/non_treasure.json": ["mymod:thing"] });
    const treasure = ENCHANTMENT.shared!(make(ENCHANTMENT, { treasure: true }), vctx).tags!;
    expect(Object.keys(treasure).sort()).toEqual([
      "data/minecraft/tags/enchantment/on_random_loot.json", "data/minecraft/tags/enchantment/tradeable.json", "data/minecraft/tags/enchantment/treasure.json",
    ]);
  });
});

describe("banner pattern & painting", () => {
  it("bundles banner + shield textures (shield falls back to banner) and 16 dye-colour names", () => {
    const spec = make(BANNER_PATTERN, { name: "Skull", texture: "custom/skull.png" });
    expect(BANNER_PATTERN.files(spec, ctx).map((f) => f.path)).toEqual([
      "data/mymod/banner_pattern/thing.json", "assets/mymod/textures/entity/banner/thing.png", "assets/mymod/textures/entity/shield/thing.png",
    ]);
    const lang = BANNER_PATTERN.shared!(spec, vctx).lang!;
    expect(Object.keys(lang)).toHaveLength(16);
    expect(lang["block.mymod.banner.thing.light_blue"]).toBe("Light Blue Skull");
  });
  it("painting variant matches vanilla's kebab.json shape", () => {
    const body = parse(PAINTING, make(PAINTING, { name: "Sunset", author: "Me", width: 2, height: 1, texture: "custom/p.png" }), "data/mymod/painting_variant/thing.json");
    expect(body).toEqual({
      asset_id: "mymod:thing", author: { color: "gray", translate: "painting.mymod.thing.author" },
      height: 1, title: { color: "yellow", translate: "painting.mymod.thing.title" }, width: 2,
    });
  });
});

describe("function", () => {
  it("strips leading slashes and registers load/tick tags", () => {
    expect(mcfunctionBody("/say hi\n  /give @s stone\n# note")).toBe("say hi\n  give @s stone\n# note\n");
    const shared = FUNCTION.shared!(make(FUNCTION, { runOnLoad: true, runEveryTick: true }), vctx);
    expect(shared.tags).toEqual({
      "data/minecraft/tags/function/load.json": ["mymod:thing"], "data/minecraft/tags/function/tick.json": ["mymod:thing"],
    });
  });
});

describe("feature (ore)", () => {
  it("writes configured + placed feature and a NeoForge add_features biome modifier", () => {
    const spec = make(FEATURE, { block: "mymod:ruby_ore", deepslateBlock: "mymod:deepslate_ruby_ore", count: 2, minY: -64, maxY: -4, airExposureDiscard: 0.5 });
    const configured = parse(FEATURE, spec, "data/mymod/worldgen/configured_feature/thing.json");
    expect(configured.config.targets).toEqual([
      { state: { Name: "mymod:ruby_ore" }, target: { predicate_type: "minecraft:tag_match", tag: "minecraft:stone_ore_replaceables" } },
      { state: { Name: "mymod:deepslate_ruby_ore" }, target: { predicate_type: "minecraft:tag_match", tag: "minecraft:deepslate_ore_replaceables" } },
    ]);
    const placed = parse(FEATURE, spec, "data/mymod/worldgen/placed_feature/thing.json");
    expect(placed.placement[0]).toEqual({ type: "minecraft:count", count: 2 });
    expect(placed.placement[2].height).toEqual({ type: "minecraft:uniform", max_inclusive: { absolute: -4 }, min_inclusive: { absolute: -64 } });
    expect(parse(FEATURE, spec, "data/mymod/neoforge/biome_modifier/thing.json")).toEqual({
      type: "neoforge:add_features", biomes: "#minecraft:is_overworld", features: "mymod:thing", step: "underground_ores",
    });
  });
});

describe("writeElementFiles", () => {
  it("merges lang and tag contributions across elements", async () => {
    const zip = new JSZip();
    writeElementFiles(zip, "", {
      function: [make(FUNCTION, { id: "a", runOnLoad: true }), make(FUNCTION, { id: "b", runOnLoad: true })],
      enchantment: [make(ENCHANTMENT, { id: "zap", name: "Zap" })],
    }, ctx);
    expect(JSON.parse(await zip.file("data/minecraft/tags/function/load.json")!.async("string"))).toEqual({ replace: false, values: ["mymod:a", "mymod:b"] });
    expect(JSON.parse(await zip.file("assets/mymod/lang/en_us.json")!.async("string"))).toEqual({ "enchantment.mymod.zap": "Zap" });
    expect(zip.file("data/mymod/function/a.mcfunction")).not.toBeNull();
  });
});

describe("normalizeElements", () => {
  it("drops unknown kinds and id-less entries, fills missing fields from defaults", () => {
    const out = normalizeElements({ nope: [{ id: "x" }], painting: [{ id: "p" }, { name: "no id" }, null] });
    expect(Object.keys(out)).toEqual(["painting"]);
    expect(out.painting).toHaveLength(1);
    expect(out.painting[0]).toMatchObject({ id: "p", width: 1, height: 1, placeable: true });
  });
});

describe("Minecraft 1.21.1 target", () => {
  it("uses generic./player. attribute ids and maps melee_weapon to 1.21.1's sword tag", () => {
    const spec = make(ENCHANTMENT, {
      supportedItems: "melee_weapon",
      effects: [
        { kind: "attribute", base: 1, perLevel: 1, attribute: "sneaking_speed", operation: "add_value" },
        { kind: "attribute", base: 1, perLevel: 1, attribute: "movement_speed", operation: "add_value" },
      ],
    });
    const body = JSON.parse(ENCHANTMENT.files(spec, ctx1211)[0].content as string);
    expect(body.effects["minecraft:attributes"].map((a: { attribute: string }) => a.attribute)).toEqual([
      "minecraft:player.sneaking_speed", "minecraft:generic.movement_speed",
    ]);
    expect(body.supported_items).toBe("#minecraft:enchantable/sword");
    expect(ENCHANTMENT.validate!(make(ENCHANTMENT, { supportedItems: "sweeping" }), { modId: "mymod", mcVersion: "1.21.1" }))
      .toContain('"Sweeping" doesn\'t exist in Minecraft 1.21.1 — pick another item group.');
  });
  it("writes 1.21.1's painting variant shape (no title/author components)", () => {
    const body = JSON.parse(PAINTING.files(make(PAINTING, { author: "Me", texture: "custom/p.png" }), ctx1211)[0].content as string);
    expect(body).toEqual({ asset_id: "mymod:thing", height: 1, width: 1 });
  });
});
