import { HeartCrack, WandSparkles, Flag, Frame, SquareFunction, Pickaxe } from "lucide-react";
import type { ElementKindDef } from "./types";
import { json, str, num, bool, list, opts, titleCase, nameOf, textureFile, tagIf } from "./helpers";
import { attributeId, type McVersion } from "@/lib/mcVersion";

/**
 * MCreator element types that are pure datapack/resource-pack content — no
 * Java needed; Minecraft loads them straight from the mod jar's data/ and
 * assets/ folders. Formats match Minecraft 26.2's own vanilla files
 * (checked against data/minecraft/… in the client jar).
 */

const linear = (base: number, perLevel: number) => ({ type: "minecraft:linear", base, per_level_above_first: perLevel });

// ── Damage type ───────────────────────────────────────────────────────────────

const DAMAGE_TYPE_TAGS = [
  "bypasses_armor", "bypasses_shield", "bypasses_invulnerability", "bypasses_effects", "bypasses_resistance",
  "bypasses_enchantments", "is_fire", "is_projectile", "is_explosion", "is_fall", "is_drowning", "is_freezing",
  "is_lightning", "no_knockback", "no_impact", "witch_resistant_to", "always_hurts_ender_dragons",
];

export const DAMAGE_TYPE: ElementKindDef = {
  kind: "damageType",
  label: "Damage type",
  plural: "Damage Types",
  icon: HeartCrack,
  idPrefix: "damage",
  description:
    "A custom kind of damage with its own death message (e.g. \"was zapped by a ray gun\"). Use it from commands — /damage @s 5 <modid>:<id> — or from your own code. Tags control what it bypasses (armor, shields, …).",
  labelField: "name",
  defaults: () => ({
    name: "",
    deathMessage: "%1$s was hurt badly",
    deathMessageAttacker: "%1$s was hurt badly by %2$s",
    scaling: "when_caused_by_living_non_player",
    exhaustion: 0.1,
    effects: "hurt",
    deathMessageType: "default",
    damageTags: [],
  }),
  fields: [
    { key: "name", label: "Name (editor only)", type: "text", placeholder: "Ray gun" },
    { key: "deathMessage", label: "Death message", type: "text", help: "%1$s = the player who died." },
    { key: "deathMessageAttacker", label: "Death message with attacker", type: "text", help: "%2$s = whoever caused it. Leave empty to always use the message above." },
    {
      key: "scaling", label: "Scales with difficulty", type: "select", half: true,
      options: opts(["never", "when_caused_by_living_non_player", "always"], {
        never: "Never", when_caused_by_living_non_player: "When caused by a mob (vanilla default)", always: "Always",
      }),
    },
    { key: "exhaustion", label: "Hunger exhaustion", type: "number", min: 0, half: true },
    {
      key: "effects", label: "Hurt sound", type: "select", half: true,
      options: opts(["hurt", "thorns", "drowning", "burning", "poking", "freezing"], {
        hurt: "Hurt (default)", thorns: "Thorns", drowning: "Drowning", burning: "Burning", poking: "Poking (berry bush)", freezing: "Freezing",
      }),
    },
    {
      key: "deathMessageType", label: "Death message style", type: "select", half: true,
      options: opts(["default", "fall_variants", "intentional_game_design"], {
        default: "Default", fall_variants: "Fall variants", intentional_game_design: "Intentional game design",
      }),
    },
    { key: "damageTags", label: "Properties (damage type tags)", type: "multiselect", options: opts(DAMAGE_TYPE_TAGS, Object.fromEntries(DAMAGE_TYPE_TAGS.map((t) => [t, titleCase(t)]))) },
  ],
  validate: (spec) => (str(spec, "deathMessage").includes("%1$s") ? [] : ["The death message should contain %1$s (the player's name)."]),
  files: (spec, { modId }) => {
    const body: Record<string, unknown> = {
      exhaustion: num(spec, "exhaustion", 0.1),
      message_id: `${modId}.${spec.id}`,
      scaling: str(spec, "scaling", "when_caused_by_living_non_player"),
    };
    if (str(spec, "effects", "hurt") !== "hurt") body.effects = str(spec, "effects");
    if (str(spec, "deathMessageType", "default") !== "default") body.death_message_type = str(spec, "deathMessageType");
    return [{ path: `data/${modId}/damage_type/${spec.id}.json`, content: json(body) }];
  },
  shared: (spec, { modId }) => {
    const key = `death.attack.${modId}.${spec.id}`;
    const attacker = str(spec, "deathMessageAttacker").trim();
    return {
      lang: { [key]: str(spec, "deathMessage"), ...(attacker ? { [`${key}.player`]: attacker } : {}) },
      tags: Object.fromEntries(list<string>(spec, "damageTags").map((t) => [`data/minecraft/tags/damage_type/${t}.json`, [`${modId}:${spec.id}`]])),
    };
  },
};

// ── Enchantment ───────────────────────────────────────────────────────────────

const ENCHANTABLE = [
  "armor", "head_armor", "chest_armor", "leg_armor", "foot_armor", "equippable", "melee_weapon", "sword", "sharp_weapon",
  "weapon", "sweeping", "fire_aspect", "mining", "mining_loot", "durability", "bow", "crossbow", "trident", "mace",
  "fishing", "vanishing",
];
/** #minecraft:enchantable/* tags that exist in only one version (checked against both client jars). */
const ENCHANTABLE_ONLY: Record<string, McVersion> = { sword: "1.21.1", melee_weapon: "26.2", sweeping: "26.2" };
/** The same item group under the other version's tag name. */
const ENCHANTABLE_EQUIVALENT: Record<string, string> = { sword: "melee_weapon", melee_weapon: "sword" };
/** Tag actually written for a version: swaps sword/melee_weapon, else as chosen. */
export function enchantableTag(group: string, version: McVersion): string {
  const only = ENCHANTABLE_ONLY[group];
  return only && only !== version && ENCHANTABLE_EQUIVALENT[group] ? ENCHANTABLE_EQUIVALENT[group] : group;
}
const ATTRIBUTES = [
  "max_health", "movement_speed", "attack_damage", "attack_speed", "attack_knockback", "armor", "armor_toughness",
  "knockback_resistance", "luck", "mining_efficiency", "block_break_speed", "sneaking_speed", "step_height", "jump_strength",
  "safe_fall_distance", "fall_damage_multiplier", "block_interaction_range", "entity_interaction_range", "oxygen_bonus",
  "water_movement_efficiency", "submerged_mining_speed", "gravity", "scale", "burning_time",
];
const EFFECT_KINDS = opts(["damage", "protection", "knockback", "ignite", "attribute", "mob_experience"], {
  damage: "Extra attack damage", protection: "Damage protection", knockback: "Extra knockback",
  ignite: "Set target on fire (seconds)", attribute: "Attribute modifier", mob_experience: "Extra XP from mobs",
});

export const ENCHANTMENT: ElementKindDef = {
  kind: "enchantment",
  label: "Enchantment",
  plural: "Enchantments",
  icon: WandSparkles,
  idPrefix: "enchantment",
  description:
    "A data-driven enchantment: which items it goes on, its levels and costs, and what it does (extra damage, protection, fire, attribute bonuses, …). Shows up in the enchanting table, villager trades and loot depending on the toggles below.",
  labelField: "name",
  defaults: () => ({
    name: "",
    maxLevel: 3,
    weight: 5,
    anvilCost: 2,
    minCostBase: 5, minCostPerLevel: 10,
    maxCostBase: 55, maxCostPerLevel: 10,
    supportedItems: "sharp_weapon",
    slots: ["mainhand"],
    exclusiveSet: "",
    treasure: false,
    tradeable: true,
    onRandomLoot: true,
    curse: false,
    effects: [{ kind: "damage", base: 1, perLevel: 0.5, attribute: "movement_speed", operation: "add_value" }],
  }),
  fields: [
    { key: "name", label: "Name", type: "text", placeholder: "Lifesteal" },
    { key: "maxLevel", label: "Max level", type: "number", min: 1, max: 255, integer: true, half: true },
    { key: "weight", label: "Rarity weight (1 rare – 10 common)", type: "number", min: 1, max: 1024, integer: true, half: true },
    {
      key: "supportedItems", label: "Works on", type: "select", half: true,
      options: opts(ENCHANTABLE, Object.fromEntries(ENCHANTABLE.map((t) => [t, ENCHANTABLE_ONLY[t] ? `${titleCase(t)} (${ENCHANTABLE_ONLY[t]} only)` : titleCase(t)]))),
    },
    { key: "anvilCost", label: "Anvil cost", type: "number", min: 0, integer: true, half: true },
    { key: "slots", label: "Active while in slot", type: "multiselect", options: opts(["mainhand", "offhand", "hand", "head", "chest", "legs", "feet", "armor", "body", "any"], { mainhand: "Main hand", offhand: "Off hand", hand: "Either hand", head: "Head", chest: "Chest", legs: "Legs", feet: "Feet", armor: "Any armor slot", body: "Body (animals)", any: "Any" }) },
    { key: "minCostBase", label: "Min enchanting cost (level I)", type: "number", min: 0, integer: true, half: true },
    { key: "minCostPerLevel", label: "… per extra level", type: "number", min: 0, integer: true, half: true },
    { key: "maxCostBase", label: "Max enchanting cost (level I)", type: "number", min: 0, integer: true, half: true },
    { key: "maxCostPerLevel", label: "… per extra level", type: "number", min: 0, integer: true, half: true },
    {
      key: "exclusiveSet", label: "Incompatible with", type: "select",
      options: [{ value: "", label: "Nothing" }, ...opts(["armor", "damage", "boots", "bow", "crossbow", "mining", "riptide"], {
        armor: "Protection enchantments", damage: "Sharpness/Smite/…", boots: "Frost Walker/Depth Strider", bow: "Infinity/Mending",
        crossbow: "Multishot/Piercing", mining: "Fortune/Silk Touch", riptide: "Riptide/Loyalty/Channeling",
      }).map((o) => ({ ...o, value: `#minecraft:exclusive_set/${o.value}` }))],
    },
    { key: "treasure", label: "Treasure (not in the enchanting table)", type: "boolean", half: true },
    { key: "curse", label: "Curse", type: "boolean", half: true },
    { key: "tradeable", label: "Sold by librarians", type: "boolean", half: true },
    { key: "onRandomLoot", label: "On random loot", type: "boolean", half: true },
    {
      key: "effects", label: "Effects", type: "list", itemLabel: "Effect",
      newItem: () => ({ kind: "damage", base: 1, perLevel: 1, attribute: "movement_speed", operation: "add_value" }),
      fields: [
        { key: "kind", label: "Effect", type: "select", options: EFFECT_KINDS },
        { key: "base", label: "Amount at level I", type: "number", half: true },
        { key: "perLevel", label: "… added per extra level", type: "number", half: true },
        { key: "attribute", label: "Attribute", type: "select", half: true, options: opts(ATTRIBUTES, Object.fromEntries(ATTRIBUTES.map((a) => [a, titleCase(a)]))), when: (e) => e.kind === "attribute" },
        { key: "operation", label: "Operation", type: "select", half: true, when: (e) => e.kind === "attribute", options: opts(["add_value", "add_multiplied_base", "add_multiplied_total"], { add_value: "Add", add_multiplied_base: "Add × base (%)", add_multiplied_total: "Multiply total (%)" }) },
      ],
    },
  ],
  validate: (spec, { mcVersion }) => {
    const problems: string[] = [];
    const group = str(spec, "supportedItems");
    if (ENCHANTABLE_ONLY[group] && ENCHANTABLE_ONLY[group] !== mcVersion && !ENCHANTABLE_EQUIVALENT[group]) {
      problems.push(`"${titleCase(group)}" doesn't exist in Minecraft ${mcVersion} — pick another item group.`);
    }
    if (list(spec, "slots").length === 0) problems.push("Pick at least one slot, or the enchantment never takes effect.");
    if (list(spec, "effects").length === 0) problems.push("No effects — the enchantment would do nothing.");
    return problems;
  },
  files: (spec, { modId, mcVersion }) => {
    const effects: Record<string, unknown[]> = {};
    const add = (component: string, entry: unknown) => { (effects[component] ??= []).push(entry); };
    list<Record<string, unknown>>(spec, "effects").forEach((e, i) => {
      const value = linear(Number(e.base) || 0, Number(e.perLevel) || 0);
      switch (e.kind) {
        case "damage": add("minecraft:damage", { effect: { type: "minecraft:add", value } }); break;
        case "protection": add("minecraft:damage_protection", {
          effect: { type: "minecraft:add", value },
          requirements: { condition: "minecraft:damage_source_properties", predicate: { tags: [{ expected: false, id: "minecraft:bypasses_invulnerability" }] } },
        }); break;
        case "knockback": add("minecraft:knockback", { effect: { type: "minecraft:add", value } }); break;
        case "ignite": add("minecraft:post_attack", {
          affected: "victim", enchanted: "attacker",
          effect: { type: "minecraft:ignite", duration: value },
          requirements: { condition: "minecraft:damage_source_properties", predicate: { is_direct: true } },
        }); break;
        case "attribute": add("minecraft:attributes", {
          amount: value, attribute: attributeId(String(e.attribute || "movement_speed"), mcVersion),
          id: `${modId}:enchantment.${spec.id}.${i}`, operation: e.operation || "add_value",
        }); break;
        case "mob_experience": add("minecraft:mob_experience", { effect: { type: "minecraft:add", value } }); break;
      }
    });
    const supported = `#minecraft:enchantable/${enchantableTag(str(spec, "supportedItems", "sharp_weapon"), mcVersion)}`;
    const body: Record<string, unknown> = {
      anvil_cost: num(spec, "anvilCost", 1),
      description: { translate: `enchantment.${modId}.${spec.id}` },
      effects,
      ...(str(spec, "exclusiveSet") ? { exclusive_set: str(spec, "exclusiveSet") } : {}),
      max_cost: { base: num(spec, "maxCostBase", 50), per_level_above_first: num(spec, "maxCostPerLevel", 10) },
      max_level: Math.max(1, Math.round(num(spec, "maxLevel", 1))),
      min_cost: { base: num(spec, "minCostBase", 1), per_level_above_first: num(spec, "minCostPerLevel", 10) },
      primary_items: supported,
      slots: list<string>(spec, "slots"),
      supported_items: supported,
      weight: Math.max(1, Math.round(num(spec, "weight", 5))),
    };
    return [{ path: `data/${modId}/enchantment/${spec.id}.json`, content: json(body) }];
  },
  shared: (spec, { modId }) => {
    const id = `${modId}:${spec.id}`;
    const tag = (name: string) => `data/minecraft/tags/enchantment/${name}.json`;
    const tags: Record<string, string[]> = { [tag(bool(spec, "treasure") ? "treasure" : "non_treasure")]: [id] };
    // non_treasure is already part of tradeable/on_random_loot via "#minecraft:non_treasure" — only treasure ones need adding.
    if (bool(spec, "treasure") && bool(spec, "tradeable")) tags[tag("tradeable")] = [id];
    if (bool(spec, "treasure") && bool(spec, "onRandomLoot")) tags[tag("on_random_loot")] = [id];
    if (bool(spec, "curse")) tags[tag("curse")] = [id];
    return { lang: { [`enchantment.${modId}.${spec.id}`]: nameOf(spec) }, tags };
  },
};

// ── Banner pattern ────────────────────────────────────────────────────────────

const DYE_COLORS = [
  "white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
  "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black",
];

export const BANNER_PATTERN: ElementKindDef = {
  kind: "bannerPattern",
  label: "Banner pattern",
  plural: "Banner Patterns",
  icon: Flag,
  idPrefix: "pattern",
  description:
    "A new banner (and shield) pattern for the loom. Draw it white-on-transparent at 64×64 like vanilla's entity/banner textures — the dye colour tints the white.",
  labelField: "name",
  thumb: (spec) => str(spec, "texture") || undefined,
  defaults: () => ({ name: "", texture: "", shieldTexture: "", noItemRequired: true }),
  fields: [
    { key: "name", label: "Name", type: "text", placeholder: "Skull", help: "Shown as e.g. \"Red Skull\" on the banner tooltip." },
    { key: "texture", label: "Banner texture (64×64)", type: "texture", half: true },
    { key: "shieldTexture", label: "Shield texture (optional)", type: "texture", half: true, help: "Leave empty to reuse the banner texture." },
    { key: "noItemRequired", label: "Available in the loom without a pattern item", type: "boolean", help: "Turn off only if you add your own banner pattern item in code." },
  ],
  validate: (spec) => (str(spec, "texture") ? [] : ["Pick a banner texture."]),
  textures: (spec) => [str(spec, "texture"), str(spec, "shieldTexture")].filter(Boolean),
  files: (spec, { modId, texture }) => [
    { path: `data/${modId}/banner_pattern/${spec.id}.json`, content: json({ asset_id: `${modId}:${spec.id}`, translation_key: `block.${modId}.banner.${spec.id}` }) },
    ...textureFile(`assets/${modId}/textures/entity/banner/${spec.id}.png`, str(spec, "texture"), texture),
    ...textureFile(`assets/${modId}/textures/entity/shield/${spec.id}.png`, str(spec, "shieldTexture") || str(spec, "texture"), texture),
  ],
  shared: (spec, { modId }) => ({
    lang: Object.fromEntries(DYE_COLORS.map((c) => [`block.${modId}.banner.${spec.id}.${c}`, `${titleCase(c)} ${nameOf(spec)}`])),
    tags: tagIf(bool(spec, "noItemRequired"), "data/minecraft/tags/banner_pattern/no_item_required.json", `${modId}:${spec.id}`),
  }),
};

// ── Painting ──────────────────────────────────────────────────────────────────

export const PAINTING: ElementKindDef = {
  kind: "painting",
  label: "Painting",
  plural: "Paintings",
  icon: Frame,
  idPrefix: "painting",
  description:
    "A new painting variant. The texture is 16 pixels per block (a 2×1 painting is 32×16). \"Placeable\" makes it show up when players hang a random painting.",
  labelField: "name",
  thumb: (spec) => str(spec, "texture") || undefined,
  defaults: () => ({ name: "", author: "", texture: "", width: 1, height: 1, placeable: true }),
  fields: [
    { key: "name", label: "Title", type: "text", half: true },
    { key: "author", label: "Author", type: "text", half: true },
    { key: "width", label: "Width (blocks)", type: "number", min: 1, max: 16, integer: true, half: true },
    { key: "height", label: "Height (blocks)", type: "number", min: 1, max: 16, integer: true, half: true },
    { key: "texture", label: "Texture (16 px per block)", type: "texture" },
    { key: "placeable", label: "Placeable at random", type: "boolean" },
  ],
  validate: (spec) => (str(spec, "texture") ? [] : ["Pick a texture."]),
  textures: (spec) => [str(spec, "texture")].filter(Boolean),
  files: (spec, { modId, mcVersion, texture }) => {
    const body: Record<string, unknown> = {
      asset_id: `${modId}:${spec.id}`,
      height: Math.max(1, Math.min(16, Math.round(num(spec, "height", 1)))),
      width: Math.max(1, Math.min(16, Math.round(num(spec, "width", 1)))),
    };
    // 1.21.2+ names paintings via explicit title/author components; 1.21.1 always reads the
    // painting.<ns>.<id>.title/.author lang keys itself (both versions get those keys below).
    if (mcVersion !== "1.21.1") {
      body.title = { color: "yellow", translate: `painting.${modId}.${spec.id}.title` };
      if (str(spec, "author").trim()) body.author = { color: "gray", translate: `painting.${modId}.${spec.id}.author` };
    }
    return [
      { path: `data/${modId}/painting_variant/${spec.id}.json`, content: json(body) },
      ...textureFile(`assets/${modId}/textures/painting/${spec.id}.png`, str(spec, "texture"), texture),
    ];
  },
  shared: (spec, { modId }) => ({
    lang: {
      [`painting.${modId}.${spec.id}.title`]: nameOf(spec),
      ...(str(spec, "author").trim() ? { [`painting.${modId}.${spec.id}.author`]: str(spec, "author").trim() } : {}),
    },
    tags: tagIf(bool(spec, "placeable"), "data/minecraft/tags/painting_variant/placeable.json", `${modId}:${spec.id}`),
  }),
};

// ── Function ──────────────────────────────────────────────────────────────────

/** mcfunction lines can't start with "/" — strip it like players type it in chat. */
export function mcfunctionBody(code: string): string {
  return code.split("\n").map((line) => line.replace(/^(\s*)\/+/, "$1")).join("\n").trimEnd() + "\n";
}

export const FUNCTION: ElementKindDef = {
  kind: "function",
  label: "Function",
  plural: "Functions",
  icon: SquareFunction,
  idPrefix: "function",
  description:
    "A list of commands (an .mcfunction file). Run it with /function <modid>:<id>, or let it run automatically when the world loads or every tick.",
  defaults: () => ({ code: "say Hello from my mod!", runOnLoad: false, runEveryTick: false }),
  fields: [
    { key: "code", label: "Commands (one per line, # for comments)", type: "textarea", rows: 14, mono: true },
    { key: "runOnLoad", label: "Run when the world loads (/reload)", type: "boolean", half: true },
    { key: "runEveryTick", label: "Run every tick (20× per second)", type: "boolean", half: true },
  ],
  validate: (spec) => (str(spec, "code").trim() ? [] : ["The function has no commands."]),
  files: (spec, { modId }) => [{ path: `data/${modId}/function/${spec.id}.mcfunction`, content: mcfunctionBody(str(spec, "code")) }],
  shared: (spec, { modId }) => ({
    tags: {
      ...tagIf(bool(spec, "runOnLoad"), "data/minecraft/tags/function/load.json", `${modId}:${spec.id}`),
      ...tagIf(bool(spec, "runEveryTick"), "data/minecraft/tags/function/tick.json", `${modId}:${spec.id}`),
    },
  }),
};

// ── Feature (ore generation) ──────────────────────────────────────────────────

const ORE_HOSTS: Record<string, { label: string; biomes: string }> = {
  overworld: { label: "Stone & deepslate (Overworld)", biomes: "#minecraft:is_overworld" },
  stone: { label: "Stone only (Overworld)", biomes: "#minecraft:is_overworld" },
  deepslate: { label: "Deepslate only (Overworld)", biomes: "#minecraft:is_overworld" },
  netherrack: { label: "Netherrack (Nether)", biomes: "#minecraft:is_nether" },
  end_stone: { label: "End stone (End)", biomes: "#minecraft:is_end" },
};

export const FEATURE: ElementKindDef = {
  kind: "feature",
  label: "Feature",
  plural: "Features",
  icon: Pickaxe,
  idPrefix: "ore",
  description:
    "World generation: veins of a block (usually your ore) generated in new chunks, like vanilla diamond or coal ore. Only affects chunks generated after the mod is installed.",
  defaults: () => ({
    block: "", deepslateBlock: "", host: "overworld", size: 8, count: 8, minY: -64, maxY: 64,
    distribution: "uniform", airExposureDiscard: 0, biomes: "",
  }),
  fields: [
    {
      key: "block", label: "Ore block", type: "registry", half: true, placeholder: "mymod:ruby_ore",
      suggestions: (ctx) => [...ctx.projectBlocks, "minecraft:diamond_ore", "minecraft:iron_ore", "minecraft:stone"],
    },
    {
      key: "deepslateBlock", label: "Deepslate variant (optional)", type: "registry", half: true, placeholder: "mymod:deepslate_ruby_ore",
      suggestions: (ctx) => ctx.projectBlocks, when: (s) => s.host === "overworld",
      help: "Placed where the vein runs through deepslate. Empty = same block.",
    },
    { key: "host", label: "Replaces", type: "select", options: Object.entries(ORE_HOSTS).map(([value, h]) => ({ value, label: h.label })) },
    { key: "size", label: "Vein size (blocks)", type: "number", min: 1, max: 64, integer: true, half: true },
    { key: "count", label: "Veins per chunk", type: "number", min: 1, max: 256, integer: true, half: true },
    { key: "minY", label: "Min height (Y)", type: "number", min: -64, max: 320, integer: true, half: true },
    { key: "maxY", label: "Max height (Y)", type: "number", min: -64, max: 320, integer: true, half: true },
    {
      key: "distribution", label: "Height distribution", type: "select", half: true,
      options: opts(["uniform", "trapezoid"], { uniform: "Even between min and max", trapezoid: "Most common in the middle" }),
    },
    { key: "airExposureDiscard", label: "Skip when touching air (0–1)", type: "number", min: 0, max: 1, half: true, help: "Diamonds use 0.5: veins exposed to caves are rarer." },
    { key: "biomes", label: "Biomes (optional override)", type: "text", mono: true, placeholder: "#minecraft:is_overworld", help: "A biome tag (#…) or one biome id. Empty = every biome of the chosen dimension." },
  ],
  validate: (spec) => {
    const problems: string[] = [];
    if (!str(spec, "block").includes(":")) problems.push("Ore block must be a full id like mymod:ruby_ore.");
    if (num(spec, "minY") > num(spec, "maxY")) problems.push("Min height is above max height.");
    return problems;
  },
  files: (spec, { modId }) => {
    const block = str(spec, "block");
    const host = str(spec, "host", "overworld");
    const tagTarget = (tag: string, state: string) => ({ state: { Name: state }, target: { predicate_type: "minecraft:tag_match", tag } });
    const blockTarget = (match: string, state: string) => ({ state: { Name: state }, target: { predicate_type: "minecraft:block_match", block: match } });
    const targets =
      host === "overworld" ? [tagTarget("minecraft:stone_ore_replaceables", block), tagTarget("minecraft:deepslate_ore_replaceables", str(spec, "deepslateBlock") || block)]
      : host === "stone" ? [tagTarget("minecraft:stone_ore_replaceables", block)]
      : host === "deepslate" ? [tagTarget("minecraft:deepslate_ore_replaceables", block)]
      : host === "netherrack" ? [blockTarget("minecraft:netherrack", block)]
      : [blockTarget("minecraft:end_stone", block)];
    const configured = {
      type: "minecraft:ore",
      config: { discard_chance_on_air_exposure: Math.max(0, Math.min(1, num(spec, "airExposureDiscard"))), size: Math.max(1, Math.round(num(spec, "size", 8))), targets },
    };
    const placed = {
      feature: `${modId}:${spec.id}`,
      placement: [
        { type: "minecraft:count", count: Math.max(1, Math.round(num(spec, "count", 8))) },
        { type: "minecraft:in_square" },
        {
          type: "minecraft:height_range",
          height: {
            type: str(spec, "distribution") === "trapezoid" ? "minecraft:trapezoid" : "minecraft:uniform",
            max_inclusive: { absolute: Math.round(num(spec, "maxY", 64)) },
            min_inclusive: { absolute: Math.round(num(spec, "minY", -64)) },
          },
        },
        { type: "minecraft:biome" },
      ],
    };
    const modifier = {
      type: "neoforge:add_features",
      biomes: str(spec, "biomes").trim() || ORE_HOSTS[host]?.biomes || "#minecraft:is_overworld",
      features: `${modId}:${spec.id}`,
      step: "underground_ores",
    };
    return [
      { path: `data/${modId}/worldgen/configured_feature/${spec.id}.json`, content: json(configured) },
      { path: `data/${modId}/worldgen/placed_feature/${spec.id}.json`, content: json(placed) },
      { path: `data/${modId}/neoforge/biome_modifier/${spec.id}.json`, content: json(modifier) },
    ];
  },
};

export const DATAPACK_KINDS: ElementKindDef[] = [DAMAGE_TYPE, ENCHANTMENT, BANNER_PATTERN, PAINTING, FUNCTION, FEATURE];
