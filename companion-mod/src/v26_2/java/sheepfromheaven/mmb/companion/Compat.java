package sheepfromheaven.mmb.companion;

import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.core.BlockPos;
import net.minecraft.core.GlobalPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.core.Vec3i;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;

import java.util.List;
import java.util.Set;
import java.util.function.IntSupplier;
import java.util.function.Predicate;

/** Minecraft 26.2 side of the APIs that differ between versions (src/v1_21_1 has the other one). */
final class Compat {
    private Compat() {}

    /** Permission level 0 (everyone) … 4 (owners), read on every use so config changes apply at once. */
    static Predicate<CommandSourceStack> permission(IntSupplier level) {
        List<Predicate<CommandSourceStack>> checks = List.of(
                Commands.hasPermission(Commands.LEVEL_ALL), Commands.hasPermission(Commands.LEVEL_MODERATORS),
                Commands.hasPermission(Commands.LEVEL_GAMEMASTERS), Commands.hasPermission(Commands.LEVEL_ADMINS),
                Commands.hasPermission(Commands.LEVEL_OWNERS));
        return src -> checks.get(Math.max(0, Math.min(4, level.getAsInt()))).test(src);
    }

    static final ResourceKey<Level> BUILD_WORLD = ResourceKey.create(Registries.DIMENSION, Identifier.fromNamespaceAndPath(CompanionMod.MOD_ID, "build"));

    static void teleport(ServerPlayer player, ServerLevel level, double x, double y, double z, float yRot, float xRot) {
        player.teleportTo(level, x, y, z, Set.of(), yRot, xRot, true);
    }

    /** The world spawn (dimension + position). */
    static GlobalPos worldSpawn(MinecraftServer server) {
        return server.getRespawnData().globalPos();
    }

    /** setBlock flags for clearing an area: no drops, no block-entity side effects, no neighbour updates */
    static final int CLEAR_FLAGS = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE | Block.UPDATE_SUPPRESS_DROPS | Block.UPDATE_SKIP_BLOCK_ENTITY_SIDEEFFECTS;

    static void fillFromWorld(StructureTemplate template, Level level, BlockPos origin, Vec3i size) {
        template.fillFromWorld(level, origin, size, false, List.of(Blocks.STRUCTURE_VOID));
    }
}
