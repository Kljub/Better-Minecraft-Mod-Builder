package sheepfromheaven.screenspec.runtime.mesh;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A block drawn by an OBJ mesh: not a full cube (no occlusion), outline/collision = the mesh's
 * bounds. The shape is per block instance, set by the factory right after construction (the codec
 * can only pass Properties), like SpecProjectile's per-type config.
 */
public class MeshBlock extends Block {
    public static final MapCodec<MeshBlock> CODEC = simpleCodec(MeshBlock::new);
    private static final Map<Block, VoxelShape> SHAPES = new ConcurrentHashMap<>();

    public MeshBlock(Properties properties) {
        super(properties);
    }

    static MeshBlock create(Properties properties, VoxelShape shape) {
        MeshBlock block = new MeshBlock(properties);
        SHAPES.put(block, shape);
        return block;
    }

    @Override
    protected MapCodec<? extends Block> codec() {
        return CODEC;
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
        return SHAPES.getOrDefault(this, Shapes.block());
    }
}
