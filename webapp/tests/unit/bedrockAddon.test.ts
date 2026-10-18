import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildBedrockAddon, behaviorEntity, clientEntity, spawnRules, stableUuid } from "@/lib/bedrockAddon";
import { makeBone, makeCube } from "@/lib/model3d/geometry";
import { makeAnimation, setKeyframe } from "@/lib/model3d/animation";
import type { ElementSpec } from "@/lib/elements/types";

function spec(entity: Record<string, unknown> = {}): ElementSpec {
  const body = makeBone({ name: "body", origin: [0, 24, 0] });
  let walk = makeAnimation("walk");
  walk = setKeyframe(walk, body.id, "rotation", 0, [10, 0, 0]);
  return {
    id: "gnawer", textureWidth: 64, textureHeight: 32, texture: "custom/g.png",
    bones: [body], cubes: [makeCube({ bone: body.id })], animations: [walk],
    entity: { displayName: "Rail Gnawer", behavior: "hostile_melee", mobCategory: "monster", walkAnimation: "walk", naturalSpawn: true, ...entity },
  };
}

describe("Bedrock add-on", () => {
  it("maps a hostile mob to vanilla-style components", () => {
    const e = behaviorEntity("mymod", spec()) as { "minecraft:entity": { description: { identifier: string }; components: Record<string, unknown> } };
    expect(e["minecraft:entity"].description.identifier).toBe("mymod:gnawer");
    const c = e["minecraft:entity"].components;
    expect(c["minecraft:health"]).toEqual({ value: 20, max: 20 });
    expect(c["minecraft:attack"]).toEqual({ damage: 3 });
    expect(c).toHaveProperty("minecraft:behavior.nearest_attackable_target");
    expect(c).toHaveProperty("minecraft:despawn");
    expect(c).not.toHaveProperty("minecraft:behavior.panic");
    const passive = (behaviorEntity("mymod", spec({ behavior: "passive", mobCategory: "creature" })) as { "minecraft:entity": { components: Record<string, unknown> } })["minecraft:entity"].components;
    expect(passive).toHaveProperty("minecraft:behavior.panic");
    expect(passive).not.toHaveProperty("minecraft:attack");
  });
  it("spawn rules follow vanilla zombie conditions for monsters", () => {
    const r = spawnRules("mymod", spec()) as { "minecraft:spawn_rules": { description: { population_control: string }; conditions: Record<string, unknown>[] } };
    expect(r["minecraft:spawn_rules"].description.population_control).toBe("monster");
    expect(r["minecraft:spawn_rules"].conditions[0]["minecraft:brightness_filter"]).toEqual({ min: 0, max: 7, adjust_for_weather: true });
    expect(spawnRules("mymod", spec({ naturalSpawn: false }))).toBeNull();
  });
  it("client entity wires the walk animation by query", () => {
    const d = (clientEntity("mymod", spec()) as { "minecraft:client_entity": { description: Record<string, unknown> } })["minecraft:client_entity"].description;
    expect(d.animations).toEqual({ walk: "animation.gnawer.walk" });
    expect(d.scripts).toEqual({ animate: [{ walk: "query.modified_move_speed" }] });
    expect(d.geometry).toEqual({ default: "geometry.gnawer" });
  });
  it("builds a zip with linked behavior + resource packs", async () => {
    const blob = await buildBedrockAddon({ modId: "mymod", packName: "MyMod", entities: [{ spec: spec(), texture: new Blob(["png"]) }] });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir).sort();
    expect(files).toEqual([
      "MyMod_BP/entities/gnawer.json", "MyMod_BP/manifest.json", "MyMod_BP/spawn_rules/gnawer.json",
      "MyMod_RP/animations/gnawer.animation.json", "MyMod_RP/entity/gnawer.entity.json", "MyMod_RP/manifest.json",
      "MyMod_RP/models/entity/gnawer.geo.json", "MyMod_RP/texts/en_US.lang", "MyMod_RP/texts/languages.json", "MyMod_RP/textures/entity/gnawer.png",
    ]);
    const bp = JSON.parse(await zip.file("MyMod_BP/manifest.json")!.async("string"));
    const rp = JSON.parse(await zip.file("MyMod_RP/manifest.json")!.async("string"));
    expect(bp.dependencies[0].uuid).toBe(rp.header.uuid);
    expect(bp.header.uuid).toBe(stableUuid("mymod:behavior"));
    expect(bp.header.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await zip.file("MyMod_RP/texts/en_US.lang")!.async("string")).toContain("entity.mymod:gnawer.name=Rail Gnawer");
  });
  it("adds a loot table for vanilla death drops", () => {
    const e = behaviorEntity("mymod", spec({ drops: [{ item: "minecraft:bone", min: 0, max: 2, chance: 1, lootingBonus: 1 }, { item: "mymod:ruby", min: 1, max: 1, chance: 1 }] })) as { "minecraft:entity": { components: Record<string, unknown> } };
    expect(e["minecraft:entity"].components["minecraft:loot"]).toEqual({ table: "loot_tables/entities/gnawer.json" });
  });
});
