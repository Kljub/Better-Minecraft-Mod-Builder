import { describe, expect, it } from "vitest";
import { VILLAGER_PROFESSION } from "@/lib/elements/modKinds";

const ctx = { modId: "mymod", mcVersion: "26.2" as const, texture: () => new Blob(["x"]) };
const spec = (patch: Record<string, unknown> = {}) => ({ id: "gem_peddler", ...VILLAGER_PROFESSION.defaults(), type: "wandering", name: "Gem Peddler", ...patch });

describe("Village profession: wandering trader", () => {
  it("writes one trade set per pool from its offers", () => {
    const s = spec({ commonOffers: 3, wanderingTrades: [
      { pool: "common", wants: "minecraft:emerald", wantsCount: 2, gives: "mymod:ruby", givesCount: 1, maxUses: 8, xp: 1 },
      { pool: "rare", wants: "minecraft:emerald", wantsCount: 20, gives: "minecraft:diamond", givesCount: 1, maxUses: 2, xp: 5 },
      { pool: "buying", wants: "mymod:ruby", wantsCount: 4, gives: "minecraft:emerald", givesCount: 1, maxUses: 12, xp: 1 },
    ] });
    const files = Object.fromEntries(VILLAGER_PROFESSION.files(s, ctx).map((f) => [f.path, f.content]));
    expect(JSON.parse(files["data/mymod/villager_trade/gem_peddler/2.json"] as string)).toMatchObject({ gives: { id: "minecraft:diamond" }, max_uses: 2 });
    expect(JSON.parse(files["data/mymod/tags/villager_trade/gem_peddler/rare.json"] as string)).toEqual({ values: ["mymod:gem_peddler/2"] });
    expect(JSON.parse(files["data/mymod/trade_set/gem_peddler/common.json"] as string)).toMatchObject({ amount: 3, trades: "#mymod:gem_peddler/common" });
    expect(files["assets/mymod/items/gem_peddler_spawn_egg.json"]).toBeTruthy();
    expect(files["data/mymod/trade_set/gem_peddler/level_1.json"]).toBeUndefined();
  });

  it("registers through the wandering_traders manifest, not as a profession", () => {
    const shared = VILLAGER_PROFESSION.shared!(spec({ spawnIntervalMinutes: 10, stayMinutes: 30, llamas: 0, texture: "custom/peddler.png" }), ctx);
    expect(shared.manifest).toEqual({ wandering_traders: expect.objectContaining({
      id: "gem_peddler", displayName: "Gem Peddler", spawnDelay: 12000, despawnDelay: 36000, llamas: 0, texture: "textures/entity/wandering_trader/gem_peddler.png",
    }) });
    expect(shared.lang).toMatchObject({ "entity.mymod.gem_peddler": "Gem Peddler" });
    expect(VILLAGER_PROFESSION.validate!(spec(), ctx)).toEqual([]);
    expect(VILLAGER_PROFESSION.validate!(spec({ wanderingTrades: [] }), ctx)).toEqual(["Add at least one offer."]);
  });

  it("jobs still work as before", () => {
    const job = { id: "smith", ...VILLAGER_PROFESSION.defaults(), jobSiteBlock: "mymod:anvil_table" };
    expect(Object.keys(VILLAGER_PROFESSION.shared!(job, ctx).manifest!)).toEqual(["villager_professions"]);
  });
});
