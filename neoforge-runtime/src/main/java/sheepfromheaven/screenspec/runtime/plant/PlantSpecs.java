package sheepfromheaven.screenspec.runtime.plant;

import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.DoubleHighBlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FlowerBlock;
import net.minecraft.world.level.block.FlowerPotBlock;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.TallFlowerBlock;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.event.lifecycle.FMLCommonSetupEvent;
import net.neoforged.neoforge.event.BuildCreativeModeTabContentsEvent;
import net.neoforged.neoforge.registries.DeferredBlock;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

/**
 * Registers each {@link PlantSpec} as a vanilla-style flower ({@link FlowerBlock}, properties
 * copied from vanilla's dandelion) or two-block-tall flower ({@link TallFlowerBlock} +
 * {@link DoubleHighBlockItem}, like the sunflower), plus an optional potted variant hooked into
 * the empty flower pot the NeoForge way ({@code FlowerPotBlock#addPlant} during common setup).
 * Models, item models, the optional world-generation feature and lang come from the export
 * bundle. Internal — called by {@link sheepfromheaven.screenspec.runtime.ModElements}.
 */
public final class PlantSpecs {
    private PlantSpecs() {}

    private record Potted(Identifier plant, Supplier<? extends Block> pot) {}

    public static void register(String modId, IEventBus modBus, List<PlantSpec> specs) {
        if (specs.isEmpty()) return;
        DeferredRegister.Blocks blocks = DeferredRegister.createBlocks(modId);
        DeferredRegister.Items items = DeferredRegister.createItems(modId);
        List<Potted> potted = new ArrayList<>();
        List<DeferredItem<? extends Item>> tabItems = new ArrayList<>();

        for (PlantSpec spec : specs) {
            Supplier<BlockBehaviour.Properties> props = () -> {
                BlockBehaviour.Properties p = BlockBehaviour.Properties.of()
                    .mapColor(MapColor.PLANT)
                    .noCollision()
                    .instabreak()
                    .sound(SoundType.GRASS)
                    .offsetType(BlockBehaviour.OffsetType.XZ)
                    .pushReaction(PushReaction.DESTROY);
                int light = Math.max(0, Math.min(15, spec.lightLevel));
                return light > 0 ? p.lightLevel(state -> light) : p;
            };
            if ("tall_flower".equals(spec.type)) {
                DeferredBlock<TallFlowerBlock> block = blocks.registerBlock(spec.id, TallFlowerBlock::new, () -> props.get().ignitedByLava());
                tabItems.add(items.registerItem(spec.id, p -> new DoubleHighBlockItem(block.get(), p), () -> new Item.Properties().useBlockDescriptionPrefix()));
                continue;
            }
            Holder<MobEffect> effect = spec.stewEffect == null || spec.stewEffect.isBlank()
                ? MobEffects.SATURATION
                // lazy holder — resolves at use time, so another mod's (or this mod's own) effect works too
                : DeferredHolder.create(Registries.MOB_EFFECT, Identifier.parse(spec.stewEffect));
            DeferredBlock<FlowerBlock> block = blocks.registerBlock(spec.id, p -> new FlowerBlock(effect, Math.max(0.05F, spec.stewSeconds), p), props);
            tabItems.add(items.registerSimpleBlockItem(spec.id, block));
            if (spec.potted) {
                DeferredBlock<FlowerPotBlock> pot = blocks.registerBlock("potted_" + spec.id,
                    p -> new FlowerPotBlock(() -> (FlowerPotBlock) Blocks.FLOWER_POT, block, p),
                    () -> BlockBehaviour.Properties.of().instabreak().noOcclusion().pushReaction(PushReaction.DESTROY));
                potted.add(new Potted(Identifier.fromNamespaceAndPath(modId, spec.id), pot));
            }
        }

        blocks.register(modBus);
        items.register(modBus);

        if (!potted.isEmpty()) {
            modBus.addListener(FMLCommonSetupEvent.class, event -> event.enqueueWork(() -> {
                for (Potted p : potted) ((FlowerPotBlock) Blocks.FLOWER_POT).addPlant(p.plant(), p.pot());
            }));
        }
        modBus.addListener(BuildCreativeModeTabContentsEvent.class, event -> {
            if (event.getTabKey() != CreativeModeTabs.NATURAL_BLOCKS) return;
            for (DeferredItem<? extends Item> item : tabItems) event.accept(item.get());
        });
    }
}
