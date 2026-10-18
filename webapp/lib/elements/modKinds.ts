import { Terminal, Gavel, Droplets, BriefcaseBusiness, Sprout, Atom, Keyboard, Sailboat, Crosshair, Shirt, Castle } from "lucide-react";
import type { ElementKindDef, ElementSpec } from "./types";
import { json, str, num, bool, list, opts, nameOf, textureFile, tagIf } from "./helpers";

/**
 * MCreator element types that need real Java registration — a datapack can't add a command or a
 * game rule. Each contributes a `manifest` entry (assets/<modId>/screenspec/elements/<name>.json)
 * that neoforge-runtime's ModElements registers at mod construction. Field names must stay in
 * sync with the matching *Spec.java in neoforge-runtime.
 */

const lines = (code: string) => code.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

// ── Command ──────────────────────────────────────────────────────────────────

const PERMISSION_LEVELS = opts(["0", "1", "2", "3", "4"], {
  "0": "0 — everyone",
  "1": "1 — moderators",
  "2": "2 — game masters (command blocks)",
  "3": "3 — admins",
  "4": "4 — server owner",
});

const COMMAND_ARGUMENTS = opts(["none", "player", "integer", "text"], {
  none: "None",
  player: "A player",
  integer: "A whole number",
  text: "Free text (rest of the line)",
});

export const COMMAND: ElementKindDef = {
  kind: "command",
  label: "Command",
  plural: "Commands",
  icon: Terminal,
  idPrefix: "command",
  description:
    "A new chat command — the id is what players type (/<id>). It runs your vanilla commands in order, as the player who typed it. An optional argument is inserted wherever $(arg) appears.",
  defaults: () => ({
    permissionLevel: "0",
    argument: "none",
    argumentName: "value",
    elevate: false,
    commands: "effect give @s minecraft:regeneration 5 2",
    feedback: "",
  }),
  fields: [
    { key: "permissionLevel", label: "Who can use it", type: "select", options: PERMISSION_LEVELS, half: true },
    { key: "argument", label: "Argument", type: "select", options: COMMAND_ARGUMENTS, half: true },
    {
      key: "argumentName", label: "Argument name (shown in chat suggestions)", type: "text", mono: true,
      when: (s) => str(s, "argument", "none") !== "none",
    },
    {
      key: "commands", label: "Commands to run (one per line, # for comments, $(arg) = the argument)", type: "textarea", rows: 8, mono: true,
    },
    {
      key: "elevate", label: "Run with the permission level above (not the player's own)", type: "boolean",
      help: "Lets e.g. a level-0 /heal use /effect for non-op players. Not allowed together with a free-text argument.",
    },
    { key: "feedback", label: "Chat message afterwards (optional, $(arg) allowed)", type: "text" },
  ],
  validate: (spec) => {
    const problems: string[] = [];
    if (!/^[a-z0-9_-]+$/.test(spec.id)) problems.push("The id is the command name — only a-z, 0-9, _ and -.");
    if (lines(str(spec, "commands")).length === 0) problems.push("The command runs nothing.");
    if (bool(spec, "elevate") && str(spec, "argument") === "text") {
      problems.push("A free-text argument can't be combined with elevated permissions — players could inject their own commands.");
    }
    if (str(spec, "argument", "none") !== "none" && !/^[a-z0-9_]+$/i.test(str(spec, "argumentName", "value"))) {
      problems.push("Argument name: only letters, digits and _.");
    }
    return problems;
  },
  files: () => [],
  shared: (spec) => ({
    manifest: {
      commands: {
        id: spec.id,
        permissionLevel: Math.max(0, Math.min(4, Number(str(spec, "permissionLevel", "0")) || 0)),
        argument: str(spec, "argument", "none"),
        argumentName: str(spec, "argumentName", "value") || "value",
        elevate: bool(spec, "elevate"),
        commands: lines(str(spec, "commands")).map((l) => l.replace(/^\/+/, "")),
        feedback: str(spec, "feedback"),
      },
    },
  }),
};

// ── Game rule ────────────────────────────────────────────────────────────────

const GAME_RULE_CATEGORIES = opts(["player", "mobs", "spawning", "drops", "updates", "chat", "misc"], {
  player: "Player", mobs: "Mobs", spawning: "Spawning", drops: "Drops", updates: "World updates", chat: "Chat", misc: "Misc",
});

export const GAME_RULE: ElementKindDef = {
  kind: "gameRule",
  label: "Game rule",
  plural: "Game Rules",
  icon: Gavel,
  idPrefix: "game_rule",
  description:
    "A new game rule — changed with /gamerule <modid>:<id> and listed in the world-creation Game Rules screen. Commands and functions can read it via execute store; mod code via GameRuleSpecs.getBoolean/getInteger.",
  labelField: "name",
  defaults: () => ({ name: "", description: "", type: "boolean", category: "misc", defaultBoolean: true, defaultInteger: 0, min: 0, max: 100 }),
  fields: [
    { key: "name", label: "Display name", type: "text", half: true },
    { key: "category", label: "Category", type: "select", options: GAME_RULE_CATEGORIES, half: true },
    { key: "description", label: "Description (tooltip)", type: "text" },
    { key: "type", label: "Type", type: "select", options: opts(["boolean", "integer"], { boolean: "On / off", integer: "Number" }), half: true },
    { key: "defaultBoolean", label: "On by default", type: "boolean", half: true, when: (s) => str(s, "type") !== "integer" },
    { key: "defaultInteger", label: "Default", type: "number", integer: true, half: true, when: (s) => str(s, "type") === "integer" },
    { key: "min", label: "Minimum", type: "number", integer: true, half: true, when: (s) => str(s, "type") === "integer" },
    { key: "max", label: "Maximum", type: "number", integer: true, half: true, when: (s) => str(s, "type") === "integer" },
  ],
  validate: (spec) => {
    if (str(spec, "type") !== "integer") return [];
    const min = num(spec, "min"), max = num(spec, "max"), def = num(spec, "defaultInteger");
    if (min > max) return ["Minimum is above maximum."];
    if (def < min || def > max) return ["The default is outside min…max."];
    return [];
  },
  files: () => [],
  shared: (spec, { modId }) => {
    const integer = str(spec, "type") === "integer";
    return {
      lang: {
        [`gamerule.${modId}.${spec.id}`]: nameOf(spec),
        ...(str(spec, "description").trim() ? { [`gamerule.${modId}.${spec.id}.description`]: str(spec, "description").trim() } : {}),
      },
      manifest: {
        game_rules: {
          id: spec.id,
          type: integer ? "integer" : "boolean",
          category: str(spec, "category", "misc"),
          defaultBoolean: bool(spec, "defaultBoolean"),
          defaultInteger: Math.round(num(spec, "defaultInteger")),
          ...(integer ? { min: Math.round(num(spec, "min")), max: Math.round(num(spec, "max")) } : {}),
        },
      },
    };
  },
};

// ── Fluid ────────────────────────────────────────────────────────────────────

const intIn = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(v)));

export const FLUID: ElementKindDef = {
  kind: "fluid",
  label: "Fluid",
  plural: "Fluids",
  icon: Droplets,
  idPrefix: "fluid",
  description:
    "A new liquid that flows like water or lava, with an optional bucket. It looks like vanilla water or lava tinted in your color; density, viscosity and flow speed change how it behaves.",
  labelField: "name",
  defaults: () => ({
    name: "", base: "water", color: "#33cc55", lightLevel: 0, density: 1000, viscosity: 1000, temperature: 300,
    canSwim: true, canDrown: true, canExtinguish: true, canConvertToSource: false, supportsBoating: false,
    tickRate: 5, levelDecreasePerBlock: 1, bucket: true,
  }),
  fields: [
    { key: "name", label: "Name", type: "text", half: true },
    { key: "base", label: "Looks like", type: "select", options: opts(["water", "lava"], { water: "Water (tinted)", lava: "Lava (tinted)" }), half: true },
    { key: "color", label: "Tint color", type: "color", half: true },
    { key: "lightLevel", label: "Light level (0–15)", type: "number", min: 0, max: 15, integer: true, half: true },
    { key: "tickRate", label: "Flow delay in ticks (water 5, lava 30)", type: "number", min: 1, max: 200, integer: true, half: true },
    { key: "levelDecreasePerBlock", label: "Spread (1 = 8 blocks like water, 2 = 4 like lava)", type: "number", min: 1, max: 7, integer: true, half: true },
    { key: "density", label: "Density (water 1000, negative = gas)", type: "number", integer: true, half: true },
    { key: "viscosity", label: "Viscosity (water 1000, lava 6000)", type: "number", min: 1, integer: true, half: true },
    { key: "temperature", label: "Temperature K (water 300, lava 1300)", type: "number", integer: true, half: true },
    { key: "canSwim", label: "Players can swim in it", type: "boolean", half: true },
    { key: "canDrown", label: "Can drown in it", type: "boolean", half: true },
    { key: "canExtinguish", label: "Puts out burning entities", type: "boolean", half: true },
    { key: "canConvertToSource", label: "Infinite (2 sources make a 3rd)", type: "boolean", half: true },
    { key: "supportsBoating", label: "Boats float on it", type: "boolean", half: true },
    { key: "bucket", label: "Has a bucket", type: "boolean", half: true },
  ],
  validate: (spec) => (/^#[0-9a-f]{6}$/i.test(str(spec, "color")) ? [] : ["Tint color must be #rrggbb."]),
  files: (spec, { modId }) => {
    const model = str(spec, "base") === "lava" ? "minecraft:block/lava" : "minecraft:block/water";
    return [
      { path: `assets/${modId}/blockstates/${spec.id}.json`, content: json({ variants: { "": { model } } }) },
      ...(bool(spec, "bucket") ? [{
        path: `assets/${modId}/items/${spec.id}_bucket.json`,
        content: json({
          model: {
            type: "neoforge:fluid_container",
            fluid: `${modId}:${spec.id}`,
            textures: {
              base: "minecraft:item/bucket",
              fluid: "neoforge:item/mask/bucket_fluid",
              cover: "neoforge:item/mask/bucket_fluid_cover",
            },
          },
        }),
      }] : []),
    ];
  },
  shared: (spec, { modId }) => ({
    lang: {
      [`block.${modId}.${spec.id}`]: nameOf(spec),
      ...(bool(spec, "bucket") ? { [`item.${modId}.${spec.id}_bucket`]: `${nameOf(spec)} Bucket` } : {}),
    },
    manifest: {
      fluids: {
        id: spec.id,
        base: str(spec, "base") === "lava" ? "lava" : "water",
        color: str(spec, "color", "#3f76e4"),
        lightLevel: intIn(num(spec, "lightLevel"), 0, 15),
        density: Math.round(num(spec, "density", 1000)),
        viscosity: Math.max(1, Math.round(num(spec, "viscosity", 1000))),
        temperature: Math.round(num(spec, "temperature", 300)),
        canSwim: bool(spec, "canSwim"),
        canDrown: bool(spec, "canDrown"),
        canExtinguish: bool(spec, "canExtinguish"),
        canConvertToSource: bool(spec, "canConvertToSource"),
        supportsBoating: bool(spec, "supportsBoating"),
        tickRate: intIn(num(spec, "tickRate", 5), 1, 200),
        levelDecreasePerBlock: intIn(num(spec, "levelDecreasePerBlock", 1), 1, 7),
        bucket: bool(spec, "bucket"),
      },
    },
  }),
};

// ── Village profession ───────────────────────────────────────────────────────

/** Blocks that already are a vanilla point of interest — a block can only belong to one, so these
 * can't be a new profession's job site (registration would fail). */
const VANILLA_POI_BLOCKS = new Set([
  "blast_furnace", "smoker", "cartography_table", "brewing_stand", "composter", "barrel", "fletching_table",
  "cauldron", "water_cauldron", "lava_cauldron", "powder_snow_cauldron", "lectern", "stonecutter", "loom",
  "smithing_table", "grindstone", "bell", "beehive", "bee_nest", "nether_portal", "lodestone", "lightning_rod",
  "respawn_anchor", "test_instance",
].map((b) => `minecraft:${b}`));

const TRADE_ITEMS = ["minecraft:emerald", "minecraft:diamond", "minecraft:iron_ingot", "minecraft:gold_ingot", "minecraft:wheat", "minecraft:paper"];

interface InlineTrade { level: string; wants: string; wantsCount: number; gives: string; givesCount: number; maxUses: number; xp: number }

const stack = (id: string, count: number) => (count > 1 ? { id, count: Math.min(99, Math.round(count)) } : { id });

export const VILLAGER_PROFESSION: ElementKindDef = {
  kind: "villagerProfession",
  label: "Village profession",
  plural: "Village Professions",
  icon: BriefcaseBusiness,
  idPrefix: "profession",
  description:
    "A new villager job. Unemployed villagers take it when they find its job-site block, then offer the trades below as they level up (Novice → Master). The texture is the outfit drawn over the villager (64×64, like vanilla's profession textures).",
  labelField: "name",
  thumb: (spec) => str(spec, "texture") || undefined,
  defaults: () => ({
    name: "", jobSiteBlock: "", workSound: "", texture: "", tradesPerLevel: 2,
    trades: [{ level: "1", wants: "minecraft:emerald", wantsCount: 1, gives: "minecraft:bread", givesCount: 6, maxUses: 16, xp: 2 }],
  }),
  fields: [
    { key: "name", label: "Name (shown in the trade screen)", type: "text", half: true },
    {
      key: "jobSiteBlock", label: "Job-site block", type: "registry", half: true, placeholder: "mymod:forge_table",
      suggestions: (ctx) => ctx.projectBlocks,
      help: "Usually one of your own blocks — vanilla workstations (loom, lectern, …) already belong to a vanilla job.",
    },
    { key: "workSound", label: "Work sound (optional)", type: "text", mono: true, placeholder: "minecraft:entity.villager.work_toolsmith", half: true },
    { key: "tradesPerLevel", label: "Trades offered per level", type: "number", min: 1, max: 10, integer: true, half: true },
    { key: "texture", label: "Outfit texture (optional)", type: "texture" },
    {
      key: "trades", label: "Trades", type: "list", itemLabel: "Trade",
      newItem: () => ({ level: "1", wants: "minecraft:emerald", wantsCount: 1, gives: "minecraft:bread", givesCount: 1, maxUses: 12, xp: 2 }),
      fields: [
        { key: "level", label: "Level", type: "select", half: true, options: opts(["1", "2", "3", "4", "5"], { "1": "1 Novice", "2": "2 Apprentice", "3": "3 Journeyman", "4": "4 Expert", "5": "5 Master" }) },
        { key: "maxUses", label: "Max uses before restock", type: "number", min: 1, integer: true, half: true },
        { key: "wants", label: "Villager wants", type: "registry", half: true, suggestions: (ctx) => [...TRADE_ITEMS, ...ctx.projectItems] },
        { key: "wantsCount", label: "Count", type: "number", min: 1, max: 99, integer: true, half: true },
        { key: "gives", label: "Villager gives", type: "registry", half: true, suggestions: (ctx) => [...ctx.projectItems, ...TRADE_ITEMS] },
        { key: "givesCount", label: "Count", type: "number", min: 1, max: 99, integer: true, half: true },
        { key: "xp", label: "Villager XP", type: "number", min: 0, integer: true, half: true },
      ],
    },
  ],
  validate: (spec) => {
    const block = str(spec, "jobSiteBlock").trim();
    const problems: string[] = [];
    if (!block) problems.push("Pick a job-site block.");
    else if (VANILLA_POI_BLOCKS.has(block.includes(":") ? block : `minecraft:${block}`)) {
      problems.push(`${block} is already a vanilla job site / point of interest — use a different block.`);
    }
    if (list<InlineTrade>(spec, "trades").some((t) => !t.wants || !t.gives)) problems.push("Every trade needs a wanted and a given item.");
    return problems;
  },
  textures: (spec) => [str(spec, "texture")].filter(Boolean),
  files: (spec, { modId, texture }) => {
    const trades = list<InlineTrade>(spec, "trades");
    const files = trades.map((t, i) => ({
      path: `data/${modId}/villager_trade/${spec.id}/${i + 1}.json`,
      content: json({ gives: stack(t.gives, t.givesCount), wants: stack(t.wants, t.wantsCount), max_uses: Math.max(1, Math.round(t.maxUses)), xp: Math.max(0, Math.round(t.xp)) }),
    }));
    for (let level = 1; level <= 5; level++) {
      const values = trades.flatMap((t, i) => (Number(t.level) === level ? [`${modId}:${spec.id}/${i + 1}`] : []));
      files.push({ path: `data/${modId}/tags/villager_trade/${spec.id}/level_${level}.json`, content: json({ values }) });
      files.push({
        path: `data/${modId}/trade_set/${spec.id}/level_${level}.json`,
        content: json({
          amount: Math.max(1, Math.min(10, Math.round(num(spec, "tradesPerLevel", 2)))),
          random_sequence: `${modId}:trade_set/${spec.id}/level_${level}`,
          trades: `#${modId}:${spec.id}/level_${level}`,
        }),
      });
    }
    return [
      ...files,
      ...textureFile(`assets/${modId}/textures/entity/villager/profession/${spec.id}.png`, str(spec, "texture"), texture),
      ...textureFile(`assets/${modId}/textures/entity/zombie_villager/profession/${spec.id}.png`, str(spec, "texture"), texture),
    ];
  },
  shared: (spec, { modId }) => ({
    lang: { [`entity.${modId}.villager.${spec.id}`]: nameOf(spec) },
    tags: tagIf(true, "data/minecraft/tags/point_of_interest_type/acquirable_job_site.json", `${modId}:${spec.id}`),
    manifest: {
      villager_professions: { id: spec.id, jobSiteBlock: str(spec, "jobSiteBlock").trim(), workSound: str(spec, "workSound").trim() },
    },
  }),
};

// ── Plant ────────────────────────────────────────────────────────────────────

const STEW_EFFECTS = ["", "minecraft:night_vision", "minecraft:jump_boost", "minecraft:weakness", "minecraft:blindness",
  "minecraft:poison", "minecraft:fire_resistance", "minecraft:regeneration", "minecraft:wither", "minecraft:saturation"];

const blockLoot = (modId: string, path: string, pools: unknown[]) =>
  json({ type: "minecraft:block", pools, random_sequence: `${modId}:blocks/${path}` });
const dropPool = (item: string, conditions: unknown[] = []) => ({
  conditions: [{ condition: "minecraft:survives_explosion" }],
  entries: [{ type: "minecraft:item", name: item, ...(conditions.length ? { conditions } : {}) }],
  rolls: 1,
});

export const PLANT: ElementKindDef = {
  kind: "plant",
  label: "Plant",
  plural: "Plants",
  icon: Sprout,
  idPrefix: "plant",
  description:
    "A flower or two-block-tall flower that can be placed on grass/dirt, optionally potted and spawning naturally in biomes. Textures are 16×16 with a transparent background (the classic X-shaped plant look).",
  labelField: "name",
  thumb: (spec) => str(spec, str(spec, "type") === "tall_flower" ? "textureTop" : "texture") || undefined,
  defaults: () => ({
    name: "", type: "flower", texture: "", textureTop: "", textureBottom: "", stewEffect: "", stewSeconds: 5, potted: true,
    lightLevel: 0, generate: false, biomes: "#minecraft:is_overworld", rarity: 8, patchCount: 24,
  }),
  fields: [
    { key: "name", label: "Name", type: "text", half: true },
    { key: "type", label: "Kind", type: "select", half: true, options: opts(["flower", "tall_flower"], { flower: "Flower (1 block)", tall_flower: "Tall flower (2 blocks)" }) },
    { key: "texture", label: "Texture", type: "texture", when: (s) => str(s, "type") !== "tall_flower" },
    { key: "textureTop", label: "Top texture", type: "texture", half: true, when: (s) => str(s, "type") === "tall_flower" },
    { key: "textureBottom", label: "Bottom texture", type: "texture", half: true, when: (s) => str(s, "type") === "tall_flower" },
    { key: "lightLevel", label: "Light level (0–15)", type: "number", min: 0, max: 15, integer: true, half: true },
    { key: "potted", label: "Can be put in a flower pot", type: "boolean", half: true, when: (s) => str(s, "type") !== "tall_flower" },
    { key: "stewEffect", label: "Suspicious stew effect", type: "select", half: true, when: (s) => str(s, "type") !== "tall_flower",
      options: STEW_EFFECTS.map((v) => ({ value: v, label: v ? v.replace("minecraft:", "") : "Saturation (default)" })) },
    { key: "stewSeconds", label: "Stew effect seconds", type: "number", min: 0.05, half: true, when: (s) => str(s, "type") !== "tall_flower" },
    { key: "generate", label: "Spawns naturally in the world", type: "boolean" },
    { key: "biomes", label: "Biomes (id or #tag)", type: "text", mono: true, half: true, when: (s) => bool(s, "generate") },
    { key: "rarity", label: "Rarity (1 patch per N chunks)", type: "number", min: 1, max: 1000, integer: true, half: true, when: (s) => bool(s, "generate") },
    { key: "patchCount", label: "Tries per patch", type: "number", min: 1, max: 128, integer: true, half: true, when: (s) => bool(s, "generate") },
  ],
  validate: (spec) => {
    const tall = str(spec, "type") === "tall_flower";
    if (tall ? !str(spec, "textureTop") || !str(spec, "textureBottom") : !str(spec, "texture")) return ["Pick the plant's texture(s)."];
    return [];
  },
  textures: (spec) => [str(spec, "texture"), str(spec, "textureTop"), str(spec, "textureBottom")].filter(Boolean),
  files: (spec, { modId, texture }) => {
    const id = spec.id;
    const ns = (p: string) => `${modId}:${p}`;
    const tall = str(spec, "type") === "tall_flower";
    const files: { path: string; content: string | Blob }[] = [];
    const itemDef = (itemModel: string) => ({ path: `assets/${modId}/items/${id}.json`, content: json({ model: { type: "minecraft:model", model: itemModel } }) });
    if (tall) {
      files.push(
        { path: `assets/${modId}/blockstates/${id}.json`, content: json({ variants: { "half=lower": { model: ns(`block/${id}_bottom`) }, "half=upper": { model: ns(`block/${id}_top`) } } }) },
        { path: `assets/${modId}/models/block/${id}_bottom.json`, content: json({ parent: "minecraft:block/cross", textures: { cross: ns(`block/${id}_bottom`) } }) },
        { path: `assets/${modId}/models/block/${id}_top.json`, content: json({ parent: "minecraft:block/cross", textures: { cross: ns(`block/${id}_top`) } }) },
        { path: `assets/${modId}/models/item/${id}.json`, content: json({ parent: "minecraft:item/generated", textures: { layer0: ns(`block/${id}_top`) } }) },
        itemDef(ns(`item/${id}`)),
        ...textureFile(`assets/${modId}/textures/block/${id}_top.png`, str(spec, "textureTop"), texture),
        ...textureFile(`assets/${modId}/textures/block/${id}_bottom.png`, str(spec, "textureBottom"), texture),
        { path: `data/${modId}/loot_table/blocks/${id}.json`, content: blockLoot(modId, id, [dropPool(ns(id), [{ block: ns(id), condition: "minecraft:block_state_property", properties: { half: "lower" } }])]) },
      );
    } else {
      files.push(
        { path: `assets/${modId}/blockstates/${id}.json`, content: json({ variants: { "": { model: ns(`block/${id}`) } } }) },
        { path: `assets/${modId}/models/block/${id}.json`, content: json({ parent: "minecraft:block/cross", textures: { cross: ns(`block/${id}`) } }) },
        { path: `assets/${modId}/models/item/${id}.json`, content: json({ parent: "minecraft:item/generated", textures: { layer0: ns(`block/${id}`) } }) },
        itemDef(ns(`item/${id}`)),
        ...textureFile(`assets/${modId}/textures/block/${id}.png`, str(spec, "texture"), texture),
        { path: `data/${modId}/loot_table/blocks/${id}.json`, content: blockLoot(modId, id, [dropPool(ns(id))]) },
      );
      if (bool(spec, "potted")) {
        files.push(
          { path: `assets/${modId}/blockstates/potted_${id}.json`, content: json({ variants: { "": { model: ns(`block/potted_${id}`) } } }) },
          { path: `assets/${modId}/models/block/potted_${id}.json`, content: json({ parent: "minecraft:block/flower_pot_cross", textures: { plant: ns(`block/${id}`) } }) },
          { path: `data/${modId}/loot_table/blocks/potted_${id}.json`, content: blockLoot(modId, `potted_${id}`, [dropPool("minecraft:flower_pot"), dropPool(ns(id))]) },
        );
      }
    }
    if (bool(spec, "generate")) {
      const spread = (n: number) => ({ type: "minecraft:trapezoid", max: n, min: -n, plateau: 0 });
      files.push(
        {
          path: `data/${modId}/worldgen/configured_feature/${id}.json`,
          content: json({ type: "minecraft:simple_block", config: { to_place: { type: "minecraft:simple_state_provider", state: { Name: ns(id), ...(tall ? { Properties: { half: "lower" } } : {}) } } } }),
        },
        {
          path: `data/${modId}/worldgen/placed_feature/${id}.json`,
          content: json({
            feature: ns(id),
            placement: [
              { type: "minecraft:rarity_filter", chance: Math.max(1, Math.round(num(spec, "rarity", 8))) },
              { type: "minecraft:in_square" },
              { type: "minecraft:heightmap", heightmap: "MOTION_BLOCKING" },
              { type: "minecraft:biome" },
              { type: "minecraft:count", count: Math.max(1, Math.min(128, Math.round(num(spec, "patchCount", 24)))) },
              { type: "minecraft:random_offset", xz_spread: spread(7), y_spread: spread(3) },
              { type: "minecraft:block_predicate_filter", predicate: { type: "minecraft:matching_block_tag", tag: "minecraft:air" } },
            ],
          }),
        },
        {
          path: `data/${modId}/neoforge/biome_modifier/${id}.json`,
          content: json({ type: "neoforge:add_features", biomes: str(spec, "biomes").trim() || "#minecraft:is_overworld", features: ns(id), step: "vegetal_decoration" }),
        },
      );
    }
    return files;
  },
  shared: (spec, { modId }) => {
    const tall = str(spec, "type") === "tall_flower";
    const potted = !tall && bool(spec, "potted");
    return {
      lang: {
        [`block.${modId}.${spec.id}`]: nameOf(spec),
        ...(potted ? { [`block.${modId}.potted_${spec.id}`]: `Potted ${nameOf(spec)}` } : {}),
      },
      tags: {
        ...tagIf(true, `data/minecraft/tags/item/${tall ? "flowers" : "small_flowers"}.json`, `${modId}:${spec.id}`),
        ...tagIf(true, `data/minecraft/tags/block/${tall ? "flowers" : "small_flowers"}.json`, `${modId}:${spec.id}`),
        ...tagIf(potted, "data/minecraft/tags/block/flower_pots.json", `${modId}:potted_${spec.id}`),
      },
      manifest: {
        plants: {
          id: spec.id,
          type: tall ? "tall_flower" : "flower",
          stewEffect: str(spec, "stewEffect"),
          stewSeconds: Math.max(0.05, num(spec, "stewSeconds", 5)),
          potted,
          lightLevel: Math.max(0, Math.min(15, Math.round(num(spec, "lightLevel")))),
        },
      },
    };
  },
};

// ── Particle ─────────────────────────────────────────────────────────────────

const frames = (spec: ElementSpec) => list<{ texture?: string }>(spec, "frames").map((f) => f.texture ?? "").filter(Boolean);

export const PARTICLE: ElementKindDef = {
  kind: "particle",
  label: "Particle",
  plural: "Particles",
  icon: Atom,
  idPrefix: "particle",
  description:
    "A new particle, spawned with /particle <modid>:<id> (or from functions/commands). Textures are small (8×8 or 16×16); with several frames it either picks one at random or plays them in order over its lifetime.",
  thumb: (spec) => frames(spec)[0],
  defaults: () => ({
    frames: [{ texture: "" }], animated: false, lifetime: 20, lifetimeVariance: 10, gravity: 0, scale: 1, friction: 0.98,
    physics: true, emissive: false, translucent: false, fadeOut: true, tint: "#ffffff",
  }),
  fields: [
    { key: "frames", label: "Texture frames", type: "list", itemLabel: "Frame", newItem: () => ({ texture: "" }), fields: [{ key: "texture", label: "Texture", type: "texture" }] },
    { key: "animated", label: "Play frames in order (else random frame)", type: "boolean" },
    { key: "lifetime", label: "Lifetime (ticks, 20 = 1 s)", type: "number", min: 1, max: 1200, integer: true, half: true },
    { key: "lifetimeVariance", label: "+ random extra ticks", type: "number", min: 0, max: 1200, integer: true, half: true },
    { key: "gravity", label: "Gravity (negative = floats up)", type: "number", half: true },
    { key: "scale", label: "Size (1 = normal)", type: "number", min: 0.01, max: 20, half: true },
    { key: "friction", label: "Friction (0.98 = drifts, 0.6 = stops fast)", type: "number", min: 0, max: 1, half: true },
    { key: "tint", label: "Tint", type: "color", half: true },
    { key: "physics", label: "Collides with blocks", type: "boolean", half: true },
    { key: "emissive", label: "Glows in the dark", type: "boolean", half: true },
    { key: "translucent", label: "Semi-transparent texture", type: "boolean", half: true },
    { key: "fadeOut", label: "Fades out at the end", type: "boolean", half: true },
  ],
  validate: (spec) => (frames(spec).length === 0 ? ["Add at least one texture frame."] : []),
  textures: frames,
  files: (spec, { modId, texture }) => {
    const keys = frames(spec);
    return [
      { path: `assets/${modId}/particles/${spec.id}.json`, content: json({ textures: keys.map((_, i) => `${modId}:${spec.id}_${i}`) }) },
      ...keys.flatMap((k, i) => textureFile(`assets/${modId}/textures/particle/${spec.id}_${i}.png`, k, texture)),
    ];
  },
  shared: (spec) => ({
    manifest: {
      particles: {
        id: spec.id,
        lifetime: Math.max(1, Math.round(num(spec, "lifetime", 20))),
        lifetimeVariance: Math.max(0, Math.round(num(spec, "lifetimeVariance"))),
        gravity: num(spec, "gravity"),
        scale: Math.max(0.01, num(spec, "scale", 1)),
        friction: Math.max(0, Math.min(1, num(spec, "friction", 0.98))),
        physics: bool(spec, "physics"),
        emissive: bool(spec, "emissive"),
        translucent: bool(spec, "translucent"),
        animated: bool(spec, "animated"),
        fadeOut: bool(spec, "fadeOut"),
        tint: /^#[0-9a-f]{6}$/i.test(str(spec, "tint")) ? str(spec, "tint") : "#ffffff",
      },
    },
  }),
};

// ── Key binding ──────────────────────────────────────────────────────────────

const LETTER_KEYS = "abcdefghijklmnopqrstuvwxyz0123456789".split("").map((k) => `key.keyboard.${k}`);
const OTHER_KEYS = [
  ...Array.from({ length: 12 }, (_, i) => `key.keyboard.f${i + 1}`),
  "key.keyboard.left.alt", "key.keyboard.right.alt", "key.keyboard.left.control", "key.keyboard.tab", "key.keyboard.caps.lock",
  "key.keyboard.grave.accent", "key.keyboard.left.bracket", "key.keyboard.right.bracket", "key.keyboard.semicolon",
  "key.keyboard.apostrophe", "key.keyboard.comma", "key.keyboard.period", "key.keyboard.minus", "key.keyboard.equal",
  "key.keyboard.insert", "key.keyboard.delete", "key.keyboard.home", "key.keyboard.end", "key.keyboard.page.up", "key.keyboard.page.down",
  ...Array.from({ length: 10 }, (_, i) => `key.keyboard.keypad.${i}`),
  "key.mouse.middle", "key.mouse.4", "key.mouse.5",
];
const KEY_OPTIONS = [
  { value: "key.keyboard.unknown", label: "Not bound (player picks one)" },
  ...[...LETTER_KEYS, ...OTHER_KEYS].map((k) => ({ value: k, label: k.replace(/^key\.(keyboard|mouse)\./, (_, t) => (t === "mouse" ? "Mouse " : "")).replace(/\./g, " ").toUpperCase() })),
];

export const KEY_BINDING: ElementKindDef = {
  kind: "keyBinding",
  label: "Key binding",
  plural: "Key Bindings",
  icon: Keyboard,
  idPrefix: "key",
  description:
    "A new key in Options → Controls (players can rebind it). Pressing it runs a command as the player — with their normal permissions — or opens one of this project's screens.",
  labelField: "name",
  defaults: () => ({ name: "", defaultKey: "key.keyboard.unknown", action: "command", command: "say hello", screen: "" }),
  fields: [
    { key: "name", label: "Name (in Controls)", type: "text", half: true },
    { key: "defaultKey", label: "Default key", type: "select", options: KEY_OPTIONS, half: true },
    { key: "action", label: "When pressed", type: "select", half: true, options: opts(["command", "screen"], { command: "Run a command", screen: "Open a screen" }) },
    { key: "command", label: "Command (as the player)", type: "text", mono: true, half: true, when: (s) => str(s, "action") !== "screen" },
    {
      key: "screen", label: "Screen id", type: "registry", half: true, placeholder: "my_screen", when: (s) => str(s, "action") === "screen",
      suggestions: (ctx) => ctx.projectScreens ?? [],
      help: "Screens with inventory slots need the server to open them and can't be opened from a key.",
    },
  ],
  validate: (spec) => {
    if (str(spec, "action") === "screen") return str(spec, "screen").trim() ? [] : ["Pick the screen to open."];
    return str(spec, "command").trim() ? [] : ["Enter the command to run."];
  },
  files: () => [],
  shared: (spec, { modId }) => ({
    lang: { [`key.${modId}.${spec.id}`]: nameOf(spec), [`key.category.${modId}.keys`]: modId },
    manifest: {
      key_bindings: {
        id: spec.id,
        defaultKey: str(spec, "defaultKey", "key.keyboard.unknown"),
        action: str(spec, "action") === "screen" ? "screen" : "command",
        command: str(spec, "command").trim().replace(/^\/+/, ""),
        screen: str(spec, "screen").trim(),
      },
    },
  }),
};

// ── Special entity: boat ─────────────────────────────────────────────────────

const itemModel = (modId: string, item: string, texture: (k: string) => Blob | undefined, key: string) => [
  { path: `assets/${modId}/items/${item}.json`, content: json({ model: { type: "minecraft:model", model: `${modId}:item/${item}` } }) },
  { path: `assets/${modId}/models/item/${item}.json`, content: json({ parent: "minecraft:item/generated", textures: { layer0: `${modId}:item/${item}` } }) },
  ...textureFile(`assets/${modId}/textures/item/${item}.png`, key, texture),
];

export const BOAT: ElementKindDef = {
  kind: "boat",
  label: "Special entity",
  plural: "Special Entities",
  icon: Sailboat,
  idPrefix: "boat",
  description:
    "A custom boat (and optional chest boat) — behaves exactly like vanilla's wood boats, with your own texture. Boat texture is 128×64, chest boat 128×128 — start from vanilla's entity/boat/oak.png and chest_boat/oak.png. Optional planks make it craftable.",
  labelField: "name",
  thumb: (spec) => str(spec, "itemTexture") || undefined,
  defaults: () => ({ name: "", texture: "", chestBoat: true, chestTexture: "", itemTexture: "", chestItemTexture: "", planks: "" }),
  fields: [
    { key: "name", label: "Name (e.g. \"Ruby\" → Ruby Boat)", type: "text" },
    { key: "texture", label: "Boat texture (128×64)", type: "texture", half: true },
    { key: "itemTexture", label: "Boat item icon", type: "texture", half: true },
    { key: "chestBoat", label: "Also a chest boat", type: "boolean" },
    { key: "chestTexture", label: "Chest boat texture (128×128)", type: "texture", half: true, when: (s) => bool(s, "chestBoat") },
    { key: "chestItemTexture", label: "Chest boat item icon", type: "texture", half: true, when: (s) => bool(s, "chestBoat") },
    {
      key: "planks", label: "Crafted from (optional)", type: "registry", placeholder: "mymod:ruby_planks",
      suggestions: (ctx) => [...ctx.projectBlocks, ...ctx.projectItems],
      help: "Shaped like vanilla: planks in a U. The chest boat is boat + chest.",
    },
  ],
  validate: (spec) => {
    const problems: string[] = [];
    if (!str(spec, "texture")) problems.push("Pick the boat texture.");
    if (bool(spec, "chestBoat") && !str(spec, "chestTexture")) problems.push("Pick the chest boat texture.");
    return problems;
  },
  textures: (spec) => ["texture", "chestTexture", "itemTexture", "chestItemTexture"].map((k) => str(spec, k)).filter(Boolean),
  files: (spec, { modId, texture }) => {
    const boat = `${spec.id}_boat`, chest = `${spec.id}_chest_boat`, chestOn = bool(spec, "chestBoat");
    const planks = str(spec, "planks").trim();
    return [
      ...textureFile(`assets/${modId}/textures/entity/boat/${spec.id}.png`, str(spec, "texture"), texture),
      ...itemModel(modId, boat, texture, str(spec, "itemTexture")),
      ...(chestOn ? [
        ...textureFile(`assets/${modId}/textures/entity/chest_boat/${spec.id}.png`, str(spec, "chestTexture"), texture),
        ...itemModel(modId, chest, texture, str(spec, "chestItemTexture")),
      ] : []),
      ...(planks ? [{
        path: `data/${modId}/recipe/${boat}.json`,
        content: json({ type: "minecraft:crafting_shaped", group: "boat", key: { "#": planks }, pattern: ["# #", "###"], result: { id: `${modId}:${boat}` } }),
      }] : []),
      ...(planks && chestOn ? [{
        path: `data/${modId}/recipe/${chest}.json`,
        content: json({ type: "minecraft:crafting_shapeless", group: "chest_boat", ingredients: ["minecraft:chest", `${modId}:${boat}`], result: { id: `${modId}:${chest}` } }),
      }] : []),
    ];
  },
  shared: (spec, { modId }) => {
    const name = nameOf(spec);
    const chestOn = bool(spec, "chestBoat");
    return {
      lang: {
        [`item.${modId}.${spec.id}_boat`]: `${name} Boat`,
        [`entity.${modId}.${spec.id}_boat`]: `${name} Boat`,
        ...(chestOn ? { [`item.${modId}.${spec.id}_chest_boat`]: `${name} Boat with Chest`, [`entity.${modId}.${spec.id}_chest_boat`]: `${name} Boat with Chest` } : {}),
      },
      tags: {
        ...tagIf(true, "data/minecraft/tags/item/boats.json", `${modId}:${spec.id}_boat`),
        ...tagIf(chestOn, "data/minecraft/tags/item/chest_boats.json", `${modId}:${spec.id}_chest_boat`),
      },
      manifest: { boats: { id: spec.id, chestBoat: chestOn } },
    };
  },
};

// ── Projectile ───────────────────────────────────────────────────────────────

const HIT_EFFECTS = ["", "minecraft:slowness", "minecraft:poison", "minecraft:weakness", "minecraft:blindness", "minecraft:wither",
  "minecraft:levitation", "minecraft:glowing", "minecraft:nausea", "minecraft:instant_damage", "minecraft:instant_health"];

export const PROJECTILE: ElementKindDef = {
  kind: "projectile",
  label: "Projectile",
  plural: "Projectiles",
  icon: Crosshair,
  idPrefix: "projectile",
  description:
    "A throwable item (right-click, like a snowball) that flies as its own icon and hits for damage, fire, an effect and/or an explosion. Dispensers don't fire it.",
  labelField: "name",
  thumb: (spec) => str(spec, "texture") || undefined,
  defaults: () => ({
    name: "", texture: "", damage: 4, speed: 1.5, inaccuracy: 1, gravity: 0.03, fireSeconds: 0, explosionPower: 0,
    explosionBreaksBlocks: false, effect: "", effectSeconds: 5, effectAmplifier: 0, cooldown: 0, stackSize: 16, glowing: false,
  }),
  fields: [
    { key: "name", label: "Name", type: "text", half: true },
    { key: "texture", label: "Item / projectile texture", type: "texture", half: true },
    { key: "damage", label: "Damage (2 = 1 heart)", type: "number", min: 0, half: true },
    { key: "speed", label: "Speed (snowball 1.5)", type: "number", min: 0.05, max: 10, half: true },
    { key: "gravity", label: "Gravity (snowball 0.03, 0 = straight)", type: "number", min: 0, max: 1, half: true },
    { key: "inaccuracy", label: "Spread (snowball 1, 0 = exact)", type: "number", min: 0, max: 20, half: true },
    { key: "fireSeconds", label: "Sets target on fire (s)", type: "number", min: 0, max: 60, integer: true, half: true },
    { key: "explosionPower", label: "Explosion power (TNT 4, 0 = none)", type: "number", min: 0, max: 10, half: true },
    { key: "explosionBreaksBlocks", label: "Explosion breaks blocks", type: "boolean", half: true, when: (s) => num(s, "explosionPower") > 0 },
    { key: "effect", label: "Effect on hit", type: "select", half: true, options: HIT_EFFECTS.map((v) => ({ value: v, label: v ? v.replace("minecraft:", "") : "None" })) },
    { key: "effectSeconds", label: "Effect seconds", type: "number", min: 1, integer: true, half: true, when: (s) => !!str(s, "effect") },
    { key: "effectAmplifier", label: "Effect level (0 = I)", type: "number", min: 0, max: 255, integer: true, half: true, when: (s) => !!str(s, "effect") },
    { key: "cooldown", label: "Cooldown after throw (ticks)", type: "number", min: 0, max: 1200, integer: true, half: true },
    { key: "stackSize", label: "Stack size", type: "number", min: 1, max: 99, integer: true, half: true },
    { key: "glowing", label: "Glows in flight", type: "boolean", half: true },
  ],
  validate: (spec) => (str(spec, "texture") ? [] : ["Pick a texture."]),
  textures: (spec) => [str(spec, "texture")].filter(Boolean),
  files: (spec, { modId, texture }) => itemModel(modId, spec.id, texture, str(spec, "texture")),
  shared: (spec, { modId }) => ({
    lang: { [`item.${modId}.${spec.id}`]: nameOf(spec), [`entity.${modId}.${spec.id}`]: nameOf(spec) },
    manifest: {
      projectiles: {
        id: spec.id,
        damage: Math.max(0, num(spec, "damage", 4)),
        speed: Math.max(0.05, num(spec, "speed", 1.5)),
        inaccuracy: Math.max(0, num(spec, "inaccuracy", 1)),
        gravity: Math.max(0, num(spec, "gravity", 0.03)),
        fireSeconds: Math.max(0, Math.round(num(spec, "fireSeconds"))),
        explosionPower: Math.max(0, Math.min(10, num(spec, "explosionPower"))),
        explosionBreaksBlocks: bool(spec, "explosionBreaksBlocks"),
        effect: str(spec, "effect"),
        effectSeconds: Math.max(1, Math.round(num(spec, "effectSeconds", 5))),
        effectAmplifier: Math.max(0, Math.round(num(spec, "effectAmplifier"))),
        cooldown: Math.max(0, Math.round(num(spec, "cooldown"))),
        stackSize: Math.max(1, Math.min(99, Math.round(num(spec, "stackSize", 16)))),
        glowing: bool(spec, "glowing"),
      },
    },
  }),
};

// ── Armor trim ───────────────────────────────────────────────────────────────

/** Vanilla's trim materials (assets/minecraft/atlases/armor_trims.json) — a new pattern needs a
 * recolored copy for each, generated by the game from the grayscale texture + these palettes. */
const TRIM_PALETTES = ["amethyst", "copper", "copper_darker", "diamond", "diamond_darker", "emerald", "gold", "gold_darker",
  "iron", "iron_darker", "lapis", "netherite", "netherite_darker", "quartz", "redstone", "resin"];

export const ARMOR_TRIM: ElementKindDef = {
  kind: "armorTrim",
  label: "Armor trim",
  plural: "Armor Trims",
  icon: Shirt,
  idPrefix: "trim",
  description:
    "A new armor trim pattern plus its smithing template. Textures are 64×32 armor layers (like vanilla's trims/entity/humanoid/sentry.png) painted ONLY with the 8 gray shades of vanilla's trim palette — the game recolors exactly those pixels for every trim material.",
  labelField: "name",
  thumb: (spec) => str(spec, "templateTexture") || undefined,
  defaults: () => ({ name: "", texture: "", leggingsTexture: "", templateTexture: "", decal: false, duplicateWith: "minecraft:diamond", duplicateBase: "minecraft:cobblestone" }),
  fields: [
    { key: "name", label: "Name (e.g. \"Flame\" → Flame Armor Trim)", type: "text" },
    { key: "texture", label: "Armor texture (helmet/chest/boots, 64×32)", type: "texture", half: true },
    { key: "leggingsTexture", label: "Leggings texture (64×32)", type: "texture", half: true },
    { key: "templateTexture", label: "Smithing template icon", type: "texture", half: true },
    { key: "decal", label: "Decal (drawn over armor details, like Silence)", type: "boolean", half: true },
    { key: "duplicateWith", label: "Duplicate recipe: surround with", type: "registry", half: true, suggestions: (ctx) => ["minecraft:diamond", ...ctx.projectItems] },
    { key: "duplicateBase", label: "Duplicate recipe: base block", type: "registry", half: true, suggestions: (ctx) => ["minecraft:cobblestone", ...ctx.projectBlocks] },
  ],
  validate: (spec) => (str(spec, "texture") && str(spec, "leggingsTexture") ? [] : ["Pick both armor textures."]),
  textures: (spec) => ["texture", "leggingsTexture", "templateTexture"].map((k) => str(spec, k)).filter(Boolean),
  files: (spec, { modId, texture }) => {
    const template = `${spec.id}_armor_trim_smithing_template`;
    const ns = (p: string) => `${modId}:${p}`;
    const surround = str(spec, "duplicateWith").trim(), base = str(spec, "duplicateBase").trim();
    return [
      { path: `data/${modId}/trim_pattern/${spec.id}.json`, content: json({ asset_id: ns(spec.id), decal: bool(spec, "decal"), description: { translate: `trim_pattern.${modId}.${spec.id}` } }) },
      {
        path: `data/${modId}/recipe/${template}_smithing_trim.json`,
        content: json({ type: "minecraft:smithing_trim", addition: "#minecraft:trim_materials", base: "#minecraft:trimmable_armor", pattern: ns(spec.id), template: ns(template) }),
      },
      ...(surround && base ? [{
        path: `data/${modId}/recipe/${template}.json`,
        content: json({ type: "minecraft:crafting_shaped", key: { "#": surround, C: base, S: ns(template) }, pattern: ["#S#", "#C#", "###"], result: { count: 2, id: ns(template) } }),
      }] : []),
      ...textureFile(`assets/${modId}/textures/trims/entity/humanoid/${spec.id}.png`, str(spec, "texture"), texture),
      ...textureFile(`assets/${modId}/textures/trims/entity/humanoid_leggings/${spec.id}.png`, str(spec, "leggingsTexture"), texture),
      ...itemModel(modId, template, texture, str(spec, "templateTexture")),
    ];
  },
  shared: (spec, { modId }) => ({
    lang: {
      [`trim_pattern.${modId}.${spec.id}`]: `${nameOf(spec)} Armor Trim`,
      [`item.${modId}.${spec.id}_armor_trim_smithing_template`]: "Smithing Template",
      [`item.${modId}.${spec.id}_armor_trim_smithing_template.new`]: `${nameOf(spec)} Armor Trim`,
    },
    atlases: {
      "minecraft:armor_trims": [{
        type: "minecraft:paletted_permutations",
        palette_key: "minecraft:trims/color_palettes/trim_palette",
        permutations: Object.fromEntries(TRIM_PALETTES.map((m) => [m, `minecraft:trims/color_palettes/${m}`])),
        textures: [`${modId}:trims/entity/humanoid/${spec.id}`, `${modId}:trims/entity/humanoid_leggings/${spec.id}`],
      }],
    },
    manifest: { armor_trims: { id: spec.id } },
  }),
};

// ── Structure ────────────────────────────────────────────────────────────────

/** Stable per-id salt for structure_set placement, so two structures don't share a spawn grid. */
const saltOf = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
};

export const STRUCTURE: ElementKindDef = {
  kind: "structure",
  label: "Structure",
  plural: "Structures",
  icon: Castle,
  idPrefix: "structure",
  description:
    "A structure template (.nbt) — save one in-game with a structure block, then upload it here to inspect it in 3D. Place it with /place template <modid>:<id>, or let it generate naturally in chosen biomes.",
  labelField: "name",
  binaryFiles: (spec) => [str(spec, "structure")].filter(Boolean),
  defaults: () => ({
    name: "", structure: "", generate: false, biomes: "#minecraft:is_overworld", spacing: 32, separation: 8,
    step: "surface_structures", terrainAdaptation: "beard_thin", yOffset: 0, heightmap: "WORLD_SURFACE_WG",
  }),
  fields: [
    { key: "name", label: "Name", type: "text" },
    { key: "structure", label: "Structure file (.nbt)", type: "structure" },
    { key: "generate", label: "Generates naturally in the world", type: "boolean" },
    { key: "biomes", label: "Biomes (id or #tag)", type: "text", mono: true, half: true, when: (s) => bool(s, "generate") },
    {
      key: "terrainAdaptation", label: "Fit to terrain", type: "select", half: true, when: (s) => bool(s, "generate"),
      options: opts(["none", "beard_thin", "beard_box", "bury", "encapsulate"], {
        none: "None (as saved)", beard_thin: "Fill below lightly (villages)", beard_box: "Fill below as a box", bury: "Bury in terrain", encapsulate: "Encase in terrain",
      }),
    },
    { key: "spacing", label: "Avg. chunks between (spacing)", type: "number", min: 2, max: 4096, integer: true, half: true, when: (s) => bool(s, "generate") },
    { key: "separation", label: "Min. chunks between (separation)", type: "number", min: 1, max: 4095, integer: true, half: true, when: (s) => bool(s, "generate") },
    {
      key: "heightmap", label: "Placed on", type: "select", half: true, when: (s) => bool(s, "generate"),
      options: opts(["WORLD_SURFACE_WG", "OCEAN_FLOOR_WG", "none"], { WORLD_SURFACE_WG: "The surface", OCEAN_FLOOR_WG: "The ground below water", none: "A fixed height" }),
    },
    { key: "yOffset", label: "Y offset (fixed height: absolute Y)", type: "number", integer: true, half: true, when: (s) => bool(s, "generate") },
    {
      key: "step", label: "Generation step", type: "select", half: true, when: (s) => bool(s, "generate"),
      options: opts(["surface_structures", "underground_structures"], { surface_structures: "Surface", underground_structures: "Underground" }),
    },
  ],
  validate: (spec) => {
    const problems: string[] = [];
    if (!str(spec, "structure")) problems.push("Upload the structure's .nbt file.");
    if (bool(spec, "generate") && num(spec, "separation", 8) >= num(spec, "spacing", 32)) problems.push("Separation must be smaller than spacing.");
    return problems;
  },
  files: (spec, { modId, file }) => {
    const ns = (p: string) => `${modId}:${p}`;
    const blob = file?.(str(spec, "structure"));
    const files: { path: string; content: string | Blob }[] = blob ? [{ path: `data/${modId}/structure/${spec.id}.nbt`, content: blob }] : [];
    if (!bool(spec, "generate")) return files;
    const fixed = str(spec, "heightmap") === "none";
    const spacing = Math.max(2, Math.round(num(spec, "spacing", 32)));
    files.push(
      {
        path: `data/${modId}/worldgen/template_pool/${spec.id}.json`,
        content: json({
          elements: [{ element: { element_type: "minecraft:single_pool_element", location: ns(spec.id), processors: "minecraft:empty", projection: "rigid" }, weight: 1 }],
          fallback: "minecraft:empty",
        }),
      },
      {
        path: `data/${modId}/worldgen/structure/${spec.id}.json`,
        content: json({
          type: "minecraft:jigsaw",
          biomes: str(spec, "biomes").trim() || "#minecraft:is_overworld",
          max_distance_from_center: 80,
          ...(fixed ? {} : { project_start_to_heightmap: str(spec, "heightmap", "WORLD_SURFACE_WG") }),
          size: 1,
          spawn_overrides: {},
          start_height: { absolute: Math.round(num(spec, "yOffset")) },
          start_pool: ns(spec.id),
          step: str(spec, "step", "surface_structures"),
          terrain_adaptation: str(spec, "terrainAdaptation", "beard_thin"),
          use_expansion_hack: false,
        }),
      },
      {
        path: `data/${modId}/worldgen/structure_set/${spec.id}.json`,
        content: json({
          placement: {
            type: "minecraft:random_spread",
            salt: saltOf(`${modId}:${spec.id}`),
            separation: Math.max(1, Math.min(spacing - 1, Math.round(num(spec, "separation", 8)))),
            spacing,
          },
          structures: [{ structure: ns(spec.id), weight: 1 }],
        }),
      },
    );
    return files;
  },
};

export const MOD_KINDS: ElementKindDef[] = [COMMAND, GAME_RULE, FLUID, VILLAGER_PROFESSION, PLANT, PARTICLE, KEY_BINDING, BOAT, PROJECTILE, ARMOR_TRIM, STRUCTURE];
