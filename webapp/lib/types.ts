export interface WidgetSpec {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  icon: string | null;
  action?: string;
  bindings?: Record<string, string>;
  props: Record<string, string>;
  item_template?: WidgetSpec[];
  parentId?: string;
  hidden?: boolean;
}

export interface SlotAreaSpec {
  id: string;
  x: number;
  y: number;
  cols: number;
  slot_size: number;
  /**
   * Rows visible at once. The real total row count isn't known here — it's determined at
   * runtime by whatever inventory the mod actually binds (see neoforge-runtime's
   * ScrollableSlotArea), so it scrolls vertically whenever that turns out to be more rows
   * than fit in this viewport.
   */
  viewport_rows: number;
  source?: "player" | "player_hotbar" | null;
  /**
   * Which dimension scrolls: "y" (default, vertical — rows overflow past viewport_rows) or "x"
   * (horizontal — columns overflow past `cols` instead, with viewport_rows as the fixed row
   * count). See neoforge-runtime's ScrollableSlotArea. Not yet exposed in the designer UI — set by
   * hand-editing exported JSON, or by mod code building a ScreenSpec programmatically.
   */
  axis?: "x" | "y";
}

export interface ContainerSpec {
  slots: SlotAreaSpec[];
}

export type BindingType = "string" | "number" | "boolean";

export interface BindingNode {
  type?: BindingType;
  previewValue?: string | number | boolean;
  children?: Record<string, BindingNode>;
}

export type BindingsSchema = Record<string, BindingNode>;

export interface ScreenSpec {
  id: string;
  modId?: string;
  width: number;
  height: number;
  widgets: WidgetSpec[];
  container?: ContainerSpec | null;
  bindingsSchema?: BindingsSchema;
  actions?: string[];
  /** Webapp version that produced this exported JSON — used to pick migrations on import. See webapp/lib/migrations.ts. */
  appVersion?: string;
}

// Vanilla creative-inventory tabs (most common subset) plus "custom" — a shared tab
// auto-created per modId at runtime by neoforge-runtime that collects everything marked
// "custom". Beyond these fixed keys, a project can also define its own named tabs (see
// CreativeTabSpec below) — an item/block's `creativeTab` field is one of these keys, a
// CreativeTabSpec's `id`, or "custom".
export type CreativeTabKey =
  | "BUILDING_BLOCKS"
  | "COLORED_BLOCKS"
  | "NATURAL_BLOCKS"
  | "FUNCTIONAL_BLOCKS"
  | "REDSTONE_BLOCKS"
  | "TOOLS_AND_UTILITIES"
  | "COMBAT"
  | "FOOD_AND_DRINKS"
  | "INGREDIENTS"
  | "SPAWN_EGGS"
  | "custom";

/** A user-defined creative-inventory tab (beyond the single shared "custom" one) — e.g. a mod
 * with "Weapons" and "Tools" as separate tabs instead of one big shared bucket. */
export interface CreativeTabSpec {
  /** registry name for the tab, e.g. "weapons" */
  id: string;
  displayName: string;
}

export type AttributeOperation = "add_value" | "add_multiplied_base" | "add_multiplied_total";

// A subset of an equipment slot ("head", "feet", ...) or a slot group ("armor", "hand", "any").
// Mirrors vanilla's EquipmentSlotGroup used by the AttributeModifiers item component.
export type EquipmentSlotGroup = "any" | "hand" | "mainhand" | "offhand" | "armor" | "head" | "chest" | "legs" | "feet" | "body";

export interface AttributeModifierSpec {
  /** e.g. "generic.attack_damage" (curated vanilla list) or a project CustomAttributeSpec's id. */
  attribute: string;
  amount: number;
  operation: AttributeOperation;
  slot: EquipmentSlotGroup;
}

export type AttributeSentiment = "positive" | "neutral" | "negative";

/**
 * A project-defined custom Attribute (beyond the curated vanilla set) — global to the project:
 * define once, reference from any item's attribute modifiers, and/or attach as a default stat on
 * living entities/players. Mirrors neoforge-runtime's CustomAttributeSpec.java.
 */
export interface CustomAttributeSpec {
  /** registry name, e.g. "mana" */
  id: string;
  displayName: string;
  defaultBase: number;
  min: number;
  max: number;
  /** tooltip color when shown on an item — matches vanilla's Attribute.Sentiment */
  sentiment: AttributeSentiment;
  /** adds this attribute (at defaultBase) to every living entity type */
  addToAllLiving: boolean;
  /** adds this attribute (at defaultBase) to the player specifically — independent of addToAllLiving */
  addToPlayers: boolean;
}

export interface ItemSpec {
  id: string;
  modId?: string;
  displayName: string;
  /** pack texture key, e.g. "item/ruby_sword.png" — see TextureContext.packTextures */
  texture: string;
  category: "simple" | "food" | "armor";
  stackSize: number;
  rarity: "common" | "uncommon" | "rare" | "epic";
  fireResistant: boolean;
  /** >0 makes the item damageable (maxDamage); implies stackSize is forced to 1 at export time */
  durability?: number;
  nutrition?: number;
  saturation?: number;
  alwaysEdible?: boolean;
  /** only meaningful for category === "armor" — which equipment slot this piece occupies */
  armorSlot?: "helmet" | "chestplate" | "leggings" | "boots";
  /** declarative stat modifiers (attack damage, armor, speed, ...) — vanilla's data-driven
   * AttributeModifiers item component, not a scripted power system. Armor items get a sensible
   * default "generic.armor" entry seeded when category is switched to "armor". */
  attributes?: AttributeModifierSpec[];
  /** a CreativeTabKey, or a project-defined CreativeTabSpec's id */
  creativeTab: string;
  /** Only meaningful when durability > 0 — swaps the item's icon once it's been damaged past each
   * stage's threshold (0 = undamaged, 1 = about to break), e.g. a sword visually chipping/rusting
   * as it wears down. Real mechanism: this MC version's item model definitions support a
   * `minecraft:range_dispatch` keyed on the `minecraft:damage` property (the item's normalized
   * damage fraction) — not a texture animation or a fake overlay. Export sorts by threshold. */
  damageStages?: { threshold: number; texture: string }[];
  appVersion?: string;
}

export type BlockFaceKey = "up" | "down" | "north" | "south" | "east" | "west";

export interface BlockSpec {
  id: string;
  modId?: string;
  displayName: string;
  /** single texture applied to all 6 faces (cube_all) — the fallback for any face without an
   * override in `faceTextures` */
  texture: string;
  /** Per-face texture overrides. A face left unset renders `texture`; with none set the block
   * still exports as a single cube_all model (parent "block/cube" only kicks in once at least
   * one face is overridden). */
  faceTextures?: Partial<Record<BlockFaceKey, string>>;
  hardness: number;
  resistance: number;
  requiresTool: boolean;
  /** light level emitted, 0-15 */
  luminance: number;
  soundType: "stone" | "wood" | "metal" | "gravel" | "grass" | "glass" | "wool" | "sand";
  /** whether to also register a BlockItem so the block can be held/placed */
  hasItem: boolean;
  /** a CreativeTabKey, or a project-defined CreativeTabSpec's id — only relevant when hasItem */
  creativeTab: string;
  appVersion?: string;
}

export type EffectCategory = "beneficial" | "harmful" | "neutral";

export interface EffectSpec {
  id: string;
  modId?: string;
  displayName: string;
  category: EffectCategory;
  /** hex color, e.g. "#3388ff" — particle/potion-swirl color */
  color: string;
  /** pack texture key for the inventory/HUD status icon — exported to
   * assets/<modId>/textures/mob_effect/<id>.png, the exact convention Minecraft resolves an
   * effect's icon from automatically (no Java registration needed for the texture itself). */
  icon: string;
  /** Applied once immediately instead of ticking for a duration (like Instant Health/Instant
   * Damage) — real MobEffect#isInstantaneous() override, not cosmetic. */
  isInstant: boolean;
  /** A curated vanilla particle id (e.g. "minecraft:witch") shown around the entity while
   * affected, instead of the default color-tinted swirl derived from `color`. Empty = default. */
  particle: string;
  /** A vanilla sound id (e.g. "minecraft:entity.player.levelup") played once when the effect is
   * added — real MobEffect#withSoundOnAdded. Empty = none. */
  soundOnAdded: string;
  /** stat modifiers applied while the effect is active — same declarative mechanism as
   * ItemSpec.attributes, scaled per amplifier level by vanilla automatically */
  attributes?: AttributeModifierSpec[];
  appVersion?: string;
}

export interface PotionEffectEntry {
  /** a vanilla effect id (e.g. "minecraft:speed") or a project EffectSpec's bare id */
  effectId: string;
  durationSeconds: number;
  amplifier: number;
}

export interface PotionSpec {
  id: string;
  modId?: string;
  displayName: string;
  effects: PotionEffectEntry[];
  appVersion?: string;
}

export type AdvancementFrame = "task" | "goal" | "challenge";
export type AdvancementTrigger =
  | "always" | "obtain_item" | "consume_item" | "placed_block" | "changed_dimension" | "slept_in_bed"
  | "player_killed_entity" | "entity_killed_player" | "enchanted_item" | "fishing_rod_hooked"
  | "villager_trade" | "bred_animals" | "tame_animal";

/**
 * A vanilla advancement — pure datapack JSON (data/<modId>/advancement/<id>.json), no Java needed;
 * NeoForge mods act as a datapack source automatically. "Basis-Spec" like everything else here: no
 * criteria scripting — one curated trigger, with a target item/dimension field for the two triggers
 * that need one (obtain_item, changed_dimension); the rest just fire on the raw action (e.g.
 * "bred_animals" fires on breeding any two animals, not a specific species — matches how several
 * real vanilla advancements use these same triggers with no extra conditions at all).
 */
export interface AchievementSpec {
  id: string;
  modId?: string;
  title: string;
  description: string;
  /** item id (vanilla, e.g. "minecraft:diamond", or a project ItemSpec's id) shown as the icon */
  icon: string;
  frame: AdvancementFrame;
  /** another AchievementSpec's id, or "" for a root (tab) advancement */
  parentId: string;
  /** pack texture key for the tab background image — only used when parentId is "" (root) */
  background?: string;
  showToast: boolean;
  announceToChat: boolean;
  hidden: boolean;
  trigger: AdvancementTrigger;
  /** obtain_item / consume_item only — the item that grants it */
  triggerItem?: string;
  /** changed_dimension only — the dimension id that grants it on arrival, e.g. "minecraft:the_nether" */
  toDimension?: string;
  appVersion?: string;
}

export type RecipeType = "shaped" | "shapeless" | "smelting" | "blasting" | "smoking" | "campfire" | "stonecutting" | "smithing";

/**
 * A crafting/cooking recipe — pure datapack JSON (data/<modId>/recipe/<id>.json), no Java needed.
 */
export interface RecipeSpec {
  id: string;
  modId?: string;
  /** Output datapack namespace, e.g. "data/<namespace>/recipe/<id>.json" — defaults to the
   * project's own modId when empty. Set to "minecraft" (or another mod's id) to deliberately
   * override an existing recipe sharing that same namespace+id — real datapack override
   * behavior, not special-cased here. */
  namespace?: string;
  type: RecipeType;
  resultItem: string;
  resultCount: number;
  /** shaped only — 9 cells (3x3), row-major, item id or null for empty. Empty border rows/columns
   * are trimmed automatically by Minecraft at load time. */
  grid?: (string | null)[];
  /** shapeless only — flat ingredient list (repeat an id for >1 of the same ingredient) */
  ingredients?: string[];
  /** smelting/blasting/smoking/campfire/stonecutting only — the single input item */
  ingredient?: string;
  /** smelting-family only (ignored for stonecutting/shaped/shapeless) */
  experience?: number;
  cookingTime?: number;
  /** smithing only — real minecraft:smithing_transform fields (Smithing Table's 3 fixed slots:
   * upgrade template, base item, addition material). Not a shape/grid — always exactly these 3. */
  smithingTemplate?: string;
  smithingBase?: string;
  smithingAddition?: string;
  /** Recipe-book merge group, e.g. "planks" — real vanilla "group" field (crafting/cooking only).
   * Recipes sharing a group collapse into one slot in the recipe book. */
  group?: string;
  /** Recipe-book category tab — real vanilla "category" field. Crafting:
   * "building"|"redstone"|"equipment"|"misc"; cooking (smelting/blasting/smoking/campfire):
   * "food"|"blocks"|"misc"; not used by stonecutting/smithing. Empty = vanilla default (misc). */
  category?: string;
  /** Vanilla item ids — obtaining ANY of these unlocks the recipe in the recipe book. Generates a
   * real companion advancement (parent "minecraft:recipes/root", minecraft:recipe_unlocked
   * criterion, "recipes" reward) at export time, same mechanism every vanilla recipe uses. Empty
   * = recipe is never auto-unlocked via this mechanism (still usable, just not recipe-book-visible
   * without some other unlock path). */
  unlockItems?: string[];
  appVersion?: string;
}

export type VillagerProfessionKey =
  | "armorer" | "butcher" | "cartographer" | "cleric" | "farmer" | "fisherman" | "fletcher"
  | "leatherworker" | "librarian" | "mason" | "shepherd" | "toolsmith" | "weaponsmith";

export type WanderingTraderPool = "common" | "uncommon" | "buying";

export interface TradeItemStack {
  item: string;
  count: number;
}

/**
 * A villager or wandering-trader trade — pure datapack JSON (data/<modId>/villager_trade/<id>.json
 * plus a tag-merge entry under the vanilla data/minecraft/tags/villager_trade/... tag so it joins
 * the existing trade pool without replacing it), no Java needed.
 */
export interface TradeSpec {
  id: string;
  modId?: string;
  category: "villager" | "wandering_trader";
  /** category === "villager" only */
  profession?: VillagerProfessionKey;
  /** category === "villager" only, 1-5 */
  level?: number;
  /** category === "wandering_trader" only */
  wanderingPool?: WanderingTraderPool;
  wants: TradeItemStack;
  additionalWants?: TradeItemStack;
  gives: TradeItemStack;
  maxUses: number;
  xp: number;
  appVersion?: string;
}

/** Curated vanilla chest loot tables this project can add extra loot into, without touching the
 * rest of the table's vanilla contents (via a neoforge:add_table global loot modifier). */
export type LootTargetKey =
  | "chests/village/village_weaponsmith" | "chests/village/village_armorer" | "chests/village/village_toolsmith"
  | "chests/village/village_temple" | "chests/village/village_desert_house" | "chests/village/village_plains_house"
  | "chests/abandoned_mineshaft" | "chests/buried_treasure" | "chests/desert_pyramid" | "chests/jungle_temple"
  | "chests/simple_dungeon" | "chests/nether_bridge" | "chests/stronghold_corridor" | "chests/stronghold_library"
  | "chests/woodland_mansion" | "chests/ancient_city" | "chests/bastion_treasure" | "chests/shipwreck_treasure"
  | "chests/end_city_treasure" | "chests/pillager_outpost" | "chests/underwater_ruin_big" | "chests/underwater_ruin_small";

/**
 * Extra loot injected into an existing vanilla chest loot table — pure datapack JSON
 * (data/<modId>/loot_modifiers/<id>.json + data/<modId>/loot_table/<id>.json), no Java needed.
 */
export interface LootEntrySpec {
  id: string;
  modId?: string;
  targetLootTable: LootTargetKey;
  item: string;
  weight: number;
  minCount: number;
  maxCount: number;
  appVersion?: string;
}

/**
 * A custom Biome — clones a full vanilla biome (see webapp/lib/biomeTemplates.ts) and overrides
 * only a few climate/color fields, rather than hand-building the whole (currently quite volatile)
 * biome JSON format. Pure datapack JSON export (data/<modId>/worldgen/biome/<id>.json), no Java.
 */
export interface BiomeSpec {
  id: string;
  modId?: string;
  /** which vanilla biome to clone as the starting point — see lib/biomeTemplates.ts */
  baseTemplate: "plains" | "desert" | "forest" | "ocean" | "swamp" | "taiga" | "nether_wastes" | "the_end" | "the_void";
  temperature: number;
  downfall: number;
  hasPrecipitation: boolean;
  /** hex color, e.g. "#78a7ff" */
  skyColor: string;
  /** hex color, e.g. "#3f76e4" */
  waterColor: string;
  /** which kind of dimension this biome is meant for — organizational only (this MC version's
   * Overworld/Nether biome placement is hardcoded in Java, not datapack-overridable, so this does
   * NOT inject the biome into vanilla's own world generation). Use it as the `biome` on a matching
   * custom Dimension (a flat world using this biome) to actually make it explorable. */
  spawnDimension: "overworld" | "nether" | "end";
  appVersion?: string;
}

export interface FlatLayerSpec {
  block: string;
  height: number;
}

/**
 * A custom Dimension — pairs a cloned vanilla dimension_type (physics/sky/light, see
 * lib/dimensionTemplates.ts, same clone-and-override rationale as BiomeSpec) with a
 * `minecraft:flat` chunk generator (a fixed layer stack + one biome) rather than the far more
 * complex noise/biome-source worldgen system — always valid, no risk of an unloadable world.
 * Pure datapack JSON export (data/<modId>/dimension_type/<id>.json +
 * data/<modId>/dimension/<id>.json), no Java.
 */
export interface DimensionSpec {
  id: string;
  modId?: string;
  /** which vanilla dimension_type to clone as the starting point — see lib/dimensionTemplates.ts */
  baseType: "overworld" | "nether" | "end";
  hasSkylight: boolean;
  hasCeiling: boolean;
  ambientLight: number;
  coordinateScale: number;
  /** false = normal day/night cycle; true = a fixed time of day (the actual time comes from the
   * base type's own clock/timeline, not independently settable — this MC version moved time-of-day
   * to a separate registry-driven "timeline" system with no simple per-dimension numeric field). */
  hasFixedTime: boolean;
  /** whether a player can set their spawn point here (sleeping in a bed, "always" or "never") */
  canSetSpawn: "always" | "never";
  /** whether players can sleep through the night here at all */
  canSleep: "always" | "never" | "when_dark";
  /** beds explode instead of working (vanilla's own Nether/End behavior) */
  bedsExplode: boolean;
  /** whether respawn anchors work here — vanilla makes them explode on use wherever this is false,
   * automatically, no separate toggle needed for that */
  respawnAnchorWorks: boolean;
  /** off pins monster_spawn_light_level/monster_spawn_block_light_limit to 0 (monsters only spawn
   * in total darkness) — real effect, not just cosmetic, though not an absolute "never" since a
   * sufficiently dark spot could still occur; the base template's own values are used unchanged
   * when on. Which specific hostile mobs can spawn at all is controlled by the chosen Biome's own
   * "monster" spawner list (copied from its base template, not independently editable here). */
  monstersCanSpawn: boolean;
  /** off pins the referenced Biome's creature_spawn_probability to 0 — vanilla's real passive/
   * neutral-mob (non-hostile "creature" category, e.g. cows/pigs/villagers) spawn-density knob,
   * distinct from monstersCanSpawn's light-level gate. Only takes effect when `biome` references
   * one of this project's own Biomes (a generated per-dimension variant of it is used instead of
   * the original, so other dimensions sharing that same Biome are unaffected) — has no effect when
   * `biome` is a vanilla or otherwise external id, since that biome's file isn't ours to rewrite. */
  mobsCanSpawn: boolean;
  /** item id (vanilla or a project item) is NOT applicable here — this is a biome id: vanilla
   * (e.g. "minecraft:plains") or a project BiomeSpec's id, fully qualified. */
  biome: string;
  layers: FlatLayerSpec[];
  generateDecorations: boolean;
  generateLakes: boolean;
  generateStructures: boolean;
  appVersion?: string;
}

/**
 * A full 4-piece Armor Set (helmet/chestplate/leggings/boots) sharing one custom material, matching
 * how vanilla itself defines armor (iron/diamond/netherite/...) as a single data-driven concept
 * referenced by all 4 pieces — rather than four ad-hoc items each with their own stats. Unlike most
 * other content types here, this genuinely needs a little Java (verified: `ArmorMaterial` has no
 * datapack codec in this MC version, and armor items are built via `Item.Properties.humanoidArmor`,
 * both Java-only) — see neoforge-runtime's ArmorSpecs.java. The equipment-asset texture layer
 * itself IS pure data (`assets/<modId>/equipment/<id>.json` + PNGs), no Java needed for that part.
 */
export interface ArmorSpec {
  /** base id — pieces are registered as "<id>_helmet", "<id>_chestplate", "<id>_leggings", "<id>_boots" */
  id: string;
  modId?: string;
  /** e.g. "Ruby" -> displayed per-piece as "Ruby Helmet", "Ruby Chestplate", etc. */
  displayName: string;
  /** 2D inventory-icon pack texture keys, one per piece */
  iconHelmet: string;
  iconChestplate: string;
  iconLeggings: string;
  iconBoots: string;
  /** 3D body-layer pack texture key (equipment asset) — applied to both the "humanoid" layer
   * (helmet/chestplate/boots) and "humanoid_leggings" layer (leggings) */
  equipmentTexture: string;
  /** vanilla's per-material "unit" durability, multiplied per slot internally by the game
   * (iron=15, diamond=33, netherite=37, gold=25, leather=5 — for reference) */
  durability: number;
  defenseHelmet: number;
  defenseChestplate: number;
  defenseLeggings: number;
  defenseBoots: number;
  toughness: number;
  knockbackResistance: number;
  enchantmentValue: number;
  /** item id (vanilla or a project item) usable to repair this armor on an anvil */
  repairItem: string;
  /** a CreativeTabKey, or a project-defined CreativeTabSpec's id */
  creativeTab: string;
  rarity: "common" | "uncommon" | "rare" | "epic";
  appVersion?: string;
}
