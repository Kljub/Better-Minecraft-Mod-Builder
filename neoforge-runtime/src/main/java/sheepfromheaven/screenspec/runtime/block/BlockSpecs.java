package sheepfromheaven.screenspec.runtime.block;

import net.minecraft.core.registries.Registries;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.entity.ChestBlockEntity;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.neoforged.neoforge.registries.DeferredBlock;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Set;
import java.util.function.Supplier;
import java.util.List;
import java.util.Map;

/**
 * Builds and registers vanilla {@link Block}s (plus their {@link net.minecraft.world.item.BlockItem})
 * from {@link BlockSpec}s. Internal — called only by {@link
 * sheepfromheaven.screenspec.runtime.ModContent}; a mod author using the MC Screen Designer web
 * tool never calls this directly.
 */
public final class BlockSpecs {
    private BlockSpecs() {}

    public static DeferredRegister.Blocks createRegister(String modId) {
        return DeferredRegister.createBlocks(modId);
    }

    /**
     * Registers one {@link Block} per spec (plus a plain {@link net.minecraft.world.item.BlockItem}
     * when {@link BlockSpec#hasItem} is set) and returns the blocks keyed by {@link BlockSpec#id}.
     */
    @SuppressWarnings("unchecked")
    public static Map<String, DeferredBlock<Block>> registerAll(
            String modId, IEventBus modBus,
            DeferredRegister.Blocks blockRegister, DeferredRegister.Items itemRegister, List<BlockSpec> specs) {
        Map<String, DeferredBlock<Block>> result = new LinkedHashMap<>();
        // Chest blocks share one block entity type per mod ("<modid>:chest").
        List<DeferredBlock<Block>> chests = new ArrayList<>();
        DeferredRegister<BlockEntityType<?>> blockEntities = DeferredRegister.create(Registries.BLOCK_ENTITY_TYPE, modId);
        List<Supplier<BlockEntityType<SpecChestBlockEntity>>> self = new ArrayList<>(1);
        DeferredHolder<BlockEntityType<?>, BlockEntityType<SpecChestBlockEntity>> chestType = blockEntities.register("chest",
            () -> new BlockEntityType<>((pos, state) -> new SpecChestBlockEntity(self.get(0).get(), pos, state),
                Set.copyOf(chests.stream().map(DeferredBlock::get).toList())));
        self.add(chestType);
        for (BlockSpec spec : specs) {
            DeferredBlock<Block> block;
            if ("chest".equals(spec.model)) {
                block = (DeferredBlock<Block>) (DeferredBlock<?>) blockRegister.registerBlock(spec.id,
                    p -> new SpecChestBlock(() -> (BlockEntityType<? extends ChestBlockEntity>) chestType.get(), spec.displayName, p),
                    () -> buildProperties(spec));
                chests.add(block);
            } else {
                block = blockRegister.registerSimpleBlock(spec.id, () -> buildProperties(spec));
            }
            result.put(spec.id, block);
            if (spec.hasItem) {
                itemRegister.registerSimpleBlockItem(spec.id, block);
            }
        }
        if (!chests.isEmpty()) {
            blockEntities.register(modBus);
            if (net.neoforged.fml.loading.FMLEnvironment.getDist() == net.neoforged.api.distmarker.Dist.CLIENT) {
                sheepfromheaven.screenspec.runtime.block.client.SpecChestsClient.register(modBus, chestType);
            }
        }
        return result;
    }

    private static BlockBehaviour.Properties buildProperties(BlockSpec spec) {
        BlockBehaviour.Properties props = BlockBehaviour.Properties.of()
            .strength((float) spec.hardness, (float) spec.resistance)
            .sound(resolveSoundType(spec.soundType));
        if (spec.requiresTool) props = props.requiresCorrectToolForDrops();
        if (spec.luminance > 0) {
            int luminance = spec.luminance;
            props = props.lightLevel(state -> luminance);
        }
        return props;
    }

    private static SoundType resolveSoundType(String key) {
        return switch (key == null ? "stone" : key) {
            case "wood" -> SoundType.WOOD;
            case "metal" -> SoundType.METAL;
            case "gravel" -> SoundType.GRAVEL;
            case "grass" -> SoundType.GRASS;
            case "glass" -> SoundType.GLASS;
            case "wool" -> SoundType.WOOL;
            case "sand" -> SoundType.SAND;
            default -> SoundType.STONE;
        };
    }
}
