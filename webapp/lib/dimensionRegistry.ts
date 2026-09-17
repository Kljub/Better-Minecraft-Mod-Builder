import type { DimensionSpec } from "./types";

export const DIMENSION_DEFAULT: Omit<DimensionSpec, "id"> = {
  baseType: "overworld",
  hasSkylight: true,
  hasCeiling: false,
  ambientLight: 0,
  coordinateScale: 1,
  hasFixedTime: false,
  canSetSpawn: "always",
  canSleep: "when_dark",
  bedsExplode: false,
  respawnAnchorWorks: false,
  monstersCanSpawn: true,
  mobsCanSpawn: true,
  biome: "minecraft:plains",
  layers: [
    { block: "minecraft:bedrock", height: 1 },
    { block: "minecraft:dirt", height: 2 },
    { block: "minecraft:grass_block", height: 1 },
  ],
  generateDecorations: false,
  generateLakes: false,
  generateStructures: false,
};

export const CAN_SET_SPAWN_OPTIONS = ["always", "never"];
export const CAN_SLEEP_OPTIONS = ["always", "never", "when_dark"];
