import type { AchievementSpec } from "./types";

export const ACHIEVEMENT_DEFAULT: Omit<AchievementSpec, "id"> = {
  title: "New Achievement",
  description: "",
  icon: "minecraft:diamond",
  frame: "task",
  parentId: "",
  showToast: true,
  announceToChat: true,
  hidden: false,
  trigger: "obtain_item",
  triggerItem: "minecraft:diamond",
  toDimension: "minecraft:the_nether",
};

export const ADVANCEMENT_FRAME_OPTIONS = ["task", "goal", "challenge"];

// Verified against this project's actual game jar (net.minecraft.advancements.triggers.CriteriaTriggers) —
// 58 trigger types exist in total, this is a curated Basis-Spec subset of the ones useful without
// needing complex predicate conditions (entity/loot/block-state filtering etc).
export const ADVANCEMENT_TRIGGER_OPTIONS = [
  "always", "obtain_item", "consume_item", "placed_block", "changed_dimension", "slept_in_bed",
  "player_killed_entity", "entity_killed_player", "enchanted_item", "fishing_rod_hooked",
  "villager_trade", "bred_animals", "tame_animal",
];

export const ADVANCEMENT_TRIGGER_LABELS: Record<string, string> = {
  always: "Always (granted immediately)",
  obtain_item: "Obtain a specific item",
  consume_item: "Eat/drink a specific item",
  placed_block: "Place any block",
  changed_dimension: "Arrive in a dimension",
  slept_in_bed: "Sleep in a bed",
  player_killed_entity: "Kill any entity",
  entity_killed_player: "Killed by any entity",
  enchanted_item: "Enchant an item",
  fishing_rod_hooked: "Catch something fishing",
  villager_trade: "Trade with a villager",
  bred_animals: "Breed two animals",
  tame_animal: "Tame an animal",
};

// Curated vanilla dimension ids for the changed_dimension trigger's target field.
export const VANILLA_DIMENSION_OPTIONS = ["minecraft:overworld", "minecraft:the_nether", "minecraft:the_end"];
