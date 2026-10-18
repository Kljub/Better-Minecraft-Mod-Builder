import type { FieldDef, SelectOption } from "./types";

/**
 * "Settings" tab of an Entity Model: what the mob is in game (stats, behaviour, damage type,
 * spawning, spawn egg, which animations play when). Stored on the element as `entity`.
 */
const opts = (pairs: [string, string][]): SelectOption[] => pairs.map(([value, label]) => ({ value, label }));

export function defaultEntitySettings(): Record<string, unknown> {
  return {
    displayName: "",
    mobCategory: "creature",
    behavior: "passive",
    maxHealth: 20,
    movementSpeed: 0.25,
    attackDamage: 3,
    armor: 0,
    knockbackResistance: 0,
    followRange: 16,
    hitboxWidth: 0.6,
    hitboxHeight: 1.8,
    damageType: "minecraft:mob_attack",
    xpReward: 5,
    fireImmune: false,
    spawnEgg: true,
    eggPrimary: "#5a8f3c",
    eggSecondary: "#2d4a1e",
    naturalSpawn: false,
    spawnBiomes: "#minecraft:is_overworld",
    spawnWeight: 10,
    spawnMin: 1,
    spawnMax: 3,
    idleAnimation: "",
    walkAnimation: "",
    attackAnimation: "",
  };
}

const anim = (ctx: { animationNames?: string[] }) => ctx.animationNames ?? [];

export const ENTITY_SETTINGS_FIELDS: FieldDef[] = [
  { key: "displayName", label: "Display name", type: "text", placeholder: "Rail Gnawer" },
  {
    key: "behavior", label: "Behaviour", type: "select", half: true,
    options: opts([["passive", "Passive (wanders, flees when hit)"], ["neutral", "Neutral (fights back)"], ["hostile_melee", "Hostile (melee attacks players)"], ["stationary", "Stationary (doesn't move)"]]),
  },
  {
    key: "mobCategory", label: "Mob category", type: "select", half: true,
    options: opts([["creature", "Creature"], ["monster", "Monster"], ["ambient", "Ambient"], ["water_creature", "Water creature"], ["water_ambient", "Water ambient"], ["misc", "Misc"]]),
  },
  { key: "maxHealth", label: "Max health (2 = 1 heart)", type: "number", min: 1, max: 1024, half: true },
  { key: "movementSpeed", label: "Movement speed (zombie 0.23)", type: "number", min: 0, max: 2, half: true },
  { key: "attackDamage", label: "Attack damage", type: "number", min: 0, max: 2048, half: true, when: (s) => s.behavior !== "passive" && s.behavior !== "stationary" },
  {
    key: "damageType", label: "Damage type", type: "registry", half: true, placeholder: "minecraft:mob_attack",
    suggestions: (ctx) => [...(ctx.elementIds?.damageType ?? []), "minecraft:mob_attack", "minecraft:generic", "minecraft:magic", "minecraft:sting", "minecraft:thorns"],
    when: (s) => s.behavior !== "passive" && s.behavior !== "stationary",
    help: "Your own Damage Types are suggested first.",
  },
  { key: "armor", label: "Armor", type: "number", min: 0, max: 30, half: true },
  { key: "knockbackResistance", label: "Knockback resistance (0–1)", type: "number", min: 0, max: 1, half: true },
  { key: "followRange", label: "Follow range (blocks)", type: "number", min: 1, max: 2048, half: true },
  { key: "xpReward", label: "XP dropped", type: "number", min: 0, max: 1000, integer: true, half: true },
  { key: "hitboxWidth", label: "Hitbox width (blocks)", type: "number", min: 0.05, max: 16, half: true },
  { key: "hitboxHeight", label: "Hitbox height (blocks)", type: "number", min: 0.05, max: 16, half: true },
  { key: "fireImmune", label: "Immune to fire & lava", type: "boolean" },
  { key: "idleAnimation", label: "Idle animation", type: "registry", half: true, suggestions: anim, placeholder: "idle" },
  { key: "walkAnimation", label: "Walk animation", type: "registry", half: true, suggestions: anim, placeholder: "walk" },
  { key: "attackAnimation", label: "Attack animation", type: "registry", half: true, suggestions: anim, placeholder: "attack", when: (s) => s.behavior !== "passive" && s.behavior !== "stationary" },
  { key: "spawnEgg", label: "Spawn egg", type: "boolean" },
  { key: "eggPrimary", label: "Egg base colour", type: "color", half: true, when: (s) => s.spawnEgg === true },
  { key: "eggSecondary", label: "Egg spots colour", type: "color", half: true, when: (s) => s.spawnEgg === true },
  { key: "naturalSpawn", label: "Spawns naturally", type: "boolean" },
  { key: "spawnBiomes", label: "Biomes (tag or id)", type: "text", mono: true, when: (s) => s.naturalSpawn === true, placeholder: "#minecraft:is_overworld" },
  { key: "spawnWeight", label: "Spawn weight", type: "number", min: 1, max: 1000, integer: true, half: true, when: (s) => s.naturalSpawn === true },
  { key: "spawnMin", label: "Group size min", type: "number", min: 1, max: 64, integer: true, half: true, when: (s) => s.naturalSpawn === true },
  { key: "spawnMax", label: "Group size max", type: "number", min: 1, max: 64, integer: true, half: true, when: (s) => s.naturalSpawn === true },
];
