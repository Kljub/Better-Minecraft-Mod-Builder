import type { BiomeSpec } from "./types";

// Curated (non-exhaustive) list of common vanilla biome ids, offered as picker suggestions
// wherever a spec references "a biome" (currently just DimensionSpec's flat-generator biome).
export const VANILLA_BIOME_OPTIONS: string[] = [
  "minecraft:plains", "minecraft:desert", "minecraft:forest", "minecraft:birch_forest", "minecraft:dark_forest",
  "minecraft:taiga", "minecraft:snowy_taiga", "minecraft:savanna", "minecraft:jungle", "minecraft:swamp",
  "minecraft:mangrove_swamp", "minecraft:badlands", "minecraft:mushroom_fields", "minecraft:ocean",
  "minecraft:deep_ocean", "minecraft:frozen_ocean", "minecraft:river", "minecraft:beach", "minecraft:snowy_plains",
  "minecraft:ice_spikes", "minecraft:windswept_hills", "minecraft:stony_peaks", "minecraft:cherry_grove",
  "minecraft:nether_wastes", "minecraft:crimson_forest", "minecraft:warped_forest", "minecraft:soul_sand_valley",
  "minecraft:basalt_deltas", "minecraft:the_end", "minecraft:end_highlands", "minecraft:end_midlands",
  "minecraft:small_end_islands", "minecraft:the_void",
];

export const BIOME_DEFAULT: Omit<BiomeSpec, "id"> = {
  baseTemplate: "plains",
  temperature: 0.8,
  downfall: 0.4,
  hasPrecipitation: true,
  skyColor: "#78a7ff",
  waterColor: "#3f76e4",
  spawnDimension: "overworld",
};

export const SPAWN_DIMENSION_OPTIONS = ["overworld", "nether", "end"];
export const SPAWN_DIMENSION_LABELS: Record<string, string> = {
  overworld: "Overworld",
  nether: "Nether",
  end: "The End",
};
