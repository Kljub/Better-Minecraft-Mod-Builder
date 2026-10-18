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
    drops: [],
    hurtDrops: [],
  };
}

/** One death drop (→ loot table pool). */
export interface DeathDrop { item: string; min: number; max: number; chance: number; lootingBonus: number; playerKillOnly: boolean; smeltWhenOnFire: boolean }
/** One drop rolled every time the mob takes damage (runtime). */
export interface HurtDrop { item: string; min: number; max: number; chance: number; playerOnly: boolean }

/** Common drops first, then the project's own items and blocks. */
const DROP_ITEMS = [
  "minecraft:rotten_flesh", "minecraft:bone", "minecraft:string", "minecraft:gunpowder", "minecraft:leather", "minecraft:feather",
  "minecraft:beef", "minecraft:porkchop", "minecraft:chicken", "minecraft:mutton", "minecraft:rabbit_hide", "minecraft:slime_ball",
  "minecraft:ender_pearl", "minecraft:blaze_rod", "minecraft:spider_eye", "minecraft:phantom_membrane", "minecraft:ink_sac",
  "minecraft:iron_ingot", "minecraft:gold_nugget", "minecraft:emerald", "minecraft:diamond", "minecraft:experience_bottle",
];
const dropItems = (ctx: { projectItems?: string[]; projectBlocks?: string[] }) => [...(ctx.projectItems ?? []), ...(ctx.projectBlocks ?? []), ...DROP_ITEMS];

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
  {
    key: "drops", label: "Drops on death (loot table)", type: "list", itemLabel: "Drop",
    help: "Each drop is rolled on its own. Looting adds up to the bonus per level.",
    newItem: () => ({ item: "minecraft:rotten_flesh", min: 0, max: 2, chance: 1, lootingBonus: 1, playerKillOnly: false, smeltWhenOnFire: false }),
    fields: [
      { key: "item", label: "Item", type: "registry", suggestions: dropItems, placeholder: "minecraft:bone" },
      { key: "min", label: "Count min", type: "number", min: 0, max: 64, integer: true, half: true },
      { key: "max", label: "Count max", type: "number", min: 0, max: 64, integer: true, half: true },
      { key: "chance", label: "Chance (0–1)", type: "number", min: 0, max: 1, half: true },
      { key: "lootingBonus", label: "+ per Looting level", type: "number", min: 0, max: 16, integer: true, half: true },
      { key: "playerKillOnly", label: "Only when killed by a player", type: "boolean", half: true },
      { key: "smeltWhenOnFire", label: "Cooked if it dies burning", type: "boolean", half: true },
    ],
  },
  {
    key: "hurtDrops", label: "Drops when hurt", type: "list", itemLabel: "Hurt drop",
    help: "Rolled every time the mob takes damage, like a sheep losing wool. NeoForge only (Bedrock add-ons ignore it).",
    newItem: () => ({ item: "minecraft:feather", min: 1, max: 1, chance: 0.25, playerOnly: true }),
    fields: [
      { key: "item", label: "Item", type: "registry", suggestions: dropItems, placeholder: "minecraft:feather" },
      { key: "min", label: "Count min", type: "number", min: 1, max: 64, integer: true, half: true },
      { key: "max", label: "Count max", type: "number", min: 1, max: 64, integer: true, half: true },
      { key: "chance", label: "Chance per hit (0–1)", type: "number", min: 0, max: 1, half: true },
      { key: "playerOnly", label: "Only when a player hits it", type: "boolean", half: true },
    ],
  },
  { key: "spawnEgg", label: "Spawn egg", type: "boolean" },
  { key: "eggPrimary", label: "Egg base colour", type: "color", half: true, when: (s) => s.spawnEgg === true },
  { key: "eggSecondary", label: "Egg spots colour", type: "color", half: true, when: (s) => s.spawnEgg === true },
  { key: "naturalSpawn", label: "Spawns naturally", type: "boolean" },
  { key: "spawnBiomes", label: "Biomes (tag or id)", type: "text", mono: true, when: (s) => s.naturalSpawn === true, placeholder: "#minecraft:is_overworld" },
  { key: "spawnWeight", label: "Spawn weight", type: "number", min: 1, max: 1000, integer: true, half: true, when: (s) => s.naturalSpawn === true },
  { key: "spawnMin", label: "Group size min", type: "number", min: 1, max: 64, integer: true, half: true, when: (s) => s.naturalSpawn === true },
  { key: "spawnMax", label: "Group size max", type: "number", min: 1, max: 64, integer: true, half: true, when: (s) => s.naturalSpawn === true },
];

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const itemId = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Sanitised death drops (empty item ids dropped, counts/chances clamped). */
export function deathDrops(settings: Record<string, unknown>): DeathDrop[] {
  const list = Array.isArray(settings.drops) ? (settings.drops as Record<string, unknown>[]) : [];
  return list.filter((d) => itemId(d.item)).map((d) => {
    const min = Math.max(0, Math.round(num(d.min, 1)));
    return {
      item: itemId(d.item), min, max: Math.max(min, Math.round(num(d.max, min))),
      chance: Math.min(1, Math.max(0, num(d.chance, 1))), lootingBonus: Math.max(0, Math.round(num(d.lootingBonus, 0))),
      playerKillOnly: d.playerKillOnly === true, smeltWhenOnFire: d.smeltWhenOnFire === true,
    };
  });
}

export function hurtDrops(settings: Record<string, unknown>): HurtDrop[] {
  const list = Array.isArray(settings.hurtDrops) ? (settings.hurtDrops as Record<string, unknown>[]) : [];
  return list.filter((d) => itemId(d.item)).map((d) => {
    const min = Math.max(1, Math.round(num(d.min, 1)));
    return { item: itemId(d.item), min, max: Math.max(min, Math.round(num(d.max, min))), chance: Math.min(1, Math.max(0, num(d.chance, 0.25))), playerOnly: d.playerOnly === true };
  });
}

const countFn = (min: number, max: number) =>
  ({ function: "minecraft:set_count", count: min === max ? min : { type: "minecraft:uniform", min, max } });

/** Java loot table (data/<modid>/loot_table/entities/<id>.json), same shape as vanilla mobs'. */
export function javaLootTable(drops: DeathDrop[], modId: string, id: string, mcVersion: string): Record<string, unknown> {
  // 1.21.1 entity predicates use plain "flags"; 26.x writes sub-predicates with their registry id.
  const onFire = mcVersion === "1.21.1" ? { flags: { is_on_fire: true } } : { "minecraft:flags": { is_on_fire: true } };
  return {
    type: "minecraft:entity",
    pools: drops.map((d) => {
      const functions: Record<string, unknown>[] = [countFn(d.min, d.max)];
      if (d.smeltWhenOnFire) functions.push({ function: "minecraft:furnace_smelt", conditions: [{ condition: "minecraft:entity_properties", entity: "this", predicate: onFire }] });
      if (d.lootingBonus > 0) functions.push({ function: "minecraft:enchanted_count_increase", enchantment: "minecraft:looting", count: { type: "minecraft:uniform", min: 0, max: d.lootingBonus } });
      const conditions: Record<string, unknown>[] = [];
      if (d.playerKillOnly) conditions.push({ condition: "minecraft:killed_by_player" });
      if (d.chance < 1) conditions.push({ condition: "minecraft:random_chance", chance: d.chance });
      return { rolls: 1, entries: [{ type: "minecraft:item", name: d.item, functions }], ...(conditions.length ? { conditions } : {}) };
    }),
    random_sequence: `${modId}:entities/${id}`,
  };
}

/** Bedrock loot table (behavior pack loot_tables/entities/<id>.json). */
export function bedrockLootTable(drops: DeathDrop[]): Record<string, unknown> {
  return {
    pools: drops.map((d) => {
      const functions: Record<string, unknown>[] = [{ function: "set_count", count: { min: d.min, max: d.max } }];
      if (d.smeltWhenOnFire) functions.push({ function: "furnace_smelt", conditions: [{ condition: "entity_properties", entity: "this", properties: { on_fire: true } }] });
      if (d.lootingBonus > 0) functions.push({ function: "looting_enchant", count: { min: 0, max: d.lootingBonus } });
      const conditions: Record<string, unknown>[] = [];
      if (d.playerKillOnly) conditions.push({ condition: "killed_by_player" });
      if (d.chance < 1) conditions.push({ condition: "random_chance", chance: d.chance });
      return { rolls: 1, entries: [{ type: "item", name: d.item, weight: 1, functions }], ...(conditions.length ? { conditions } : {}) };
    }),
  };
}
