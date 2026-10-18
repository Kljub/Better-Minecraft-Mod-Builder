import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { writeElementFiles } from "@/lib/elements/export";
import { normalizeElements, getElementKind } from "@/lib/elements/registry";
import { VILLAGER_PROFESSION } from "@/lib/elements/modKinds";

const ctx = { modId: "mymod", mcVersion: "26.2" as never, texture: () => undefined };

async function exportOf(raw: Record<string, unknown[]>) {
  const zip = new JSZip();
  writeElementFiles(zip, "", normalizeElements(raw), ctx);
  const read = async (p: string) => {
    const f = zip.file(p);
    return f ? JSON.parse(await f.async("string")) : undefined;
  };
  return { zip, read };
}

describe("mod element kinds (runtime manifests)", () => {
  it("merges every element of a kind into one manifest array", async () => {
    const { read } = await exportOf({
      command: [{ id: "heal" }, { id: "home", argument: "player", commands: "/tp @s 0 64 0\n# comment\n" }],
      gameRule: [{ id: "allow_x", name: "Allow X" }],
    });
    const commands = await read("assets/mymod/screenspec/elements/commands.json");
    expect(commands.map((c: { id: string }) => c.id)).toEqual(["heal", "home"]);
    expect(commands[1].commands).toEqual(["tp @s 0 64 0"]);
    expect(await read("assets/mymod/screenspec/elements/game_rules.json")).toHaveLength(1);
    expect((await read("assets/mymod/lang/en_us.json"))["gamerule.mymod.allow_x"]).toBe("Allow X");
  });

  it("refuses an elevated command with a free-text argument", () => {
    const def = getElementKind("command")!;
    const problems = def.validate!({ id: "x", ...def.defaults(), elevate: true, argument: "text" }, { modId: "mymod", mcVersion: "26.2" as never });
    expect(problems.join(" ")).toMatch(/inject/);
  });

  it("merges armor trim atlas sources instead of overwriting the shared atlas file", async () => {
    const { read } = await exportOf({
      armorTrim: [{ id: "a", texture: "t.png", leggingsTexture: "l.png" }, { id: "b", texture: "t.png", leggingsTexture: "l.png" }],
    });
    const atlas = await read("assets/minecraft/atlases/armor_trims.json");
    expect(atlas.sources).toHaveLength(2);
    expect(atlas.sources[1].textures).toContain("mymod:trims/entity/humanoid/b");
  });

  it("writes a trade set per level for a villager profession and rejects vanilla job sites", async () => {
    const { read } = await exportOf({
      villagerProfession: [{ id: "smith", jobSiteBlock: "mymod:anvil", trades: [{ level: "2", wants: "minecraft:emerald", wantsCount: 3, gives: "minecraft:bread", givesCount: 1, maxUses: 4, xp: 1 }] }],
    });
    expect((await read("data/mymod/tags/villager_trade/smith/level_2.json")).values).toEqual(["mymod:smith/1"]);
    expect((await read("data/mymod/tags/villager_trade/smith/level_1.json")).values).toEqual([]);
    expect((await read("data/mymod/trade_set/smith/level_5.json")).trades).toBe("#mymod:smith/level_5");
    const def = getElementKind("villagerProfession")!;
    expect(def.validate!({ id: "x", ...def.defaults(), jobSiteBlock: "minecraft:loom" }, { modId: "m", mcVersion: "26.2" as never })).not.toHaveLength(0);
  });
});

describe("texture pack (standalone resource pack)", () => {
  const spec = {
    id: "shiny", name: "Shiny", description: "Shinier swords", icon: "custom/icon.png",
    overrides: [{ target: "item/diamond_sword", texture: "custom/sword.png" }, { target: "othermod:block/ore.png", texture: "custom/ore.png" }],
  };

  it("maps targets to vanilla/mod texture paths and rejects path tricks", async () => {
    const { overridePath } = await import("@/lib/elements/modKinds");
    expect(overridePath("item/diamond_sword")).toBe("assets/minecraft/textures/item/diamond_sword.png");
    expect(overridePath("minecraft:block/stone.png")).toBe("assets/minecraft/textures/block/stone.png");
    expect(overridePath("othermod:block/ore")).toBe("assets/othermod/textures/block/ore.png");
    expect(overridePath("../../evil")).toBeNull();
    expect(overridePath("")).toBeNull();
  });

  it("builds pack.mcmeta per version + the replaced textures, and stays out of the mod export", async () => {
    const def = getElementKind("texturePack")!;
    const tex = (k: string) => (k ? ("PNG:" + k) as unknown as Blob : undefined);
    const files = def.files({ ...def.defaults(), ...spec }, { modId: "mymod", mcVersion: "26.2" as never, texture: tex });
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
    expect(JSON.parse(byPath["pack.mcmeta"] as string)).toEqual({ pack: { description: "Shinier swords", min_format: 88, max_format: 88 } });
    expect(byPath["pack.png"]).toBe("PNG:custom/icon.png");
    expect(byPath["assets/minecraft/textures/item/diamond_sword.png"]).toBe("PNG:custom/sword.png");
    expect(byPath["assets/othermod/textures/block/ore.png"]).toBe("PNG:custom/ore.png");
    const old = def.files({ ...def.defaults(), ...spec }, { modId: "mymod", mcVersion: "1.21.1" as never, texture: tex });
    expect(JSON.parse(old.find((f) => f.path === "pack.mcmeta")!.content as string).pack.pack_format).toBe(34);

    const { zip } = await exportOf({ texturePack: [spec] });
    expect(Object.keys(zip.files)).toEqual([]);
  });

  it("flags a texture replaced twice or without an image", () => {
    const def = getElementKind("texturePack")!;
    const problems = def.validate!({ ...def.defaults(), id: "p", overrides: [{ target: "block/stone", texture: "a" }, { target: "minecraft:block/stone", texture: "" }] }, { modId: "m", mcVersion: "26.2" as never });
    expect(problems.join(" ")).toMatch(/replaced twice/);
    expect(problems.join(" ")).toMatch(/pick the image/);
  });
});

describe("village profession limit", () => {
  const spec = (maxPerVillage?: number) => ({ id: "smith", name: "Smith", jobSiteBlock: "mymod:anvil2", ...(maxPerVillage === undefined ? {} : { maxPerVillage }) });
  const shared = (s: ReturnType<typeof spec>) => VILLAGER_PROFESSION.shared!(s as never, { modId: "mymod", mcVersion: "26.2" });
  it("exports the limit (-1 unlimited by default) and leaves limit-0 jobs out of acquirable_job_site", () => {
    expect((shared(spec()).manifest!.villager_professions as { maxPerVillage: number }).maxPerVillage).toBe(-1);
    expect((shared(spec(3)).manifest!.villager_professions as { maxPerVillage: number }).maxPerVillage).toBe(3);
    expect(Object.keys(shared(spec(3)).tags ?? {})).toContain("data/minecraft/tags/point_of_interest_type/acquirable_job_site.json");
    expect(Object.keys(shared(spec(0)).tags ?? {})).not.toContain("data/minecraft/tags/point_of_interest_type/acquirable_job_site.json");
    expect((shared(spec(-5)).manifest!.villager_professions as { maxPerVillage: number }).maxPerVillage).toBe(-1);
  });
});
