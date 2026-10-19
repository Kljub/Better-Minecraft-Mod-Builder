package sheepfromheaven.screenspec.runtime.block;

import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.entity.ChestBlockEntity;
import net.minecraft.world.level.block.state.BlockState;

import java.util.function.Supplier;

/**
 * A {@code BlockSpec} with {@code model: "chest"}: a vanilla chest (27 slots, lid animation,
 * hoppers, comparators) with its own block entity type and skin. Always a single chest — two of
 * them side by side don't merge, since a skin only covers the single-chest layout.
 */
public class SpecChestBlock extends ChestBlock {
    private final String displayName;

    public SpecChestBlock(Supplier<BlockEntityType<? extends ChestBlockEntity>> type, String displayName, Properties properties) {
        super(type, SoundEvents.CHEST_OPEN, SoundEvents.CHEST_CLOSE, properties);
        this.displayName = displayName;
    }

    /** The spec's display name — also the title of the chest screen. */
    @Override
    public MutableComponent getName() {
        return displayName == null || displayName.isBlank() ? super.getName() : Component.literal(displayName);
    }

    @Override
    public boolean chestCanConnectTo(BlockState blockState) {
        return false;
    }

    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new SpecChestBlockEntity(blockEntityType(), pos, state);
    }
}
