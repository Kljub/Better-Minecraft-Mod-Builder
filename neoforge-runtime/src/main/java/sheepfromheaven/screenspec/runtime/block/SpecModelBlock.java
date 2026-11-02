package sheepfromheaven.screenspec.runtime.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.Mirror;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jspecify.annotations.Nullable;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * A block drawn by an entity model from the webapp ({@link BlockSpec#model} {@code "custom"}): not a
 * full cube, outline/collision = the model's boxes, turned to face the player who places it.
 *
 * <p>A model bigger than one block is a multiblock: every occupied 16³ cell is its own block (the
 * placed one at offset 0,0,0 plus parts {@code <id>_p_<x>_<y>_<z>} without an item). Placing the
 * main block places all parts (or nothing, when one spot is taken); breaking any piece removes the
 * whole group, and a piece whose group is no longer complete falls apart (explosions). Offsets are
 * stored as for facing north and turned with the facing, like the blockstate's y rotation.
 *
 * <p>Per-block config lives in a static map like {@code MeshBlock}'s (the codec only passes
 * Properties).
 */
public class SpecModelBlock extends Block {
    public static final MapCodec<SpecModelBlock> CODEC = simpleCodec(SpecModelBlock::new);
    public static final EnumProperty<Direction> FACING = BlockStateProperties.HORIZONTAL_FACING;

    /** One piece of a group: its own offset, all offsets of the group and their blocks, its shapes. */
    record Config(BlockPos offset, List<Piece> group, Map<Direction, VoxelShape> outline, Map<Direction, VoxelShape> collision) {}
    record Piece(BlockPos offset, Supplier<? extends Block> block) {}

    private static final Map<Block, Config> CONFIG = new ConcurrentHashMap<>();

    public SpecModelBlock(Properties properties) {
        super(properties);
        registerDefaultState(stateDefinition.any().setValue(FACING, Direction.NORTH));
    }

    static SpecModelBlock create(Properties properties, BlockPos offset, List<Piece> group, VoxelShape shape) {
        SpecModelBlock block = new SpecModelBlock(properties);
        // an empty piece (only flat planes) still needs something to aim at and break
        VoxelShape outline = shape.isEmpty() ? Shapes.block() : shape;
        CONFIG.put(block, new Config(offset, group, Shapes.rotateHorizontal(outline), Shapes.rotateHorizontal(shape)));
        return block;
    }

    @Override
    protected MapCodec<? extends Block> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        builder.add(FACING);
    }

    /** An offset (as for facing north) turned to `facing` — same as the blockstate's y rotation. */
    static BlockPos turn(BlockPos o, Direction facing) {
        return switch (facing) {
            case EAST -> new BlockPos(-o.getZ(), o.getY(), o.getX());
            case SOUTH -> new BlockPos(-o.getX(), o.getY(), -o.getZ());
            case WEST -> new BlockPos(o.getZ(), o.getY(), -o.getX());
            default -> o;
        };
    }

    private @Nullable Config config() {
        return CONFIG.get(this);
    }

    /** Where the group's main block is, seen from this piece at `pos`. */
    private BlockPos origin(BlockPos pos, BlockState state) {
        Config c = config();
        return c == null ? pos : pos.subtract(turn(c.offset(), state.getValue(FACING)));
    }

    @Override
    public @Nullable BlockState getStateForPlacement(BlockPlaceContext context) {
        Direction facing = context.getHorizontalDirection().getOpposite();
        Config c = config();
        if (c != null) {
            Level level = context.getLevel();
            BlockPos pos = context.getClickedPos();
            for (Piece piece : c.group()) {
                if (piece.offset().equals(BlockPos.ZERO)) continue;
                BlockPos at = pos.offset(turn(piece.offset(), facing));
                if (level.isOutsideBuildHeight(at) || !level.getWorldBorder().isWithinBounds(at)
                        || !level.getBlockState(at).canBeReplaced(context)) return null;
            }
        }
        return defaultBlockState().setValue(FACING, facing);
    }

    @Override
    public void setPlacedBy(Level level, BlockPos pos, BlockState state, @Nullable LivingEntity by, ItemStack itemStack) {
        super.setPlacedBy(level, pos, state, by, itemStack);
        Config c = config();
        if (c == null || level.isClientSide()) return;
        Direction facing = state.getValue(FACING);
        for (Piece piece : c.group()) {
            if (piece.offset().equals(BlockPos.ZERO)) continue;
            level.setBlock(pos.offset(turn(piece.offset(), facing)), piece.block().get().defaultBlockState().setValue(FACING, facing), UPDATE_ALL);
        }
    }

    @Override
    public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
        Config c = config();
        if (c != null && c.group().size() > 1 && !level.isClientSide()) {
            Direction facing = state.getValue(FACING);
            BlockPos origin = origin(pos, state);
            for (Piece piece : c.group()) {
                BlockPos at = origin.offset(turn(piece.offset(), facing));
                if (at.equals(pos)) continue;
                BlockState other = level.getBlockState(at);
                if (!other.is(piece.block().get())) continue;
                level.setBlock(at, Blocks.AIR.defaultBlockState(), UPDATE_ALL | UPDATE_SUPPRESS_DROPS);
                level.levelEvent(player, 2001, at, Block.getId(other));
            }
        }
        return super.playerWillDestroy(level, pos, state, player);
    }

    @Override
    protected BlockState updateShape(BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos,
            Direction directionToNeighbour, BlockPos neighbourPos, BlockState neighbourState, RandomSource random) {
        Config c = config();
        if (c != null && c.group().size() > 1) {
            // a neighbouring piece of this group went missing → the group falls apart
            Direction facing = state.getValue(FACING);
            BlockPos origin = origin(pos, state);
            for (Piece piece : c.group()) {
                if (!origin.offset(turn(piece.offset(), facing)).equals(neighbourPos)) continue;
                boolean intact = neighbourState.is(piece.block().get()) && neighbourState.getValue(FACING) == facing;
                if (!intact) return Blocks.AIR.defaultBlockState();
            }
        }
        return super.updateShape(state, level, ticks, pos, directionToNeighbour, neighbourPos, neighbourState, random);
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
        Config c = config();
        return c == null ? Shapes.block() : c.outline().get(state.getValue(FACING));
    }

    @Override
    protected VoxelShape getCollisionShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
        Config c = config();
        return c == null ? Shapes.block() : c.collision().get(state.getValue(FACING));
    }

    @Override
    protected BlockState rotate(BlockState state, Rotation rotation) {
        return state.setValue(FACING, rotation.rotate(state.getValue(FACING)));
    }

    @Override
    protected BlockState mirror(BlockState state, Mirror mirror) {
        return state.rotate(mirror.getRotation(state.getValue(FACING)));
    }
}
