import type { ItemSpec, CreativeTabKey, AttributeModifierSpec, AttributeOperation, EquipmentSlotGroup, CustomAttributeSpec } from "./types";
import type { PropField } from "./widgetRegistry";

export const CREATIVE_TAB_OPTIONS: CreativeTabKey[] = [
  "custom",
  "BUILDING_BLOCKS",
  "COLORED_BLOCKS",
  "NATURAL_BLOCKS",
  "FUNCTIONAL_BLOCKS",
  "REDSTONE_BLOCKS",
  "TOOLS_AND_UTILITIES",
  "COMBAT",
  "FOOD_AND_DRINKS",
  "INGREDIENTS",
  "SPAWN_EGGS",
];

export const CREATIVE_TAB_LABELS: Record<CreativeTabKey, string> = {
  custom: "Eigener Mod-Tab",
  BUILDING_BLOCKS: "Building Blocks",
  COLORED_BLOCKS: "Colored Blocks",
  NATURAL_BLOCKS: "Natural Blocks",
  FUNCTIONAL_BLOCKS: "Functional Blocks",
  REDSTONE_BLOCKS: "Redstone Blocks",
  TOOLS_AND_UTILITIES: "Tools & Utilities",
  COMBAT: "Combat",
  FOOD_AND_DRINKS: "Food & Drinks",
  INGREDIENTS: "Ingredients",
  SPAWN_EGGS: "Spawn Eggs",
};

export const ITEM_DEFAULT: Omit<ItemSpec, "id"> = {
  displayName: "New Item",
  texture: "",
  category: "simple",
  stackSize: 64,
  rarity: "common",
  fireResistant: false,
  creativeTab: "custom",
  damageStages: [],
};

// Base fields shown for every item, regardless of category.
export const ITEM_PROPERTY_SCHEMA: PropField[] = [
  { key: "displayName", label: "Display Name", type: "text", defaultValue: "New Item" },
  { key: "category", label: "Category", type: "select", options: ["simple", "food", "armor"], defaultValue: "simple" },
  { key: "stackSize", label: "Stack Size", type: "number", defaultValue: "64" },
  { key: "rarity", label: "Rarity", type: "select", options: ["common", "uncommon", "rare", "epic"], defaultValue: "common" },
  { key: "fireResistant", label: "Fire Resistant", type: "boolean", defaultValue: "false" },
  { key: "durability", label: "Durability (0 = unbreakable stack)", type: "number", defaultValue: "0" },
  { key: "creativeTab", label: "Creative Tab", type: "select", options: CREATIVE_TAB_OPTIONS, defaultValue: "custom" },
];

// Extra fields shown only when category === "food".
export const ITEM_FOOD_SCHEMA: PropField[] = [
  { key: "nutrition", label: "Nutrition", type: "number", defaultValue: "4" },
  { key: "saturation", label: "Saturation", type: "number", defaultValue: "0.3" },
  { key: "alwaysEdible", label: "Always Edible", type: "boolean", defaultValue: "false" },
];

// Extra fields shown only when category === "armor". The actual defense/toughness/knockback
// values live in `attributes` (below) — this just picks which equipment slot the piece occupies.
export const ITEM_ARMOR_SCHEMA: PropField[] = [
  { key: "armorSlot", label: "Armor Slot", type: "select", options: ["helmet", "chestplate", "leggings", "boots"], defaultValue: "chestplate" },
];

// Curated subset of vanilla attributes worth exposing — declarative stat modifiers, not a
// scripted power system (matches vanilla's data-driven AttributeModifiers item component).
export const ATTRIBUTE_OPTIONS = [
  "generic.max_health",
  "generic.attack_damage",
  "generic.attack_speed",
  "generic.armor",
  "generic.armor_toughness",
  "generic.movement_speed",
  "generic.knockback_resistance",
  "generic.luck",
] as const;

export const ATTRIBUTE_OPERATION_OPTIONS: AttributeOperation[] = ["add_value", "add_multiplied_base", "add_multiplied_total"];

export const EQUIPMENT_SLOT_OPTIONS: EquipmentSlotGroup[] = [
  "any", "hand", "mainhand", "offhand", "armor", "head", "chest", "legs", "feet", "body",
];

const ARMOR_SLOT_POINTS: Record<string, number> = { helmet: 2, chestplate: 6, leggings: 5, boots: 2 };
const ARMOR_SLOT_EQUIPMENT_SLOT: Record<string, EquipmentSlotGroup> = {
  helmet: "head", chestplate: "chest", leggings: "legs", boots: "feet",
};

/** Seeds a sensible default "generic.armor" modifier when an item is switched to category "armor". */
export function defaultArmorAttributes(armorSlot: string): AttributeModifierSpec[] {
  return [{
    attribute: "generic.armor",
    amount: ARMOR_SLOT_POINTS[armorSlot] ?? 2,
    operation: "add_value",
    slot: ARMOR_SLOT_EQUIPMENT_SLOT[armorSlot] ?? "armor",
  }];
}

export function defaultCustomAttribute(id: string): CustomAttributeSpec {
  return { id, displayName: id, defaultBase: 0, min: 0, max: 1024, sentiment: "neutral", addToAllLiving: false, addToPlayers: false };
}

/** Lowercases and replaces anything not a-z/0-9 with underscores — same normalization Minecraft
 * registry names require, used for custom-attribute ids (and their default suggestion below). */
export function slugifyId(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Default id suggestion for a new custom attribute, requested by the user as "{project}_{displayname lowercase}". */
export function suggestCustomAttributeId(modId: string, displayName: string): string {
  const project = slugifyId(modId) || "project";
  const name = slugifyId(displayName) || "attribute";
  return `${project}_${name}`;
}
