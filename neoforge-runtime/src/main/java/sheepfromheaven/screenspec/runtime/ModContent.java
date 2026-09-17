package sheepfromheaven.screenspec.runtime;

import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.alchemy.Potion;
import net.minecraft.world.level.block.Block;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.event.BuildCreativeModeTabContentsEvent;
import net.neoforged.neoforge.registries.DeferredBlock;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;
import sheepfromheaven.screenspec.runtime.armor.ArmorSpec;
import sheepfromheaven.screenspec.runtime.armor.ArmorSpecs;
import sheepfromheaven.screenspec.runtime.attribute.CustomAttributeSpec;
import sheepfromheaven.screenspec.runtime.attribute.CustomAttributeSpecs;
import sheepfromheaven.screenspec.runtime.block.BlockSpec;
import sheepfromheaven.screenspec.runtime.block.BlockSpecs;
import sheepfromheaven.screenspec.runtime.effect.EffectSpec;
import sheepfromheaven.screenspec.runtime.effect.EffectSpecs;
import sheepfromheaven.screenspec.runtime.effect.PotionSpec;
import sheepfromheaven.screenspec.runtime.effect.PotionSpecs;
import sheepfromheaven.screenspec.runtime.item.ItemSpec;
import sheepfromheaven.screenspec.runtime.item.ItemSpecs;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Registers every Item/Block/custom-Attribute/Effect/Potion a mod's exported manifest describes,
 * and wires each item/block into its chosen creative-inventory tab — either an existing vanilla
 * tab, the shared "custom" tab (one per modId, used when an item/block's {@code creativeTab} is
 * absent or literally {@code "custom"}), or a project-defined named tab (any other string — one
 * {@code DeferredRegister<CreativeModeTab>} entry per distinct id, titled with that id). Called
 * automatically for every loaded mod that ships an {@code items.json}/{@code blocks.json}/{@code
 * attributes.json}/{@code effects.json}/{@code potions.json} manifest — see {@code ScreenSpecMod}
 * — a mod author using the MC Screen Designer web tool never calls this directly.
 */
public final class ModContent {
    private static final Map<String, ResourceKey<CreativeModeTab>> VANILLA_TABS = new HashMap<>();
    static {
        VANILLA_TABS.put("BUILDING_BLOCKS", CreativeModeTabs.BUILDING_BLOCKS);
        VANILLA_TABS.put("COLORED_BLOCKS", CreativeModeTabs.COLORED_BLOCKS);
        VANILLA_TABS.put("NATURAL_BLOCKS", CreativeModeTabs.NATURAL_BLOCKS);
        VANILLA_TABS.put("FUNCTIONAL_BLOCKS", CreativeModeTabs.FUNCTIONAL_BLOCKS);
        VANILLA_TABS.put("REDSTONE_BLOCKS", CreativeModeTabs.REDSTONE_BLOCKS);
        VANILLA_TABS.put("TOOLS_AND_UTILITIES", CreativeModeTabs.TOOLS_AND_UTILITIES);
        VANILLA_TABS.put("COMBAT", CreativeModeTabs.COMBAT);
        VANILLA_TABS.put("FOOD_AND_DRINKS", CreativeModeTabs.FOOD_AND_DRINKS);
        VANILLA_TABS.put("INGREDIENTS", CreativeModeTabs.INGREDIENTS);
        VANILLA_TABS.put("SPAWN_EGGS", CreativeModeTabs.SPAWN_EGGS);
    }

    private ModContent() {}

    /** Registers {@code items}, {@code blocks}, {@code customAttributes}, {@code effects},
     * {@code potions} and {@code armors} under {@code modId}, subscribed to {@code modBus}. */
    public static void register(
            String modId, IEventBus modBus,
            List<ItemSpec> items, List<BlockSpec> blocks, List<CustomAttributeSpec> customAttributes,
            List<EffectSpec> effects, List<PotionSpec> potions, List<ArmorSpec> armors) {
        if (items.isEmpty() && blocks.isEmpty() && customAttributes.isEmpty() && effects.isEmpty()
                && potions.isEmpty() && armors.isEmpty()) return;

        Map<String, Holder<Attribute>> registeredAttributes = Collections.emptyMap();
        if (!customAttributes.isEmpty()) {
            DeferredRegister<Attribute> attributeRegister = CustomAttributeSpecs.createRegister(modId);
            registeredAttributes = CustomAttributeSpecs.registerAll(attributeRegister, customAttributes, modId);
            attributeRegister.register(modBus);
            CustomAttributeSpecs.registerDefaults(modBus, customAttributes, registeredAttributes);
        }

        Map<String, Holder<MobEffect>> registeredEffects = Collections.emptyMap();
        if (!effects.isEmpty()) {
            DeferredRegister<MobEffect> effectRegister = EffectSpecs.createRegister(modId);
            registeredEffects = EffectSpecs.registerAll(effectRegister, effects, modId, registeredAttributes);
            effectRegister.register(modBus);
        }

        if (!potions.isEmpty()) {
            DeferredRegister<Potion> potionRegister = PotionSpecs.createRegister(modId);
            PotionSpecs.registerAll(potionRegister, potions, registeredEffects);
            potionRegister.register(modBus);
        }

        DeferredRegister.Items itemRegister = ItemSpecs.createRegister(modId);
        DeferredRegister.Blocks blockRegister = BlockSpecs.createRegister(modId);
        DeferredRegister.Items armorRegister = ArmorSpecs.createRegister(modId);

        Map<String, DeferredItem<Item>> registeredItems = ItemSpecs.registerAll(itemRegister, items, modId, registeredAttributes);
        Map<String, DeferredBlock<Block>> registeredBlocks = BlockSpecs.registerAll(blockRegister, itemRegister, blocks);
        Map<String, DeferredItem<Item>> registeredArmorPieces = ArmorSpecs.registerAll(armorRegister, armors, modId);

        itemRegister.register(modBus);
        blockRegister.register(modBus);
        armorRegister.register(modBus);

        registerCreativeTabContent(modId, modBus, items, blocks, armors, registeredItems, registeredBlocks, registeredArmorPieces);
    }

    private static final String[] ARMOR_PIECES = { "helmet", "chestplate", "leggings", "boots" };

    private static void registerCreativeTabContent(
            String modId, IEventBus modBus,
            List<ItemSpec> items, List<BlockSpec> blocks, List<ArmorSpec> armors,
            Map<String, DeferredItem<Item>> registeredItems, Map<String, DeferredBlock<Block>> registeredBlocks,
            Map<String, DeferredItem<Item>> registeredArmorPieces) {

        // Keyed by the item/block/armor's raw `creativeTab` string — "custom" is just another id
        // here (its own single-entry tab, titled after modId below), same treatment as any other
        // project-defined tab id like "weapons".
        Map<String, List<Supplier<ItemStack>>> namedTabEntries = new HashMap<>();
        Map<ResourceKey<CreativeModeTab>, List<Supplier<ItemStack>>> vanillaTabEntries = new HashMap<>();

        for (ItemSpec spec : items) {
            DeferredItem<Item> item = registeredItems.get(spec.id);
            if (item == null) continue;
            addToTab(spec.creativeTab, item::toStack, namedTabEntries, vanillaTabEntries);
        }
        for (BlockSpec spec : blocks) {
            if (!spec.hasItem) continue;
            DeferredBlock<Block> block = registeredBlocks.get(spec.id);
            if (block == null) continue;
            addToTab(spec.creativeTab, () -> new ItemStack(block.get()), namedTabEntries, vanillaTabEntries);
        }
        for (ArmorSpec spec : armors) {
            for (String piece : ARMOR_PIECES) {
                DeferredItem<Item> item = registeredArmorPieces.get(ArmorSpecs.pieceId(spec, piece));
                if (item == null) continue;
                addToTab(spec.creativeTab, item::toStack, namedTabEntries, vanillaTabEntries);
            }
        }

        if (!vanillaTabEntries.isEmpty()) {
            modBus.addListener(BuildCreativeModeTabContentsEvent.class, event -> {
                List<Supplier<ItemStack>> entries = vanillaTabEntries.get(event.getTabKey());
                if (entries == null) return;
                for (Supplier<ItemStack> stack : entries) event.accept(stack.get());
            });
        }

        if (!namedTabEntries.isEmpty()) {
            DeferredRegister<CreativeModeTab> tabRegister = DeferredRegister.create(Registries.CREATIVE_MODE_TAB, modId);
            for (Map.Entry<String, List<Supplier<ItemStack>>> tab : namedTabEntries.entrySet()) {
                String tabId = tab.getKey();
                List<Supplier<ItemStack>> entries = tab.getValue();
                Supplier<ItemStack> icon = entries.get(0);
                String title = "custom".equals(tabId) ? modId : tabId;
                tabRegister.register(tabId, () -> CreativeModeTab.builder()
                    .title(Component.literal(title))
                    .icon(icon)
                    .displayItems((params, output) -> {
                        for (Supplier<ItemStack> stack : entries) output.accept(stack.get());
                    })
                    .build());
            }
            tabRegister.register(modBus);
        }
    }

    private static void addToTab(
            String creativeTab, Supplier<ItemStack> stack,
            Map<String, List<Supplier<ItemStack>>> namedTabEntries,
            Map<ResourceKey<CreativeModeTab>, List<Supplier<ItemStack>>> vanillaTabEntries) {
        String tabId = (creativeTab == null || creativeTab.isBlank()) ? "custom" : creativeTab;
        ResourceKey<CreativeModeTab> tabKey = VANILLA_TABS.get(tabId);
        if (tabKey != null) {
            vanillaTabEntries.computeIfAbsent(tabKey, k -> new ArrayList<>()).add(stack);
            return;
        }
        namedTabEntries.computeIfAbsent(tabId, k -> new ArrayList<>()).add(stack);
    }
}
