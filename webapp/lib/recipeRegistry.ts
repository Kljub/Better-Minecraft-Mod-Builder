import type { RecipeSpec, RecipeType } from "./types";

export const RECIPE_TYPE_OPTIONS: RecipeType[] = [
  "shaped", "shapeless", "smelting", "blasting", "smoking", "campfire", "stonecutting", "smithing",
];

export const RECIPE_TYPE_LABELS: Record<RecipeType, string> = {
  shaped: "Crafting (shaped)",
  shapeless: "Crafting (shapeless)",
  smelting: "Furnace (smelting)",
  blasting: "Blast furnace",
  smoking: "Smoker",
  campfire: "Campfire",
  stonecutting: "Stonecutter",
  smithing: "Smithing Table",
};

export const RECIPE_DEFAULT: Omit<RecipeSpec, "id"> = {
  namespace: "",
  type: "shaped",
  resultItem: "minecraft:diamond",
  resultCount: 1,
  grid: new Array(9).fill(null),
  ingredients: [],
  ingredient: "minecraft:diamond",
  experience: 0,
  cookingTime: 200,
  smithingTemplate: "minecraft:netherite_upgrade_smithing_template",
  smithingBase: "minecraft:diamond_sword",
  smithingAddition: "minecraft:netherite_ingot",
  group: "",
  category: "",
  unlockItems: [],
};

export const COOKING_TYPES: RecipeType[] = ["smelting", "blasting", "smoking", "campfire"];
export const SINGLE_INGREDIENT_TYPES: RecipeType[] = ["smelting", "blasting", "smoking", "campfire", "stonecutting"];
// Recipe-book category options — real vanilla enums (CraftingBookCategory/CookingBookCategory),
// verified via javap against the actual game jar. Stonecutting/smithing recipes don't use this
// field at all (omitted from export when empty either way).
export const CRAFTING_CATEGORY_OPTIONS = ["", "building", "redstone", "equipment", "misc"];
export const COOKING_CATEGORY_OPTIONS = ["", "food", "blocks", "misc"];
export const RECIPE_CATEGORY_LABELS: Record<string, string> = {
  "": "(default)", building: "Building", redstone: "Redstone", equipment: "Equipment", misc: "Misc",
  food: "Food", blocks: "Blocks",
};
