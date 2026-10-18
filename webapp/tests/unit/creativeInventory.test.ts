import { describe, it, expect } from "vitest";
import { CREATIVE_TABS, TAB_ITEMS, ITEM_ICONS, ALL_ITEMS, isBlockItem, searchItems, itemLabel } from "@/lib/creativeInventory";

describe("creative inventory data", () => {
  it("has every tab with items in game order, and an icon for every item", () => {
    for (const t of CREATIVE_TABS) if (t.id !== "search" && t.id !== "mod") expect(TAB_ITEMS[t.id]?.length, t.id).toBeGreaterThan(5);
    expect(TAB_ITEMS.building_blocks.slice(0, 2)).toEqual(["oak_log", "oak_wood"]);
    expect(TAB_ITEMS.combat).toContain("diamond_sword");
    expect(TAB_ITEMS.colored_blocks).toContain("light_blue_wool");
    expect(ALL_ITEMS.length).toBeGreaterThan(1300);
    for (const id of ALL_ITEMS) expect(ITEM_ICONS[id], id).toBeTruthy();
    for (const t of CREATIVE_TABS) if (t.id !== "mod") expect(ITEM_ICONS[t.icon], t.icon).toBeTruthy();
  });

  it("knows blocks, searches by words, labels ids", () => {
    expect(isBlockItem("oak_log")).toBe(true);
    expect(isBlockItem("diamond_sword")).toBe(false);
    expect(searchItems(["minecraft:ender_pearl", "minecraft:ender_eye", "minecraft:pearl"], "ender pearl")).toEqual(["minecraft:ender_pearl"]);
    expect(itemLabel("minecraft:iron_ingot")).toBe("Iron Ingot");
    expect(ITEM_ICONS.grass_block.k).toBeTruthy(); // grass top is tinted
  });
});
