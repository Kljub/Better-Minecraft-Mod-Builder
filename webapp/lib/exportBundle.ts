import JSZip from "jszip";
import { loadAllTextures } from "./textureStore";
import type {
  ScreenSpec, WidgetSpec, ItemSpec, BlockSpec, CreativeTabSpec, CustomAttributeSpec, EffectSpec, PotionSpec,
  AchievementSpec, RecipeSpec, TradeSpec, TradeItemStack, LootEntrySpec, BiomeSpec, DimensionSpec,
  ArmorSpec,
} from "./types";
import { BIOME_TEMPLATES } from "./biomeTemplates";
import { DIMENSION_TYPE_TEMPLATES } from "./dimensionTemplates";

function collectSpriteSrcs(widgets: WidgetSpec[]): Set<string> {
  const srcs = new Set<string>();
  for (const w of widgets) {
    if (w.type === "sprite" && w.props.src) srcs.add(w.props.src);
    if (w.item_template) for (const s of collectSpriteSrcs(w.item_template)) srcs.add(s);
  }
  return srcs;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** "item/ruby_sword.png" -> "ruby_sword" (bare texture name for model JSON references). */
function textureBaseName(texturePath: string): string {
  return texturePath.replace(/^.*\//, "").replace(/\.png$/i, "");
}

function itemModelJson(modId: string, item: ItemSpec): string {
  return JSON.stringify(
    { parent: "item/generated", textures: { layer0: `${modId}:item/${textureBaseName(item.texture)}` } },
    null, 2
  );
}

function blockstateJson(modId: string, block: BlockSpec): string {
  return JSON.stringify({ variants: { "": { model: `${modId}:block/${block.id}` } } }, null, 2);
}

function blockModelJson(modId: string, block: BlockSpec): string {
  return JSON.stringify(
    { parent: "block/cube_all", textures: { all: `${modId}:block/${textureBaseName(block.texture)}` } },
    null, 2
  );
}

function blockItemModelJson(modId: string, block: BlockSpec): string {
  return JSON.stringify({ parent: `${modId}:block/${block.id}` }, null, 2);
}

// --- Armor — item-model JSON per piece (same "item/generated" idiom as regular items) plus a
// client-side equipment asset (assets/<modid>/equipment/<id>.json, NOT data/ — this is the
// resource-pack registry that Item.Properties.humanoidArmor's EquipmentAsset reference resolves
// against) with the worn-body texture copied under both the humanoid and humanoid_leggings layer
// folders vanilla expects. Verified against real vanilla equipment JSON (iron.json/leather.json) —
// see plan file research notes. The armor_material itself is Java-only (no datapack registry), so
// unlike every other content type this session neoforge-runtime has to build it from this manifest.

function armorPieceModelJson(modId: string, texture: string): string {
  return JSON.stringify(
    { parent: "item/generated", textures: { layer0: `${modId}:item/${textureBaseName(texture)}` } },
    null, 2
  );
}

function equipmentAssetJson(modId: string, armorId: string): string {
  return JSON.stringify(
    { layers: { humanoid: [{ texture: `${modId}:${armorId}` }], humanoid_leggings: [{ texture: `${modId}:${armorId}` }] } },
    null, 2
  );
}

// --- Item model *definitions* (assets/<modid>/items/<id>.json) — this MC version's newer,
// separate-from-the-model-file indirection every single item needs to render an icon at all.
// Confirmed by extracting the real client jar: literally all 1537 vanilla items ship one (even
// trivial ones like "stick"/"diamond") — there's no fallback when it's missing. Distinct from the
// assets/<modid>/models/item/<id>.json files this project already generated (itemModelJson etc.),
// which this file references by path rather than replaces.

/** The plain, no-conditions form every item/block-item/armor-piece needs — just points at its one
 * real model. */
function itemDefinitionJson(modelRef: string): string {
  return JSON.stringify({ model: { type: "minecraft:model", model: modelRef } }, null, 2);
}

/** Durability-based icon swap — real `minecraft:range_dispatch` keyed on the `minecraft:damage`
 * property (the item's normalized damage fraction, 0=undamaged..1=about to break). Verified via
 * javap against the actual game jar (net.minecraft.client.renderer.item.properties.numeric.Damage,
 * registered id "minecraft:damage", default normalize=true) — not guessed; no vanilla item
 * actually ships a sample using it (they all use it for pull/use-duration instead), but the
 * property itself, its id, and the range_dispatch shape are the same real mechanism the bow uses
 * for its pulling-frame textures. `stages` must already be threshold-sorted ascending. */
function itemDamageDispatchJson(baseModelRef: string, stages: { threshold: number; modelRef: string }[]): string {
  return JSON.stringify({
    model: {
      type: "minecraft:range_dispatch",
      property: "minecraft:damage",
      entries: stages.map((s) => ({ threshold: s.threshold, model: { type: "minecraft:model", model: s.modelRef } })),
      fallback: { type: "minecraft:model", model: baseModelRef },
    },
  }, null, 2);
}

// --- Achievements / Recipes / Trading / Loot — all pure vanilla datapack JSON, auto-loaded by
// Minecraft itself (a NeoForge mod jar doubles as a datapack source), no neoforge-runtime Java
// code needed. Shapes verified against this project's actual game jar (javap/jar inspection), not
// guessed — see the plan file's research notes.

/** A pack texture key ("gui/foo.png") -> the resource-location form advancement "background" and
 * similar texture-reference fields expect ("modid:gui/foo", no textures/ prefix or .png suffix). */
function textureResourceLocation(modId: string, textureKey: string): string {
  return `${modId}:${textureKey.replace(/\.png$/i, "")}`;
}

function achievementJson(modId: string, a: AchievementSpec): string {
  const display: Record<string, unknown> = {
    icon: { id: a.icon },
    title: { text: a.title },
    description: { text: a.description },
    frame: a.frame,
    show_toast: a.showToast,
    announce_to_chat: a.announceToChat,
    hidden: a.hidden,
  };
  if (!a.parentId && a.background) display.background = textureResourceLocation(modId, a.background);

  // Verified trigger ids and (where used) their conditions shape against this project's actual
  // game jar / real vanilla advancement JSON — see the plan file's research notes. Everything but
  // obtain_item/consume_item/changed_dimension is left with no conditions at all (fires on the raw
  // action), matching how several real vanilla advancements use these same triggers unfiltered.
  const TRIGGER_IDS: Record<string, string> = {
    always: "minecraft:tick",
    obtain_item: "minecraft:inventory_changed",
    consume_item: "minecraft:consume_item",
    placed_block: "minecraft:placed_block",
    changed_dimension: "minecraft:changed_dimension",
    slept_in_bed: "minecraft:slept_in_bed",
    player_killed_entity: "minecraft:player_killed_entity",
    entity_killed_player: "minecraft:entity_killed_player",
    enchanted_item: "minecraft:enchanted_item",
    fishing_rod_hooked: "minecraft:fishing_rod_hooked",
    villager_trade: "minecraft:villager_trade",
    bred_animals: "minecraft:bred_animals",
    tame_animal: "minecraft:tame_animal",
  };
  const criterion: Record<string, unknown> = { trigger: TRIGGER_IDS[a.trigger] ?? "minecraft:tick" };
  if (a.trigger === "obtain_item") criterion.conditions = { items: [{ items: a.triggerItem || "minecraft:air" }] };
  else if (a.trigger === "consume_item") criterion.conditions = { item: { items: a.triggerItem || "minecraft:air" } };
  else if (a.trigger === "changed_dimension" && a.toDimension) criterion.conditions = { to: a.toDimension };
  const criteria: Record<string, unknown> = { granted: criterion };

  const body: Record<string, unknown> = {
    ...(a.parentId ? { parent: a.parentId } : {}),
    display,
    criteria,
    requirements: [["granted"]],
  };
  return JSON.stringify(body, null, 2);
}

const COOKING_RECIPE_TYPES = new Set(["smelting", "blasting", "smoking", "campfire"]);

function recipeResult(r: RecipeSpec): Record<string, unknown> {
  return r.resultCount === 1 ? { id: r.resultItem } : { id: r.resultItem, count: r.resultCount };
}

function recipeJson(r: RecipeSpec): string {
  const result = recipeResult(r);
  const groupCategory = { ...(r.group ? { group: r.group } : {}), ...(r.category ? { category: r.category } : {}) };
  let body: Record<string, unknown>;

  if (r.type === "shaped") {
    const grid = r.grid ?? new Array(9).fill(null);
    const rows = [grid.slice(0, 3), grid.slice(3, 6), grid.slice(6, 9)];
    const distinct = [...new Set(grid.filter((c): c is string => !!c))];
    const chars = "ABCDEFGHI";
    const keyChar = new Map(distinct.map((id, i) => [id, chars[i]]));
    const pattern = rows.map((row) => row.map((cell) => (cell ? keyChar.get(cell) : " ")).join(""));
    const key = Object.fromEntries(distinct.map((id) => [keyChar.get(id), id]));
    body = { type: "minecraft:crafting_shaped", key, pattern, result, ...groupCategory };
  } else if (r.type === "shapeless") {
    body = { type: "minecraft:crafting_shapeless", ingredients: r.ingredients ?? [], result, ...groupCategory };
  } else if (r.type === "stonecutting") {
    body = { type: "minecraft:stonecutting", ingredient: r.ingredient ?? "", result };
  } else if (r.type === "smithing") {
    body = {
      type: "minecraft:smithing_transform",
      template: r.smithingTemplate || "minecraft:netherite_upgrade_smithing_template",
      base: r.smithingBase || "minecraft:diamond_sword",
      addition: r.smithingAddition || "minecraft:netherite_ingot",
      result,
    };
  } else {
    body = {
      type: `minecraft:${r.type}`,
      ingredient: r.ingredient ?? "",
      result,
      ...(COOKING_RECIPE_TYPES.has(r.type) && r.experience ? { experience: r.experience } : {}),
      ...(COOKING_RECIPE_TYPES.has(r.type) && r.cookingTime ? { cooking_time: r.cookingTime } : {}),
      ...groupCategory,
    };
  }
  return JSON.stringify(body, null, 2);
}

/** Companion "obtaining any of these items unlocks the recipe" advancement — the exact real
 * shape every vanilla recipe uses (parent "minecraft:recipes/root", one inventory_changed
 * criterion per unlock item OR'd against a shared minecraft:recipe_unlocked criterion, "recipes"
 * reward), verified against a real extracted vanilla advancement (see plan file). `ns` is the
 * recipe's own output namespace (see RecipeSpec.namespace) — the advancement file itself always
 * lives under the project's own modId regardless of a vanilla-override namespace. */
function recipeUnlockAdvancementJson(ns: string, r: RecipeSpec): string {
  const items = (r.unlockItems ?? []).filter((i) => i.trim());
  const criteria: Record<string, unknown> = {
    has_the_recipe: { trigger: "minecraft:recipe_unlocked", conditions: { recipe: `${ns}:${r.id}` } },
  };
  const requirements: string[][] = [];
  items.forEach((item, i) => {
    const key = `has_item_${i}`;
    criteria[key] = { trigger: "minecraft:inventory_changed", conditions: { items: [{ items: item }] } };
    requirements.push(["has_the_recipe", key]);
  });
  const body = {
    parent: "minecraft:recipes/root",
    criteria,
    requirements,
    rewards: { recipes: [`${ns}:${r.id}`] },
  };
  return JSON.stringify(body, null, 2);
}

function tradeStackJson(s: TradeItemStack): Record<string, unknown> {
  return s.count === 1 ? { id: s.item } : { id: s.item, count: s.count };
}

function tradeJson(t: TradeSpec): string {
  const body: Record<string, unknown> = {
    gives: tradeStackJson(t.gives),
    wants: tradeStackJson(t.wants),
    ...(t.additionalWants ? { additional_wants: tradeStackJson(t.additionalWants) } : {}),
    max_uses: t.maxUses,
    xp: t.xp,
  };
  return JSON.stringify(body, null, 2);
}

/** Path (under data/minecraft/tags/villager_trade/) of the vanilla tag a trade needs to join —
 * writing to the "minecraft" namespace here is intentional: tag files with the same path from
 * multiple datapacks/mods merge additively (unless "replace": true), so this joins vanilla's own
 * trade pool instead of overwriting it. */
function tradeTagPath(t: TradeSpec): string {
  return t.category === "villager"
    ? `${t.profession}/level_${t.level}`
    : `wandering_trader/${t.wanderingPool}`;
}

function lootTableJson(entry: LootEntrySpec): string {
  const countFn =
    entry.minCount === entry.maxCount
      ? (entry.minCount === 1 ? null : { function: "minecraft:set_count", count: entry.minCount })
      : { function: "minecraft:set_count", count: { type: "minecraft:uniform", min: entry.minCount, max: entry.maxCount } };
  const lootEntry: Record<string, unknown> = { type: "minecraft:item", name: entry.item, weight: entry.weight };
  if (countFn) lootEntry.functions = [countFn];
  const body = { type: "minecraft:chest", pools: [{ rolls: 1, entries: [lootEntry] }] };
  return JSON.stringify(body, null, 2);
}

function lootModifierJson(modId: string, entry: LootEntrySpec): string {
  const body = {
    type: "neoforge:add_table",
    table: `${modId}:${entry.id}`,
    conditions: [{ condition: "neoforge:loot_table_id", loot_table_id: `minecraft:${entry.targetLootTable}` }],
  };
  return JSON.stringify(body, null, 2);
}

/** Deep-clones a vanilla biome/dimension_type template and overrides a few whitelisted top-level
 * fields — see BiomeSpec/DimensionSpec's doc comments for why this clone-and-override approach is
 * used instead of hand-assembling the (currently quite volatile) full JSON. */
function cloneAndOverride(template: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(template)) as Record<string, unknown>;
  return { ...clone, ...overrides };
}

function biomeBody(b: BiomeSpec): Record<string, unknown> {
  const template = BIOME_TEMPLATES[b.baseTemplate];
  const attributes = { ...(template.attributes as Record<string, unknown> | undefined ?? {}) };
  attributes["minecraft:visual/sky_color"] = b.skyColor;
  const effects = { ...(template.effects as Record<string, unknown> | undefined ?? {}), water_color: b.waterColor };
  return cloneAndOverride(template, {
    temperature: b.temperature,
    downfall: b.downfall,
    has_precipitation: b.hasPrecipitation,
    attributes,
    effects,
  });
}

function biomeJson(b: BiomeSpec): string {
  return JSON.stringify(biomeBody(b), null, 2);
}

function dimensionTypeJson(d: DimensionSpec): string {
  const template = DIMENSION_TYPE_TEMPLATES[d.baseType];
  const attributes = { ...(template.attributes as Record<string, unknown> | undefined ?? {}) };
  const bedRule = { ...(attributes["minecraft:gameplay/bed_rule"] as Record<string, unknown> | undefined ?? {}) };
  attributes["minecraft:gameplay/bed_rule"] = {
    ...bedRule,
    can_set_spawn: d.canSetSpawn,
    can_sleep: d.canSleep,
    explodes: d.bedsExplode,
  };
  attributes["minecraft:gameplay/respawn_anchor_works"] = d.respawnAnchorWorks;
  const overrides: Record<string, unknown> = {
    has_skylight: d.hasSkylight,
    has_ceiling: d.hasCeiling,
    ambient_light: d.ambientLight,
    coordinate_scale: d.coordinateScale,
    has_fixed_time: d.hasFixedTime,
    attributes,
  };
  // Pins the light thresholds monsters need to spawn down to "total darkness only" — with this
  // project's always-flat, mostly-featureless generated terrain that's effectively "no monsters",
  // without an unbacked all-or-nothing field vanilla doesn't actually have at this level.
  if (!d.monstersCanSpawn) {
    overrides.monster_spawn_light_level = 0;
    overrides.monster_spawn_block_light_limit = 0;
  }
  const body = cloneAndOverride(template, overrides);
  return JSON.stringify(body, null, 2);
}

function dimensionJson(modId: string, d: DimensionSpec, biomeOverride?: string): string {
  const settings: Record<string, unknown> = {
    biome: biomeOverride ?? d.biome,
    features: d.generateDecorations,
    lakes: d.generateLakes,
    layers: d.layers.map((l) => ({ block: l.block, height: l.height })),
  };
  if (d.generateStructures) settings.structure_overrides = ["minecraft:villages", "minecraft:strongholds"];
  const body = {
    type: `${modId}:${d.id}`,
    generator: { type: "minecraft:flat", settings },
  };
  return JSON.stringify(body, null, 2);
}

export interface ExportBundleInput {
  screens?: ScreenSpec[];
  items?: ItemSpec[];
  blocks?: BlockSpec[];
  creativeTabs?: CreativeTabSpec[];
  customAttributes?: CustomAttributeSpec[];
  effects?: EffectSpec[];
  potions?: PotionSpec[];
  achievements?: AchievementSpec[];
  recipes?: RecipeSpec[];
  trades?: TradeSpec[];
  lootEntries?: LootEntrySpec[];
  biomes?: BiomeSpec[];
  dimensions?: DimensionSpec[];
  armors?: ArmorSpec[];
}

interface ResolvedInput {
  screens: ScreenSpec[]; items: ItemSpec[]; blocks: BlockSpec[]; creativeTabs: CreativeTabSpec[];
  customAttributes: CustomAttributeSpec[]; effects: EffectSpec[]; potions: PotionSpec[];
  achievements: AchievementSpec[]; recipes: RecipeSpec[]; trades: TradeSpec[]; lootEntries: LootEntrySpec[];
  biomes: BiomeSpec[]; dimensions: DimensionSpec[]; armors: ArmorSpec[];
}

function resolveInput(input: ExportBundleInput): ResolvedInput {
  return {
    screens: input.screens ?? [], items: input.items ?? [], blocks: input.blocks ?? [],
    creativeTabs: input.creativeTabs ?? [], customAttributes: input.customAttributes ?? [],
    effects: input.effects ?? [], potions: input.potions ?? [], achievements: input.achievements ?? [],
    recipes: input.recipes ?? [], trades: input.trades ?? [], lootEntries: input.lootEntries ?? [],
    biomes: input.biomes ?? [], dimensions: input.dimensions ?? [], armors: input.armors ?? [],
  };
}

function hasAnyGeneratedContent(r: ResolvedInput): boolean {
  return r.items.length > 0 || r.blocks.length > 0 || r.customAttributes.length > 0 || r.effects.length > 0 ||
    r.potions.length > 0 || r.achievements.length > 0 || r.recipes.length > 0 || r.trades.length > 0 ||
    r.lootEntries.length > 0 || r.biomes.length > 0 || r.dimensions.length > 0 || r.armors.length > 0;
}

function collectAllSrcs(r: ResolvedInput): Set<string> {
  const srcs = new Set<string>();
  for (const s of r.screens) for (const src of collectSpriteSrcs(s.widgets)) srcs.add(src);
  for (const it of r.items) if (it.texture) srcs.add(it.texture);
  for (const b of r.blocks) if (b.texture) srcs.add(b.texture);
  for (const a of r.achievements) if (!a.parentId && a.background) srcs.add(a.background);
  for (const e of r.effects) if (e.icon) srcs.add(e.icon);
  for (const a of r.armors) {
    if (a.iconHelmet) srcs.add(a.iconHelmet);
    if (a.iconChestplate) srcs.add(a.iconChestplate);
    if (a.iconLeggings) srcs.add(a.iconLeggings);
    if (a.iconBoots) srcs.add(a.iconBoots);
    if (a.equipmentTexture) srcs.add(a.equipmentTexture);
  }
  return srcs;
}

function resolveModId(r: ResolvedInput): string {
  return (
    r.screens.find((s) => s.modId?.trim())?.modId?.trim() ||
    r.items.find((i) => i.modId?.trim())?.modId?.trim() ||
    r.blocks.find((b) => b.modId?.trim())?.modId?.trim() ||
    r.effects.find((e) => e.modId?.trim())?.modId?.trim() ||
    r.potions.find((p) => p.modId?.trim())?.modId?.trim() ||
    r.achievements.find((a) => a.modId?.trim())?.modId?.trim() ||
    r.recipes.find((rc) => rc.modId?.trim())?.modId?.trim() ||
    r.trades.find((t) => t.modId?.trim())?.modId?.trim() ||
    r.lootEntries.find((l) => l.modId?.trim())?.modId?.trim() ||
    r.biomes.find((b) => b.modId?.trim())?.modId?.trim() ||
    r.dimensions.find((d) => d.modId?.trim())?.modId?.trim() ||
    r.armors.find((a) => a.modId?.trim())?.modId?.trim() ||
    "minecraft"
  );
}

/** The per-dimension biome-variant override `mobsCanSpawn=false` needs (see DimensionSpec's doc
 * comment) — factored out so both the real export path and the "Ressources" archive copy compute
 * the exact same override instead of drifting apart. */
function resolveDimensionBiomeOverride(modId: string, d: DimensionSpec, biomes: BiomeSpec[]): { override?: string; variantId?: string; variantJson?: string } {
  if (d.mobsCanSpawn) return {};
  const projectBiome = biomes.find((b) => d.biome === `${modId}:${b.id}`);
  if (!projectBiome) return {};
  const variantId = `${d.id}_biome`;
  const variantBody = { ...biomeBody(projectBiome), creature_spawn_probability: 0 };
  return { override: `${modId}:${variantId}`, variantId, variantJson: JSON.stringify(variantBody, null, 2) };
}

/**
 * Writes every generated real Minecraft file (models/blockstates/advancements/recipes/worldgen
 * JSON/etc, plus bundled textures) under `prefix` — `""` for a normal per-category export (files
 * land at the zip root, ready to extract straight into `src/main/resources/`), or a project-name
 * prefix for the full-project archive (see downloadFullProjectExport), which nests the very same
 * real files one level down rather than duplicating this generation logic. Returns how many
 * textures got bundled (used by the caller to decide whether a zip is even worth producing).
 */
function writeGeneratedFiles(zip: JSZip, prefix: string, modId: string, r: ResolvedInput, allTextures: Record<string, Blob>): number {
  let bundled = 0;
  for (const src of collectAllSrcs(r)) {
    const blob = allTextures[`pack:${src}`];
    if (blob) {
      zip.file(`${prefix}assets/${modId}/textures/${src}`, blob);
      bundled++;
    }
  }

  // Per-screen files at the exact path ScreenSpecLoader.fromClasspath reads them from.
  for (const s of r.screens) zip.file(`${prefix}assets/${modId}/screenspec/${s.id}.json`, JSON.stringify(s, null, 2));

  for (const item of r.items) {
    zip.file(`${prefix}assets/${modId}/models/item/${item.id}.json`, itemModelJson(modId, item));
    const stages = ((item.durability ?? 0) > 0 ? (item.damageStages ?? []) : [])
      .filter((s) => s.texture)
      .sort((a, b) => a.threshold - b.threshold);
    if (stages.length > 0) {
      const stageRefs = stages.map((s, i) => {
        const stageId = `${item.id}_stage${i + 1}`;
        zip.file(`${prefix}assets/${modId}/models/item/${stageId}.json`, itemModelJson(modId, { ...item, texture: s.texture }));
        return { threshold: s.threshold, modelRef: `${modId}:item/${stageId}` };
      });
      zip.file(`${prefix}assets/${modId}/items/${item.id}.json`, itemDamageDispatchJson(`${modId}:item/${item.id}`, stageRefs));
    } else {
      zip.file(`${prefix}assets/${modId}/items/${item.id}.json`, itemDefinitionJson(`${modId}:item/${item.id}`));
    }
  }
  for (const block of r.blocks) {
    zip.file(`${prefix}assets/${modId}/blockstates/${block.id}.json`, blockstateJson(modId, block));
    zip.file(`${prefix}assets/${modId}/models/block/${block.id}.json`, blockModelJson(modId, block));
    if (block.hasItem) {
      zip.file(`${prefix}assets/${modId}/models/item/${block.id}.json`, blockItemModelJson(modId, block));
      zip.file(`${prefix}assets/${modId}/items/${block.id}.json`, itemDefinitionJson(`${modId}:item/${block.id}`));
    }
  }
  if (r.items.length > 0) zip.file(`${prefix}assets/${modId}/screenspec/items.json`, JSON.stringify(r.items, null, 2));
  if (r.blocks.length > 0) zip.file(`${prefix}assets/${modId}/screenspec/blocks.json`, JSON.stringify(r.blocks, null, 2));
  if (r.customAttributes.length > 0) zip.file(`${prefix}assets/${modId}/screenspec/attributes.json`, JSON.stringify(r.customAttributes, null, 2));
  if (r.effects.length > 0) zip.file(`${prefix}assets/${modId}/screenspec/effects.json`, JSON.stringify(r.effects, null, 2));
  if (r.potions.length > 0) zip.file(`${prefix}assets/${modId}/screenspec/potions.json`, JSON.stringify(r.potions, null, 2));
  // Icon at the exact path Minecraft resolves a mob effect's status icon from automatically —
  // same "own copy at a fixed convention path" idea as the armor equipment texture below.
  for (const e of r.effects) {
    if (!e.icon) continue;
    const blob = allTextures[`pack:${e.icon}`];
    if (blob) zip.file(`${prefix}assets/${modId}/textures/mob_effect/${e.id}.png`, blob);
  }

  // Achievements/Recipes/Trades/Loot are pure vanilla datapack JSON — Minecraft loads them
  // straight off this mod jar's data/ folder itself, no screenspec/*.json manifest or Java needed.
  for (const a of r.achievements) zip.file(`${prefix}data/${modId}/advancement/${a.id}.json`, achievementJson(modId, a));
  for (const rc of r.recipes) {
    const ns = rc.namespace?.trim() || modId;
    zip.file(`${prefix}data/${ns}/recipe/${rc.id}.json`, recipeJson(rc));
    if (rc.unlockItems && rc.unlockItems.some((i) => i.trim())) {
      zip.file(`${prefix}data/${modId}/advancement/${rc.id}_unlock.json`, recipeUnlockAdvancementJson(ns, rc));
    }
  }

  for (const t of r.trades) zip.file(`${prefix}data/${modId}/villager_trade/${t.id}.json`, tradeJson(t));
  // Multiple trades can target the same vanilla tag (e.g. two "farmer level 1" trades) — merge
  // their ids into one tag file's "values" array instead of overwriting each other.
  const tradeTagValues = new Map<string, string[]>();
  for (const t of r.trades) {
    const path = tradeTagPath(t);
    const list = tradeTagValues.get(path) ?? [];
    list.push(`${modId}:${t.id}`);
    tradeTagValues.set(path, list);
  }
  for (const [path, values] of tradeTagValues) {
    zip.file(`${prefix}data/minecraft/tags/villager_trade/${path}.json`, JSON.stringify({ values }, null, 2));
  }

  for (const l of r.lootEntries) {
    zip.file(`${prefix}data/${modId}/loot_table/${l.id}.json`, lootTableJson(l));
    zip.file(`${prefix}data/${modId}/loot_modifiers/${l.id}.json`, lootModifierJson(modId, l));
  }

  for (const b of r.biomes) zip.file(`${prefix}data/${modId}/worldgen/biome/${b.id}.json`, biomeJson(b));
  for (const d of r.dimensions) {
    zip.file(`${prefix}data/${modId}/dimension_type/${d.id}.json`, dimensionTypeJson(d));
    const ov = resolveDimensionBiomeOverride(modId, d, r.biomes);
    if (ov.variantId && ov.variantJson) zip.file(`${prefix}data/${modId}/worldgen/biome/${ov.variantId}.json`, ov.variantJson);
    zip.file(`${prefix}data/${modId}/dimension/${d.id}.json`, dimensionJson(modId, d, ov.override));
  }

  for (const armor of r.armors) {
    const pieces: [string, string][] = [
      ["helmet", armor.iconHelmet],
      ["chestplate", armor.iconChestplate],
      ["leggings", armor.iconLeggings],
      ["boots", armor.iconBoots],
    ];
    for (const [slot, texture] of pieces) {
      if (!texture) continue;
      const pieceId = `${armor.id}_${slot}`;
      zip.file(`${prefix}assets/${modId}/models/item/${pieceId}.json`, armorPieceModelJson(modId, texture));
      zip.file(`${prefix}assets/${modId}/items/${pieceId}.json`, itemDefinitionJson(`${modId}:item/${pieceId}`));
    }
    if (armor.equipmentTexture) {
      zip.file(`${prefix}assets/${modId}/equipment/${armor.id}.json`, equipmentAssetJson(modId, armor.id));
      const blob = allTextures[`pack:${armor.equipmentTexture}`];
      if (blob) {
        zip.file(`${prefix}assets/${modId}/textures/entity/equipment/humanoid/${armor.id}.png`, blob);
        zip.file(`${prefix}assets/${modId}/textures/entity/equipment/humanoid_leggings/${armor.id}.png`, blob);
      }
    }
    if (armor.repairItem) {
      zip.file(`${prefix}data/${modId}/tags/item/${armor.id}_repair.json`, JSON.stringify({ values: [armor.repairItem] }, null, 2));
    }
  }
  if (r.armors.length > 0) zip.file(`${prefix}assets/${modId}/screenspec/armors.json`, JSON.stringify(r.armors, null, 2));

  return bundled;
}

/**
 * Downloads `jsonFilename` as a plain JSON file — unless there's anything that needs bundling
 * (a screen's sprite widget referencing a custom pack texture, or any item/block, which always
 * need their generated model/blockstate JSON + texture bundled) — in which case it downloads a
 * .zip with:
 *  - `jsonFilename` at the zip root (human-readable copy of what was exported)
 *  - referenced textures at `assets/<modid>/textures/<src>` (matches SpecWidgetRenderer/runtime lookup)
 *  - for items/blocks: generated `assets/<modid>/models/item|block/<id>.json` and
 *    `assets/<modid>/blockstates/<id>.json`, plus an `assets/<modid>/screenspec/items.json` /
 *    `.../blocks.json` / `.../attributes.json` manifest — the exact path neoforge-runtime's
 *    auto-discovery loader reads (see ItemSpecLoader/BlockSpecLoader/CustomAttributeSpecLoader.fromClasspath).
 * Ready to extract straight into a mod's `src/main/resources/`. Used by every per-doc and
 * per-category "Export"/"Export All" button — see downloadFullProjectExport for the differently
 * laid-out "Export Project" button.
 */
export async function downloadExport(jsonFilename: string, json: string, input: ExportBundleInput): Promise<void> {
  const r = resolveInput(input);
  const srcs = collectAllSrcs(r);
  const needsGeneratedAssets = hasAnyGeneratedContent(r);

  if (srcs.size === 0 && !needsGeneratedAssets) {
    downloadBlob(new Blob([json], { type: "application/json" }), jsonFilename);
    return;
  }

  const allTextures = srcs.size > 0 ? await loadAllTextures() : {};
  const modId = resolveModId(r);

  const zip = new JSZip();
  zip.file(jsonFilename, json);
  const bundled = writeGeneratedFiles(zip, "", modId, r, allTextures);

  if (bundled === 0 && !needsGeneratedAssets) {
    // Referenced textures aren't loaded in this browser (no pack extracted this session) —
    // nothing to bundle, so a zip would just be JSON-in-a-wrapper. Fall back to plain JSON.
    downloadBlob(new Blob([json], { type: "application/json" }), jsonFilename);
    return;
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zipBlob, jsonFilename.replace(/\.json$/, ".zip"));
}

/**
 * Populates the human-browsable "Ressources/<Category>/<id>/" tree for the full-project export —
 * one subfolder per entry with its raw editable spec.json plus a copy of whatever real generated
 * Minecraft file(s) writeGeneratedFiles already wrote for it (same generator functions called a
 * second time — they're pure, so this is just a second write location, not a second source of
 * truth to drift out of sync). Folder names match what was asked for verbatim (including the
 * "Achievment" spelling); the few real content types not in that original list — Recipes, Trading,
 * Loot Tables, Armor — get their own folder the same way rather than being silently left out.
 */
function writeArchiveCopies(zip: JSZip, prefix: string, modId: string, r: ResolvedInput, allTextures: Record<string, Blob>): void {
  for (const a of r.achievements) {
    zip.file(`${prefix}Achievment/${a.id}/spec.json`, JSON.stringify(a, null, 2));
    zip.file(`${prefix}Achievment/${a.id}/advancement.json`, achievementJson(modId, a));
  }
  for (const attr of r.customAttributes) {
    zip.file(`${prefix}Attributes/${attr.id}/spec.json`, JSON.stringify(attr, null, 2));
  }
  for (const b of r.biomes) {
    zip.file(`${prefix}Biome/${b.id}/spec.json`, JSON.stringify(b, null, 2));
    zip.file(`${prefix}Biome/${b.id}/biome.json`, biomeJson(b));
  }
  for (const block of r.blocks) {
    zip.file(`${prefix}Block/${block.id}/spec.json`, JSON.stringify(block, null, 2));
    zip.file(`${prefix}Block/${block.id}/blockstate.json`, blockstateJson(modId, block));
    zip.file(`${prefix}Block/${block.id}/model.json`, blockModelJson(modId, block));
    if (block.hasItem) {
      zip.file(`${prefix}Block/${block.id}/item_model.json`, blockItemModelJson(modId, block));
      zip.file(`${prefix}Block/${block.id}/item_definition.json`, itemDefinitionJson(`${modId}:item/${block.id}`));
    }
  }
  for (const tab of r.creativeTabs) {
    zip.file(`${prefix}CreativeTabs/${tab.id}/spec.json`, JSON.stringify(tab, null, 2));
  }
  for (const d of r.dimensions) {
    zip.file(`${prefix}Dimension/${d.id}/spec.json`, JSON.stringify(d, null, 2));
    zip.file(`${prefix}Dimension/${d.id}/dimension_type.json`, dimensionTypeJson(d));
    const ov = resolveDimensionBiomeOverride(modId, d, r.biomes);
    zip.file(`${prefix}Dimension/${d.id}/dimension.json`, dimensionJson(modId, d, ov.override));
  }
  for (const e of r.effects) {
    zip.file(`${prefix}Effects/${e.id}/spec.json`, JSON.stringify(e, null, 2));
  }
  for (const it of r.items) {
    zip.file(`${prefix}Items/${it.id}/spec.json`, JSON.stringify(it, null, 2));
    zip.file(`${prefix}Items/${it.id}/model.json`, itemModelJson(modId, it));
    const stages = ((it.durability ?? 0) > 0 ? (it.damageStages ?? []) : [])
      .filter((s) => s.texture)
      .sort((a, b) => a.threshold - b.threshold);
    zip.file(
      `${prefix}Items/${it.id}/item_definition.json`,
      stages.length > 0
        ? itemDamageDispatchJson(`${modId}:item/${it.id}`, stages.map((s, i) => ({ threshold: s.threshold, modelRef: `${modId}:item/${it.id}_stage${i + 1}` })))
        : itemDefinitionJson(`${modId}:item/${it.id}`)
    );
  }
  for (const p of r.potions) {
    zip.file(`${prefix}Potions/${p.id}/spec.json`, JSON.stringify(p, null, 2));
  }
  for (const src of collectAllSrcs(r)) {
    const blob = allTextures[`pack:${src}`];
    if (blob) zip.file(`${prefix}RawPNG/${src.replace(/\//g, "_")}`, blob);
  }
  zip.folder(`${prefix}Structures`); // no Structures feature yet — reserved, kept as an empty folder.
  for (const s of r.screens) {
    zip.file(`${prefix}UI/${s.id}/spec.json`, JSON.stringify(s, null, 2));
  }

  for (const rc of r.recipes) {
    zip.file(`${prefix}Recipes/${rc.id}/spec.json`, JSON.stringify(rc, null, 2));
    zip.file(`${prefix}Recipes/${rc.id}/recipe.json`, recipeJson(rc));
    if (rc.unlockItems && rc.unlockItems.some((i) => i.trim())) {
      zip.file(`${prefix}Recipes/${rc.id}/unlock_advancement.json`, recipeUnlockAdvancementJson(rc.namespace?.trim() || modId, rc));
    }
  }
  for (const t of r.trades) {
    zip.file(`${prefix}Trading/${t.id}/spec.json`, JSON.stringify(t, null, 2));
    zip.file(`${prefix}Trading/${t.id}/trade.json`, tradeJson(t));
  }
  for (const l of r.lootEntries) {
    zip.file(`${prefix}LootTables/${l.id}/spec.json`, JSON.stringify(l, null, 2));
    zip.file(`${prefix}LootTables/${l.id}/loot_table.json`, lootTableJson(l));
    zip.file(`${prefix}LootTables/${l.id}/loot_modifier.json`, lootModifierJson(modId, l));
  }
  for (const armor of r.armors) {
    zip.file(`${prefix}Armor/${armor.id}/spec.json`, JSON.stringify(armor, null, 2));
    if (armor.equipmentTexture) zip.file(`${prefix}Armor/${armor.id}/equipment.json`, equipmentAssetJson(modId, armor.id));
  }
}

/**
 * The "Export Project" entry point — unlike downloadExport (used by every per-category Export/
 * Export All button, which produces a flat assets/data zip ready to extract straight into a mod's
 * resources) this always wraps everything under one `<projectName>/` folder and, alongside the
 * very same real assets/data files, adds a human-browsable `Ressources/<Category>/<id>/` copy of
 * each entry — spec.json plus whatever real Minecraft file(s) exist for it. The assets/data files
 * are what actually make the mod work when dropped into `src/main/resources/`; Ressources/ is for
 * looking through the project without hunting through Minecraft's own folder conventions.
 */
export async function downloadFullProjectExport(projectName: string, projectJson: string, input: ExportBundleInput): Promise<void> {
  const r = resolveInput(input);
  const allTextures = await loadAllTextures();
  const modId = resolveModId(r);
  const root = `${projectName}/`;

  const zip = new JSZip();
  zip.file(`${root}${projectName}.json`, projectJson);
  writeGeneratedFiles(zip, root, modId, r, allTextures);
  writeArchiveCopies(zip, `${root}Ressources/`, modId, r, allTextures);

  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zipBlob, `${projectName}.zip`);
}
