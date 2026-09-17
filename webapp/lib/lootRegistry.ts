import type { LootEntrySpec, LootTargetKey } from "./types";

export const LOOT_TARGET_OPTIONS: LootTargetKey[] = [
  "chests/village/village_weaponsmith", "chests/village/village_armorer", "chests/village/village_toolsmith",
  "chests/village/village_temple", "chests/village/village_desert_house", "chests/village/village_plains_house",
  "chests/abandoned_mineshaft", "chests/buried_treasure", "chests/desert_pyramid", "chests/jungle_temple",
  "chests/simple_dungeon", "chests/nether_bridge", "chests/stronghold_corridor", "chests/stronghold_library",
  "chests/woodland_mansion", "chests/ancient_city", "chests/bastion_treasure", "chests/shipwreck_treasure",
  "chests/end_city_treasure", "chests/pillager_outpost", "chests/underwater_ruin_big", "chests/underwater_ruin_small",
];

export const LOOT_TARGET_LABELS: Record<LootTargetKey, string> = {
  "chests/village/village_weaponsmith": "Village — Weaponsmith",
  "chests/village/village_armorer": "Village — Armorer",
  "chests/village/village_toolsmith": "Village — Toolsmith",
  "chests/village/village_temple": "Village — Cleric (temple)",
  "chests/village/village_desert_house": "Village — Desert house",
  "chests/village/village_plains_house": "Village — Plains house",
  "chests/abandoned_mineshaft": "Abandoned Mineshaft",
  "chests/buried_treasure": "Buried Treasure",
  "chests/desert_pyramid": "Desert Pyramid",
  "chests/jungle_temple": "Jungle Temple",
  "chests/simple_dungeon": "Dungeon (spawner room)",
  "chests/nether_bridge": "Nether Fortress",
  "chests/stronghold_corridor": "Stronghold — Corridor",
  "chests/stronghold_library": "Stronghold — Library",
  "chests/woodland_mansion": "Woodland Mansion",
  "chests/ancient_city": "Ancient City",
  "chests/bastion_treasure": "Bastion — Treasure Room",
  "chests/shipwreck_treasure": "Shipwreck — Treasure",
  "chests/end_city_treasure": "End City — Treasure",
  "chests/pillager_outpost": "Pillager Outpost",
  "chests/underwater_ruin_big": "Underwater Ruin (big)",
  "chests/underwater_ruin_small": "Underwater Ruin (small)",
};

export const LOOT_ENTRY_DEFAULT: Omit<LootEntrySpec, "id"> = {
  targetLootTable: "chests/simple_dungeon",
  item: "minecraft:diamond",
  weight: 5,
  minCount: 1,
  maxCount: 1,
};
