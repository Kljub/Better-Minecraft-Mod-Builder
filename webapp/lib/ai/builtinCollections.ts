import type { PropField } from "@/lib/widgetRegistry";
import {
  ITEM_DEFAULT, ITEM_PROPERTY_SCHEMA, ITEM_FOOD_SCHEMA, ITEM_ARMOR_SCHEMA, ATTRIBUTE_OPTIONS, ATTRIBUTE_OPERATION_OPTIONS,
  EQUIPMENT_SLOT_OPTIONS, CREATIVE_TAB_OPTIONS, defaultCustomAttribute,
} from "@/lib/itemRegistry";
import { BLOCK_DEFAULT, BLOCK_PROPERTY_SCHEMA } from "@/lib/blockRegistry";
import { ARMOR_DEFAULT } from "@/lib/armorRegistry";
import { EFFECT_DEFAULT, EFFECT_PROPERTY_SCHEMA } from "@/lib/effectRegistry";
import { POTION_DEFAULT } from "@/lib/potionRegistry";
import { ACHIEVEMENT_DEFAULT } from "@/lib/achievementRegistry";
import { RECIPE_DEFAULT } from "@/lib/recipeRegistry";
import { TRADE_DEFAULT } from "@/lib/tradeRegistry";
import { LOOT_ENTRY_DEFAULT } from "@/lib/lootRegistry";
import { BIOME_DEFAULT } from "@/lib/biomeRegistry";
import { DIMENSION_DEFAULT } from "@/lib/dimensionRegistry";

/**
 * The editor's built-in content categories (items, blocks, armor, recipes, …) — older than the
 * generic element kinds (lib/elements), stored as their own lists in the project. The AI tools
 * (editorTools: list/describe/create/update/delete_record) read and write them through this
 * table: defaults, the editor's own property schema where one exists, and notes for the AI.
 */
export interface BuiltinCollection {
  key: string;
  label: string;
  idPrefix: string;
  /** the editor document type that opens a record, and the history field holding its index */
  docType: string | null;
  activeKey: string | null;
  defaults: (id: string) => Record<string, unknown>;
  fields?: PropField[];
  notes?: string;
}

const fieldsDoc = (fields: PropField[]) => fields.map((f) => ({ key: f.key, label: f.label, type: f.type, ...(f.options ? { options: f.options } : {}) }));

export const BUILTIN_COLLECTIONS: BuiltinCollection[] = [
  {
    key: "items", label: "Items", idPrefix: "item", docType: "item", activeKey: "activeItemIdx",
    defaults: (id) => ({ ...ITEM_DEFAULT, id }),
    fields: [...ITEM_PROPERTY_SCHEMA, ...ITEM_FOOD_SCHEMA, ...ITEM_ARMOR_SCHEMA],
    notes: [
      "Weapons/tools: give durability (e.g. diamond sword 1561), stackSize 1, creativeTab COMBAT or TOOLS_AND_UTILITIES, and `attributes`:",
      `[{ attribute, amount, operation, slot }] with attribute one of ${ATTRIBUTE_OPTIONS.join(", ")}; operation one of ${ATTRIBUTE_OPERATION_OPTIONS.join(", ")};`,
      `slot one of ${EQUIPMENT_SLOT_OPTIONS.join(", ")}. The player's base attack damage is 1, so a tooltip of "8 Attack Damage" needs`,
      "generic.attack_damage amount 7 (add_value, mainhand); swords also get generic.attack_speed -2.4 (mainhand).",
      "Food: category food + nutrition/saturation. Armor pieces: category armor + armorSlot + generic.armor attributes.",
      `creativeTab: ${CREATIVE_TAB_OPTIONS.join(", ")} or a project creative tab id ("none" = in no tab, only /give).`,
      "extraCreativeTabs: further tab ids it also appears in.",
      "texture: a pack texture key — find one with list_textures (e.g. \"item/diamond_sword.png\"), or draw one with generate_image(size 16, assign_to this item).",
    ].join(" "),
  },
  {
    key: "blocks", label: "Blocks", idPrefix: "block", docType: "block", activeKey: "activeBlockIdx",
    defaults: (id) => ({ ...BLOCK_DEFAULT, id }), fields: BLOCK_PROPERTY_SCHEMA,
  },
  { key: "armors", label: "Armor sets", idPrefix: "armor", docType: "armor", activeKey: "activeArmorIdx", defaults: (id) => ({ ...ARMOR_DEFAULT, id }) },
  {
    key: "creativeTabs", label: "Creative tabs", idPrefix: "tab", docType: null, activeKey: null,
    defaults: (id) => ({ id, displayName: "New Tab", icon: "" }),
    notes: "icon: pack texture key of the tab's icon image (list_textures), \"\" = its first item.",
  },
  {
    key: "customAttributes", label: "Custom attributes", idPrefix: "attribute", docType: "attribute", activeKey: "activeAttributeIdx",
    defaults: (id) => ({ ...defaultCustomAttribute(id) }),
  },
  { key: "effects", label: "Effects", idPrefix: "effect", docType: "effect", activeKey: "activeEffectIdx", defaults: (id) => ({ ...EFFECT_DEFAULT, id }), fields: EFFECT_PROPERTY_SCHEMA },
  { key: "potions", label: "Potions", idPrefix: "potion", docType: "potion", activeKey: "activePotionIdx", defaults: (id) => ({ ...POTION_DEFAULT, id }) },
  { key: "achievements", label: "Achievements", idPrefix: "achievement", docType: "achievement", activeKey: "activeAchievementIdx", defaults: (id) => ({ ...ACHIEVEMENT_DEFAULT, id }) },
  { key: "recipes", label: "Recipes", idPrefix: "recipe", docType: "recipe", activeKey: "activeRecipeIdx", defaults: (id) => ({ ...RECIPE_DEFAULT, id }) },
  { key: "trades", label: "Trades", idPrefix: "trade", docType: "trade", activeKey: "activeTradeIdx", defaults: (id) => ({ ...TRADE_DEFAULT, id }) },
  { key: "lootEntries", label: "Loot", idPrefix: "loot", docType: "loot", activeKey: "activeLootEntryIdx", defaults: (id) => ({ ...LOOT_ENTRY_DEFAULT, id }) },
  { key: "biomes", label: "Biomes", idPrefix: "biome", docType: "biome", activeKey: "activeBiomeIdx", defaults: (id) => ({ ...BIOME_DEFAULT, id }) },
  { key: "dimensions", label: "Dimensions", idPrefix: "dimension", docType: "dimension", activeKey: "activeDimensionIdx", defaults: (id) => ({ ...DIMENSION_DEFAULT, id }) },
];

export function builtinCollection(key: string): BuiltinCollection {
  const def = BUILTIN_COLLECTIONS.find((c) => c.key === key);
  if (!def) throw new Error(`unknown collection "${key}" — one of ${BUILTIN_COLLECTIONS.map((c) => c.key).join(", ")}`);
  return def;
}

/** What the AI needs to write a record: an example with every default field, the editor's field list, notes. */
export function describeCollection(def: BuiltinCollection): Record<string, unknown> {
  return {
    collection: def.key, label: def.label,
    example: def.defaults(`${def.idPrefix}_example`),
    ...(def.fields ? { fields: fieldsDoc(def.fields) } : {}),
    ...(def.notes ? { notes: def.notes } : {}),
    rules: "id: lowercase registry path [a-z0-9_]. Records are merged onto the defaults; keep field types as in the example.",
  };
}

/** Lowercase registry path, unique among `taken`. */
export function recordId(raw: unknown, prefix: string, taken: string[]): string {
  const base = (typeof raw === "string" ? raw : "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || prefix;
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}_${n}`;
  return id;
}
