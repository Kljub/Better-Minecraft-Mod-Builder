package sheepfromheaven.screenspec.runtime.block;

import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.world.level.material.PushReaction;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
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
            if ("custom".equals(spec.model) && spec.parts != null && !spec.parts.isEmpty()) {
                block = registerModelBlock(blockRegister, spec);
            } else if ("chest".equals(spec.model)) {
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

    /**
     * A {@link SpecModelBlock} group: the main block {@code <id>} plus, for a multiblock, one part
     * block per further cell. The pieces share one list of (offset, block) — filled before any
     * factory runs, since DeferredRegister builds the blocks later.
     */
    @SuppressWarnings("unchecked")
    private static DeferredBlock<Block> registerModelBlock(DeferredRegister.Blocks blockRegister, BlockSpec spec) {
        List<SpecModelBlock.Piece> group = new ArrayList<>();
        DeferredBlock<Block> main = null;
        for (BlockSpec.Part part : spec.parts) {
            BlockPos offset = part.offset != null && part.offset.length == 3 ? new BlockPos(part.offset[0], part.offset[1], part.offset[2]) : BlockPos.ZERO;
            VoxelShape shape = Shapes.empty();
            if (part.boxes != null) for (double[] b : part.boxes) {
                if (b == null || b.length != 6) continue;
                shape = Shapes.or(shape, Block.box(clamp(b[0]), clamp(b[1]), clamp(b[2]), clamp(b[3]), clamp(b[4]), clamp(b[5])));
            }
            VoxelShape finalShape = shape;
            DeferredBlock<Block> block = (DeferredBlock<Block>) (DeferredBlock<?>) blockRegister.registerBlock(partId(spec.id, offset),
                p -> SpecModelBlock.create(p, offset, group, finalShape),
                () -> buildProperties(spec).noOcclusion().pushReaction(PushReaction.BLOCK));
            group.add(new SpecModelBlock.Piece(offset, block));
            if (offset.equals(BlockPos.ZERO)) main = block;
        }
        if (main == null) throw new IllegalStateException("custom block " + spec.id + " has no part at offset 0,0,0");
        return main;
    }

    /** Same naming as the webapp's partBlockId: {@code <id>_p_1_0_m2}; offset 0,0,0 is the block itself. */
    static String partId(String id, BlockPos o) {
        if (o.equals(BlockPos.ZERO)) return id;
        return id + "_p_" + n(o.getX()) + "_" + n(o.getY()) + "_" + n(o.getZ());
    }

    private static String n(int v) {
        return v < 0 ? "m" + (-v) : String.valueOf(v);
    }

    private static double clamp(double v) {
        return Math.max(0, Math.min(16, v));
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
