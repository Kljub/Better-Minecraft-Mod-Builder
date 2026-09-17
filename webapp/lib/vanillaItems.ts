// Curated (non-exhaustive) list of common vanilla item ids, offered as picker suggestions
// wherever a spec references "an item" (advancement icon, recipe ingredient/result, trade
// wants/gives, loot entry). Free text is always still allowed — this app has no vanilla item
// catalog to validate against — a project's own ItemSpec ids are merged in alongside these by
// each panel that uses them.
export const VANILLA_ITEM_OPTIONS: string[] = [
  // Ores, ingots, gems
  "minecraft:coal", "minecraft:raw_iron", "minecraft:iron_ingot", "minecraft:raw_copper", "minecraft:copper_ingot",
  "minecraft:raw_gold", "minecraft:gold_ingot", "minecraft:gold_nugget", "minecraft:iron_nugget",
  "minecraft:diamond", "minecraft:emerald", "minecraft:lapis_lazuli", "minecraft:redstone", "minecraft:quartz",
  "minecraft:netherite_ingot", "minecraft:netherite_scrap", "minecraft:amethyst_shard",
  // Tools & weapons (wood/stone/iron/gold/diamond/netherite family, wood shown as example set)
  "minecraft:wooden_sword", "minecraft:stone_sword", "minecraft:iron_sword", "minecraft:golden_sword",
  "minecraft:diamond_sword", "minecraft:netherite_sword",
  "minecraft:wooden_pickaxe", "minecraft:stone_pickaxe", "minecraft:iron_pickaxe", "minecraft:golden_pickaxe",
  "minecraft:diamond_pickaxe", "minecraft:netherite_pickaxe",
  "minecraft:wooden_axe", "minecraft:stone_axe", "minecraft:iron_axe", "minecraft:golden_axe",
  "minecraft:diamond_axe", "minecraft:netherite_axe",
  "minecraft:wooden_shovel", "minecraft:stone_shovel", "minecraft:iron_shovel", "minecraft:golden_shovel",
  "minecraft:diamond_shovel", "minecraft:netherite_shovel",
  "minecraft:wooden_hoe", "minecraft:stone_hoe", "minecraft:iron_hoe", "minecraft:golden_hoe",
  "minecraft:diamond_hoe", "minecraft:netherite_hoe",
  "minecraft:bow", "minecraft:crossbow", "minecraft:arrow", "minecraft:spectral_arrow", "minecraft:trident",
  "minecraft:shield", "minecraft:mace",
  // Armor
  "minecraft:leather_helmet", "minecraft:leather_chestplate", "minecraft:leather_leggings", "minecraft:leather_boots",
  "minecraft:iron_helmet", "minecraft:iron_chestplate", "minecraft:iron_leggings", "minecraft:iron_boots",
  "minecraft:golden_helmet", "minecraft:golden_chestplate", "minecraft:golden_leggings", "minecraft:golden_boots",
  "minecraft:diamond_helmet", "minecraft:diamond_chestplate", "minecraft:diamond_leggings", "minecraft:diamond_boots",
  "minecraft:netherite_helmet", "minecraft:netherite_chestplate", "minecraft:netherite_leggings", "minecraft:netherite_boots",
  "minecraft:chainmail_helmet", "minecraft:chainmail_chestplate", "minecraft:chainmail_leggings", "minecraft:chainmail_boots",
  "minecraft:turtle_helmet", "minecraft:elytra",
  // Food
  "minecraft:apple", "minecraft:golden_apple", "minecraft:enchanted_golden_apple", "minecraft:bread",
  "minecraft:cooked_beef", "minecraft:beef", "minecraft:porkchop", "minecraft:cooked_porkchop",
  "minecraft:chicken", "minecraft:cooked_chicken", "minecraft:mutton", "minecraft:cooked_mutton",
  "minecraft:rabbit", "minecraft:cooked_rabbit", "minecraft:cod", "minecraft:cooked_cod",
  "minecraft:salmon", "minecraft:cooked_salmon", "minecraft:potato", "minecraft:baked_potato",
  "minecraft:carrot", "minecraft:golden_carrot", "minecraft:beetroot", "minecraft:beetroot_soup",
  "minecraft:melon_slice", "minecraft:pumpkin_pie", "minecraft:cookie", "minecraft:cake",
  "minecraft:mushroom_stew", "minecraft:rabbit_stew", "minecraft:suspicious_stew", "minecraft:honey_bottle",
  "minecraft:sweet_berries", "minecraft:glow_berries", "minecraft:dried_kelp",
  // Blocks (common building/decoration)
  "minecraft:dirt", "minecraft:grass_block", "minecraft:stone", "minecraft:cobblestone", "minecraft:stone_bricks",
  "minecraft:oak_planks", "minecraft:oak_log", "minecraft:oak_sapling", "minecraft:glass", "minecraft:sand",
  "minecraft:gravel", "minecraft:obsidian", "minecraft:bookshelf", "minecraft:torch", "minecraft:sea_lantern",
  "minecraft:glowstone", "minecraft:netherrack", "minecraft:soul_sand", "minecraft:end_stone",
  "minecraft:wool", "minecraft:white_wool", "minecraft:hay_block", "minecraft:tnt", "minecraft:chest",
  "minecraft:crafting_table", "minecraft:furnace", "minecraft:anvil", "minecraft:enchanting_table",
  "minecraft:beacon", "minecraft:bricks", "minecraft:nether_bricks",
  // Redstone
  "minecraft:redstone_torch", "minecraft:repeater", "minecraft:comparator", "minecraft:piston",
  "minecraft:sticky_piston", "minecraft:lever", "minecraft:tripwire_hook", "minecraft:observer",
  "minecraft:hopper", "minecraft:dropper", "minecraft:dispenser", "minecraft:redstone_lamp",
  // Misc / trading / brewing
  "minecraft:emerald_block", "minecraft:diamond_block", "minecraft:gold_block", "minecraft:iron_block",
  "minecraft:netherite_block", "minecraft:experience_bottle", "minecraft:ender_pearl", "minecraft:ender_eye",
  "minecraft:blaze_powder", "minecraft:blaze_rod", "minecraft:ghast_tear", "minecraft:magma_cream",
  "minecraft:slime_ball", "minecraft:nether_wart", "minecraft:glass_bottle", "minecraft:potion",
  "minecraft:splash_potion", "minecraft:lingering_potion", "minecraft:book", "minecraft:written_book",
  "minecraft:enchanted_book", "minecraft:paper", "minecraft:map", "minecraft:compass", "minecraft:clock",
  "minecraft:name_tag", "minecraft:saddle", "minecraft:lead", "minecraft:fishing_rod", "minecraft:flint_and_steel",
  "minecraft:bucket", "minecraft:water_bucket", "minecraft:lava_bucket", "minecraft:milk_bucket",
  "minecraft:string", "minecraft:feather", "minecraft:leather", "minecraft:flint", "minecraft:gunpowder",
  "minecraft:bone", "minecraft:bone_meal", "minecraft:egg", "minecraft:spider_eye", "minecraft:rotten_flesh",
  "minecraft:phantom_membrane", "minecraft:shulker_shell", "minecraft:totem_of_undying", "minecraft:nautilus_shell",
  "minecraft:heart_of_the_sea", "minecraft:prismarine_shard", "minecraft:prismarine_crystals",
  "minecraft:dragon_breath", "minecraft:nether_star", "minecraft:wither_skeleton_skull", "minecraft:firework_rocket",
  // Dyes
  "minecraft:white_dye", "minecraft:black_dye", "minecraft:red_dye", "minecraft:blue_dye", "minecraft:green_dye",
  "minecraft:yellow_dye", "minecraft:orange_dye", "minecraft:purple_dye", "minecraft:cyan_dye", "minecraft:pink_dye",
];

// Curated (non-exhaustive) list of vanilla ids that are actually BLOCKS — no tools/weapons/food/
// dyes/etc mixed in, unlike VANILLA_ITEM_OPTIONS above. Used wherever a spec references "a block"
// specifically (currently DimensionSpec's flat-generator floor layers).
export const VANILLA_BLOCK_OPTIONS: string[] = [
  "minecraft:air", "minecraft:bedrock", "minecraft:stone", "minecraft:granite", "minecraft:diorite",
  "minecraft:andesite", "minecraft:deepslate", "minecraft:cobblestone", "minecraft:cobbled_deepslate",
  "minecraft:dirt", "minecraft:coarse_dirt", "minecraft:podzol", "minecraft:mud", "minecraft:grass_block",
  "minecraft:mycelium", "minecraft:sand", "minecraft:red_sand", "minecraft:gravel", "minecraft:clay",
  "minecraft:sandstone", "minecraft:red_sandstone", "minecraft:terracotta", "minecraft:white_terracotta",
  "minecraft:stone_bricks", "minecraft:mossy_stone_bricks", "minecraft:bricks", "minecraft:mossy_cobblestone",
  "minecraft:oak_planks", "minecraft:spruce_planks", "minecraft:birch_planks", "minecraft:jungle_planks",
  "minecraft:acacia_planks", "minecraft:dark_oak_planks", "minecraft:oak_log", "minecraft:oak_leaves",
  "minecraft:glass", "minecraft:white_wool", "minecraft:hay_block", "minecraft:snow_block", "minecraft:ice",
  "minecraft:packed_ice", "minecraft:blue_ice", "minecraft:obsidian", "minecraft:crying_obsidian",
  "minecraft:netherrack", "minecraft:soul_sand", "minecraft:soul_soil", "minecraft:basalt", "minecraft:blackstone",
  "minecraft:glowstone", "minecraft:magma_block", "minecraft:nether_bricks", "minecraft:nether_wart_block",
  "minecraft:end_stone", "minecraft:end_stone_bricks", "minecraft:purpur_block", "minecraft:sea_lantern",
  "minecraft:prismarine", "minecraft:water", "minecraft:lava", "minecraft:coal_ore", "minecraft:iron_ore",
  "minecraft:gold_ore", "minecraft:diamond_ore", "minecraft:emerald_ore", "minecraft:redstone_ore",
  "minecraft:lapis_ore", "minecraft:copper_ore", "minecraft:coal_block", "minecraft:iron_block",
  "minecraft:gold_block", "minecraft:diamond_block", "minecraft:emerald_block", "minecraft:redstone_block",
  "minecraft:lapis_block", "minecraft:copper_block", "minecraft:bookshelf", "minecraft:chest",
  "minecraft:crafting_table", "minecraft:furnace",
];
