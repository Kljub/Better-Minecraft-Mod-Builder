import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { writeElementFiles } from "@/lib/elements/export";
import { normalizeElements, getElementKind } from "@/lib/elements/registry";

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
