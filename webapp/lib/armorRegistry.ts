import type { ArmorSpec } from "./types";

export const ARMOR_DEFAULT: Omit<ArmorSpec, "id"> = {
  displayName: "New Armor",
  iconHelmet: "",
  iconChestplate: "",
  iconLeggings: "",
  iconBoots: "",
  equipmentTexture: "",
  durability: 15,
  defenseHelmet: 2,
  defenseChestplate: 6,
  defenseLeggings: 5,
  defenseBoots: 2,
  toughness: 0,
  knockbackResistance: 0,
  enchantmentValue: 9,
  repairItem: "minecraft:iron_ingot",
  creativeTab: "custom",
  rarity: "common",
};

// Reference presets from vanilla's own armor materials — a starting point, not a locked-in choice.
export const ARMOR_MATERIAL_PRESETS: Record<string, Omit<ArmorSpec, "id" | "displayName" | "iconHelmet" | "iconChestplate" | "iconLeggings" | "iconBoots" | "equipmentTexture" | "creativeTab">> = {
  leather: { durability: 5, defenseHelmet: 1, defenseChestplate: 3, defenseLeggings: 2, defenseBoots: 1, toughness: 0, knockbackResistance: 0, enchantmentValue: 15, repairItem: "minecraft:leather", rarity: "common" },
  chainmail: { durability: 15, defenseHelmet: 2, defenseChestplate: 5, defenseLeggings: 4, defenseBoots: 1, toughness: 0, knockbackResistance: 0, enchantmentValue: 12, repairItem: "minecraft:iron_ingot", rarity: "common" },
  iron: { durability: 15, defenseHelmet: 2, defenseChestplate: 6, defenseLeggings: 5, defenseBoots: 2, toughness: 0, knockbackResistance: 0, enchantmentValue: 9, repairItem: "minecraft:iron_ingot", rarity: "common" },
  gold: { durability: 25, defenseHelmet: 2, defenseChestplate: 5, defenseLeggings: 3, defenseBoots: 1, toughness: 0, knockbackResistance: 0, enchantmentValue: 25, repairItem: "minecraft:gold_ingot", rarity: "common" },
  diamond: { durability: 33, defenseHelmet: 3, defenseChestplate: 8, defenseLeggings: 6, defenseBoots: 3, toughness: 2, knockbackResistance: 0, enchantmentValue: 10, repairItem: "minecraft:diamond", rarity: "rare" },
  netherite: { durability: 37, defenseHelmet: 3, defenseChestplate: 8, defenseLeggings: 6, defenseBoots: 3, toughness: 3, knockbackResistance: 0.1, enchantmentValue: 15, repairItem: "minecraft:netherite_ingot", rarity: "epic" },
};

export const ARMOR_MATERIAL_PRESET_OPTIONS = Object.keys(ARMOR_MATERIAL_PRESETS);
