package sheepfromheaven.screenspec.runtime.block;

import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.entity.ChestBlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/** The block entity of a {@link SpecChestBlock}: a vanilla chest titled after its block. */
public class SpecChestBlockEntity extends ChestBlockEntity {
    public SpecChestBlockEntity(BlockEntityType<?> type, BlockPos pos, BlockState state) {
        super(type, pos, state);
    }

    @Override
    protected Component getDefaultName() {
        return getBlockState().getBlock().getName();
    }
}
