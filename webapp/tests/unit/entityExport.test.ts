import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { ENTITY_MODEL } from "@/lib/elements/modelKind";
import { javaLootTable, deathDrops } from "@/lib/elements/entitySettings";
import { spawnEggPng, encodePng } from "@/lib/png";
import { makeBone, makeCube } from "@/lib/model3d/geometry";
import { makeAnimation, setKeyframe } from "@/lib/model3d/animation";
import type { ElementSpec } from "@/lib/elements/types";

function spec(entity: Record<string, unknown> = {}): ElementSpec {
  const body = makeBone({ name: "body", origin: [0, 24, 0] });
  let walk = makeAnimation("walk");
  walk = setKeyframe(walk, body.id, "rotation", 0, [10, 0, 0]);
  return {
    id: "gnawer", textureWidth: 64, textureHeight: 32, texture: "custom/gnawer.png",
    bones: [body], cubes: [makeCube({ bone: body.id, from: [-4, 12, -2], to: [4, 24, 2], uvOffset: [16, 16] })],
    animations: [walk],
    entity: { displayName: "Rail Gnawer", behavior: "hostile_melee", mobCategory: "monster", walkAnimation: "walk", naturalSpawn: true, spawnWeight: 7, spawnMin: 1, spawnMax: 2, ...entity },
  };
}
const ctx = { modId: "mymod", mcVersion: "26.2" as const, texture: (k: string) => (k ? new Blob(["png"]) : undefined) };

describe("entity export", () => {
  it("writes a manifest entry whose keys match neoforge-runtime's EntitySpec.java", () => {
    const entry = ENTITY_MODEL.shared!(spec(), { modId: "mymod", mcVersion: "26.2" }).manifest!.entities as Record<string, unknown>;
    const java = fs.readFileSync("../neoforge-runtime/src/main/java/sheepfromheaven/screenspec/runtime/entity/EntitySpec.java", "utf8");
    const javaFields = new Set([...java.matchAll(/public (?:[\w<>.]+) (\w+)(?: =|;)/g)].map((m) => m[1]));
    for (const key of Object.keys(entry)) expect(javaFields, `EntitySpec.java lacks field "${key}"`).toContain(key);
    expect(entry).toMatchObject({ id: "gnawer", displayName: "Rail Gnawer", texture: "textures/entity/gnawer.png", behavior: "hostile_melee", mobCategory: "monster", walkAnimation: "walk" });
    const parts = entry.parts as { name: string; pose: { y: number }; cubes: { x: number; y: number; w: number }[] }[];
    expect(parts[0]).toMatchObject({ name: "body", pose: { y: 0 } });
    expect(parts[0].cubes[0]).toMatchObject({ x: -4, y: 0, w: 8 });
    const anims = entry.animations as { name: string; channels: { bone: string; target: string; keyframes: { x: number }[] }[] }[];
    expect(anims[0].channels[0]).toMatchObject({ bone: "body", target: "rotation" });
    expect(anims[0].channels[0].keyframes[0].x).toBe(-10);
  });

  it("exports texture, spawn egg item and the natural-spawn biome modifier", () => {
    const files = ENTITY_MODEL.files(spec(), ctx);
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining([
      "assets/mymod/textures/entity/gnawer.png",
      "assets/mymod/models/item/gnawer_spawn_egg.json",
      "assets/mymod/items/gnawer_spawn_egg.json",
      "assets/mymod/textures/item/gnawer_spawn_egg.png",
      "data/mymod/neoforge/biome_modifier/gnawer_spawns.json",
    ]));
    const spawns = JSON.parse(files.find((f) => f.path.endsWith("_spawns.json"))!.content as string);
    expect(spawns).toEqual({ type: "neoforge:add_spawns", biomes: "#minecraft:is_overworld", spawners: { type: "mymod:gnawer", weight: 7, minCount: 1, maxCount: 2 } });
    expect(ENTITY_MODEL.files(spec(), { ...ctx, mcVersion: "1.21.1" }).map((f) => f.path)).not.toContain("assets/mymod/items/gnawer_spawn_egg.json");
    const lang = ENTITY_MODEL.shared!(spec(), { modId: "mymod", mcVersion: "26.2" }).lang!;
    expect(lang).toEqual({ "entity.mymod.gnawer": "Rail Gnawer", "item.mymod.gnawer_spawn_egg": "Rail Gnawer Spawn Egg" });
  });

  it("flags animations referenced in settings that don't exist", () => {
    expect(ENTITY_MODEL.validate!(spec({ idleAnimation: "nope" }), { modId: "mymod", mcVersion: "26.2" })).toContain('Settings → Idle animation "nope" doesn\'t exist.');
  });
});

describe("PNG encoder", () => {
  it("produces a valid PNG (signature, IHDR, IEND) for the spawn egg", () => {
    const png = spawnEggPng("#ff0000", "#00ff00");
    expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(Buffer.from(png.slice(12, 16)).toString()).toBe("IHDR");
    expect(Buffer.from(png.slice(png.length - 8, png.length - 4)).toString()).toBe("IEND");
    fs.writeFileSync("/tmp/claude-1000/egg.png", png);
    fs.writeFileSync("/tmp/claude-1000/blank.png", encodePng(2, 2, new Uint8Array(16).fill(255)));
  });
  it("exports death drops as the entity's loot table and hurt drops into the manifest", async () => {
    const s = spec({
      drops: [
        { item: "minecraft:bone", min: 0, max: 2, chance: 1, lootingBonus: 1, playerKillOnly: false, smeltWhenOnFire: false },
        { item: "minecraft:beef", min: 1, max: 1, chance: 0.5, lootingBonus: 0, playerKillOnly: true, smeltWhenOnFire: true },
        { item: "", min: 1, max: 1, chance: 1 },
      ],
      hurtDrops: [{ item: "minecraft:feather", min: 1, max: 3, chance: 0.25, playerOnly: true }],
    });
    const files = await ENTITY_MODEL.files!(s, ctx);
    const loot = files.find((f) => f.path === "data/mymod/loot_table/entities/gnawer.json");
    const table = JSON.parse(loot!.content as string);
    expect(table.type).toBe("minecraft:entity");
    expect(table.pools).toHaveLength(2);
    expect(table.pools[0].entries[0]).toMatchObject({ type: "minecraft:item", name: "minecraft:bone" });
    expect(table.pools[0].entries[0].functions.map((f: { function: string }) => f.function)).toEqual(["minecraft:set_count", "minecraft:enchanted_count_increase"]);
    expect(table.pools[0].conditions).toBeUndefined();
    expect(table.pools[1].conditions).toEqual([{ condition: "minecraft:killed_by_player" }, { condition: "minecraft:random_chance", chance: 0.5 }]);
    expect(table.pools[1].entries[0].functions[1]).toMatchObject({ function: "minecraft:furnace_smelt", conditions: [{ predicate: { "minecraft:flags": { is_on_fire: true } } }] });
    // 1.21.1 writes the older predicate form.
    expect(JSON.stringify(javaLootTable(deathDrops(s.entity as Record<string, unknown>), "mymod", "gnawer", "1.21.1"))).toContain('"flags":{"is_on_fire":true}');

    const entry = ENTITY_MODEL.shared!(s, { modId: "mymod", mcVersion: "26.2" }).manifest!.entities as Record<string, unknown>;
    expect(entry.hurtDrops).toEqual([{ item: "minecraft:feather", min: 1, max: 3, chance: 0.25, playerOnly: true }]);
  });
});
