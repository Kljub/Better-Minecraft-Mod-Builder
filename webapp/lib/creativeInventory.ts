import data from "./data/creativeInventory.json";

/**
 * The vanilla creative inventory (Minecraft 26.2): every item per creative tab, in the game's order,
 * plus how its inventory icon is drawn. Extracted from the client jar (CreativeModeTabs + the item
 * models): only ids and texture paths are stored here, the textures themselves are loaded in the
 * browser from the Faithful "Default-Java" mirror on GitHub (same source as lib/extractFromGithub.ts).
 */
export interface ItemIcon {
  /** "f": flat sprite; "c": isometric block (top/left/right faces) */
  t: "f" | "c";
  /** flat: base layer (+ optional overlay layer) */
  a?: string;
  b?: string;
  /** cube faces */
  u?: string;
  l?: string;
  r?: string;
  /** tint colour (grass, foliage, …) — flat sprites: whole icon; cubes: top face */
  k?: string;
}

export const CREATIVE_TABS = [
  { id: "building_blocks", label: "Building Blocks", icon: "bricks", row: "top" },
  { id: "colored_blocks", label: "Colored Blocks", icon: "cyan_wool", row: "top" },
  { id: "natural_blocks", label: "Natural Blocks", icon: "grass_block", row: "top" },
  { id: "functional_blocks", label: "Functional Blocks", icon: "oak_sign", row: "top" },
  { id: "redstone_blocks", label: "Redstone Blocks", icon: "redstone", row: "top" },
  { id: "search", label: "Search Items", icon: "compass", row: "top" },
  { id: "tools_and_utilities", label: "Tools & Utilities", icon: "diamond_pickaxe", row: "bottom" },
  { id: "combat", label: "Combat", icon: "netherite_sword", row: "bottom" },
  { id: "food_and_drinks", label: "Food & Drinks", icon: "golden_apple", row: "bottom" },
  { id: "ingredients", label: "Ingredients", icon: "iron_ingot", row: "bottom" },
  { id: "spawn_eggs", label: "Spawn Eggs", icon: "pig_spawn_egg", row: "bottom" },
  { id: "op_blocks", label: "Operator Utilities", icon: "command_block", row: "bottom" },
  { id: "mod", label: "This Mod", icon: "chest", row: "bottom" },
] as const;
export type CreativeTabId = (typeof CREATIVE_TABS)[number]["id"];

export const TAB_ITEMS = data.tabs as Record<string, string[]>;
export const ITEM_ICONS = data.icons as Record<string, ItemIcon>;

/** Every vanilla item once, in creative order (the search tab). */
export const ALL_ITEMS: string[] = [...new Set(Object.values(TAB_ITEMS).flat())];

/** Items that are blocks (drawn as a cube or listed under a block tab). */
export function isBlockItem(id: string): boolean {
  return ITEM_ICONS[id]?.t === "c" || ["building_blocks", "colored_blocks", "natural_blocks", "functional_blocks", "redstone_blocks"]
    .some((t) => TAB_ITEMS[t]?.includes(id));
}

export const itemLabel = (id: string) => id.split(":").pop()!.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const textureUrl = (path: string) =>
  `https://raw.githubusercontent.com/Faithful-Pack/Default-Java/1.21.11/assets/minecraft/textures/${path}.png`;

/** Search like the game: every word must appear in the name or id. */
export function searchItems(ids: string[], query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return ids;
  return ids.filter((id) => {
    const hay = `${id} ${itemLabel(id)}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
