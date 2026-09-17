import type { BlockFaceKey, BlockSpec } from "./types";
import type { PropField } from "./widgetRegistry";
import { CREATIVE_TAB_OPTIONS } from "./itemRegistry";

export const BLOCK_FACES: { key: BlockFaceKey; label: string }[] = [
  { key: "up", label: "Top" },
  { key: "down", label: "Bottom" },
  { key: "north", label: "North" },
  { key: "south", label: "South" },
  { key: "east", label: "East" },
  { key: "west", label: "West" },
];

export const BLOCK_DEFAULT: Omit<BlockSpec, "id"> = {
  displayName: "New Block",
  texture: "",
  hardness: 1.5,
  resistance: 6,
  requiresTool: false,
  luminance: 0,
  soundType: "stone",
  hasItem: true,
  creativeTab: "custom",
};

export const BLOCK_PROPERTY_SCHEMA: PropField[] = [
  { key: "displayName", label: "Display Name", type: "text", defaultValue: "New Block" },
  { key: "hardness", label: "Hardness", type: "number", defaultValue: "1.5" },
  { key: "resistance", label: "Blast Resistance", type: "number", defaultValue: "6" },
  { key: "requiresTool", label: "Requires Tool", type: "boolean", defaultValue: "false" },
  { key: "luminance", label: "Light Level (0-15)", type: "number", defaultValue: "0" },
  {
    key: "soundType",
    label: "Sound",
    type: "select",
    options: ["stone", "wood", "metal", "gravel", "grass", "glass", "wool", "sand"],
    defaultValue: "stone",
  },
  { key: "hasItem", label: "Placeable (register BlockItem)", type: "boolean", defaultValue: "true" },
  { key: "creativeTab", label: "Creative Tab", type: "select", options: CREATIVE_TAB_OPTIONS, defaultValue: "custom" },
];

// Vanilla mining-speed multiplier per tool tier — used only to show an approximate break-time
// reference next to the Hardness field, not for exact simulation (ignores enchantments,
// haste/mining-fatigue, underwater, etc).
export const TOOL_TIER_SPEEDS: { label: string; speed: number }[] = [
  { label: "Hand", speed: 1 },
  { label: "Wood", speed: 2 },
  { label: "Stone", speed: 4 },
  { label: "Iron", speed: 6 },
  { label: "Gold", speed: 12 },
  { label: "Diamond", speed: 8 },
  { label: "Netherite", speed: 9 },
];

/** Approximate vanilla break time for a tool tier, given a Hardness value. Reference only. */
export function approxBreakTime(hardness: number, toolSpeed: number, isHand: boolean, requiresTool: boolean): string {
  if (!Number.isFinite(hardness)) return "—";
  if (hardness < 0) return "unbreakable";
  if (hardness === 0) return "instant";
  if (isHand && requiresTool) return "no drops";
  const seconds = (hardness * 1.5) / toolSpeed;
  return seconds < 0.05 ? "instant" : `${seconds.toFixed(2)}s`;
}

export const HARDNESS_REFERENCE = "Dirt 0.5 · Stone 1.5 · Obsidian 50 · Bedrock unbreakable (-1)";
export const RESISTANCE_REFERENCE = "Dirt 0.5 · Stone 6 · Obsidian 1200 · Bedrock 3,600,000";
