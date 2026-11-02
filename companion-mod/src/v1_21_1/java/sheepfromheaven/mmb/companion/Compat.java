package sheepfromheaven.mmb.companion;

import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.GlobalPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.core.Vec3i;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;

import java.util.function.IntSupplier;
import java.util.function.Predicate;

/** Minecraft 1.21.1 side of the APIs that differ between versions (src/v26_2 has the other one). */
final class Compat {
    private Compat() {}

    /** Permission level 0 (everyone) … 4 (owners), read on every use so config changes apply at once. */
    static Predicate<CommandSourceStack> permission(IntSupplier level) {
        return src -> src.hasPermission(Math.max(0, Math.min(4, level.getAsInt())));
    }

    static final ResourceKey<Level> BUILD_WORLD = ResourceKey.create(Registries.DIMENSION, ResourceLocation.fromNamespaceAndPath(CompanionMod.MOD_ID, "build"));

    static void teleport(ServerPlayer player, ServerLevel level, double x, double y, double z, float yRot, float xRot) {
        player.teleportTo(level, x, y, z, yRot, xRot);
    }

    /** The world spawn (dimension + position). */
    static GlobalPos worldSpawn(MinecraftServer server) {
        return GlobalPos.of(Level.OVERWORLD, server.overworld().getSharedSpawnPos());
    }

    /** setBlock flags for clearing an area: no drops, no neighbour updates (containers are emptied first) */
    static final int CLEAR_FLAGS = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE | Block.UPDATE_SUPPRESS_DROPS;

    static void fillFromWorld(StructureTemplate template, Level level, BlockPos origin, Vec3i size) {
        template.fillFromWorld(level, origin, size, false, Blocks.STRUCTURE_VOID);
    }
}
