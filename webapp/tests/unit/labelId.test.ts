import { describe, expect, it } from "vitest";
import { followLabelId, labelToId, withLabelId } from "../../lib/elements/helpers";
import { getElementKind } from "../../lib/elements/registry";
import type { ElementSpec } from "../../lib/elements/types";

const def = getElementKind("gameRule")!;

describe("labelToId", () => {
  it("lowercases and turns spaces into underscores", () => {
    expect(labelToId("Keep Inventory Plus")).toBe("keep_inventory_plus");
    expect(labelToId("  Max  Mob   Count ")).toBe("max_mob_count");
    expect(labelToId("Döner Rule!")).toBe("dner_rule");
  });
});

describe("withLabelId (game rules)", () => {
  const fresh: ElementSpec = { id: "game_rule_1", name: "" };

  it("follows the display name from the default id", () => {
    expect(withLabelId(def, fresh, { name: "Do Fire Tick" }, [fresh])).toEqual({ name: "Do Fire Tick", id: "do_fire_tick" });
  });

  it("keeps following while typing", () => {
    const spec: ElementSpec = { id: "do_fire", name: "Do Fire" };
    expect(withLabelId(def, spec, { name: "Do Fire Tick" }, [spec]).id).toBe("do_fire_tick");
  });

  it("never overwrites an id renamed by hand", () => {
    const spec: ElementSpec = { id: "my_custom_id", name: "Do Fire" };
    expect(withLabelId(def, spec, { name: "Do Fire Tick" }, [spec])).toEqual({ name: "Do Fire Tick" });
  });

  it("adds a suffix when another game rule already has the id", () => {
    const other: ElementSpec = { id: "pvp", name: "PvP" };
    expect(withLabelId(def, fresh, { name: "PvP" }, [other, fresh]).id).toBe("pvp_2");
  });

  it("keeps the id when the name is cleared, and ignores other fields", () => {
    const spec: ElementSpec = { id: "pvp", name: "PvP" };
    expect(withLabelId(def, spec, { name: "" }, [spec])).toEqual({ name: "" });
    expect(withLabelId(def, spec, { category: "mobs" }, [spec])).toEqual({ category: "mobs" });
  });
});

describe("ids follow names for every kind with a name", () => {
  it("enchantments (and other kinds) follow by default; references stop it", () => {
    const ench = getElementKind("enchantment")!;
    const fresh: ElementSpec = { id: "enchantment_1", name: "" };
    expect(withLabelId(ench, fresh, { name: "Life Steal" }, [fresh]).id).toBe("life_steal");
    const used: ElementSpec = { id: "life_steal", name: "Life Steal" };
    expect(withLabelId(ench, used, { name: "Life Steal II" }, [used], () => true).id).toBeUndefined();
    for (const kind of ["damageType", "fluid", "villagerProfession", "plant", "keyBinding", "projectile", "armorTrim"]) {
      const d = getElementKind(kind);
      if (!d?.labelField) continue;
      const s: ElementSpec = { id: `${d.idPrefix}_1`, [d.labelField]: "" };
      expect(withLabelId(d, s, { [d.labelField]: "Shiny Thing" }, [s]).id, kind).toBe("shiny_thing");
    }
  });

  it("followLabelId: built-in categories, clashes and hand-renamed ids", () => {
    expect(followLabelId("item_3", "", "Ruby Gem", "item", ["item_1"])).toBe("ruby_gem");
    expect(followLabelId("ruby", "Ruby", "Ruby Gem", "item", ["ruby_gem"])).toBe("ruby_gem_2");
    expect(followLabelId("my_ruby", "Ruby", "Ruby Gem", "item", [])).toBeNull();
    expect(followLabelId("ruby", "Ruby", "Ruby", "item", [])).toBeNull();
  });
});
