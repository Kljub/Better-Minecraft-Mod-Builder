package sheepfromheaven.screenspec.runtime.block;

import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.neoforged.neoforge.registries.DeferredBlock;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.LinkedHashMap;
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
    public static Map<String, DeferredBlock<Block>> registerAll(
            DeferredRegister.Blocks blockRegister, DeferredRegister.Items itemRegister, List<BlockSpec> specs) {
        Map<String, DeferredBlock<Block>> result = new LinkedHashMap<>();
        for (BlockSpec spec : specs) {
            DeferredBlock<Block> block = blockRegister.registerSimpleBlock(spec.id, () -> buildProperties(spec));
            result.put(spec.id, block);
            if (spec.hasItem) {
                itemRegister.registerSimpleBlockItem(spec.id, block);
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
