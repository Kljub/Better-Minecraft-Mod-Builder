package sheepfromheaven.mmb.companion;

import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Vec3i;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;

import java.util.List;
import java.util.function.Predicate;

/** Minecraft 26.2 side of the APIs that differ between versions (src/v1_21_1 has the other one). */
final class Compat {
    private Compat() {}

    /** op level 2 (game masters) */
    static final Predicate<CommandSourceStack> GAMEMASTERS = Commands.hasPermission(Commands.LEVEL_GAMEMASTERS);

    /** setBlock flags for clearing an area: no drops, no block-entity side effects, no neighbour updates */
    static final int CLEAR_FLAGS = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE | Block.UPDATE_SUPPRESS_DROPS | Block.UPDATE_SKIP_BLOCK_ENTITY_SIDEEFFECTS;

    static void fillFromWorld(StructureTemplate template, Level level, BlockPos origin, Vec3i size) {
        template.fillFromWorld(level, origin, size, false, List.of(Blocks.STRUCTURE_VOID));
    }
}
