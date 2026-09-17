import type { TradeSpec, VillagerProfessionKey, WanderingTraderPool } from "./types";

export const VILLAGER_PROFESSION_OPTIONS: VillagerProfessionKey[] = [
  "armorer", "butcher", "cartographer", "cleric", "farmer", "fisherman", "fletcher",
  "leatherworker", "librarian", "mason", "shepherd", "toolsmith", "weaponsmith",
];

export const VILLAGER_LEVEL_OPTIONS = [1, 2, 3, 4, 5];

export const WANDERING_TRADER_POOL_OPTIONS: WanderingTraderPool[] = ["common", "uncommon", "buying"];
export const WANDERING_TRADER_POOL_LABELS: Record<WanderingTraderPool, string> = {
  common: "Common",
  uncommon: "Uncommon",
  buying: "Buying (trader buys this from the player)",
};

export const TRADE_DEFAULT: Omit<TradeSpec, "id"> = {
  category: "villager",
  profession: "farmer",
  level: 1,
  wanderingPool: "common",
  wants: { item: "minecraft:emerald", count: 1 },
  gives: { item: "minecraft:diamond", count: 1 },
  maxUses: 12,
  xp: 1,
};
