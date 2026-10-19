package sheepfromheaven.mmb.companion;

import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Vec3i;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;

import java.util.function.Predicate;

/** Minecraft 1.21.1 side of the APIs that differ between versions (src/v26_2 has the other one). */
final class Compat {
    private Compat() {}

    /** op level 2 (game masters) */
    static final Predicate<CommandSourceStack> GAMEMASTERS = src -> src.hasPermission(2);

    /** setBlock flags for clearing an area: no drops, no neighbour updates (containers are emptied first) */
    static final int CLEAR_FLAGS = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE | Block.UPDATE_SUPPRESS_DROPS;

    static void fillFromWorld(StructureTemplate template, Level level, BlockPos origin, Vec3i size) {
        template.fillFromWorld(level, origin, size, false, Blocks.STRUCTURE_VOID);
    }
}
