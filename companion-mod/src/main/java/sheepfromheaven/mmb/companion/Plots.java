package sheepfromheaven.mmb.companion;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.storage.LevelResource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * The build world is split into plots, one per generated structure, {@link #SPACING} blocks apart
 * along +X — each starts as empty void with a bedrock block to stand on, and stays there so the
 * structure can be edited (and re-uploaded) later. Plot 0 is the lobby (/mmb world). Stored as JSON
 * in the save folder (mmb_companion/plots.json). Server thread only.
 */
final class Plots {
    private Plots() {}

    /** far enough apart for the largest structure (1024) on each side of the spawn block */
    static final int SPACING = 2048;
    static final int SPAWN_Y = 64;

    static final class Plot {
        int index;
        String name = "";
        String prompt = "";
        String owner = "";
        long generation;
        /** minX, minY, minZ, maxX, maxY, maxZ once built */
        int[] box;
        /** how the structure was turned (a {@link net.minecraft.world.level.block.Rotation} name) */
        String rotation;
        long created;

        BoundingBox box() {
            return box == null ? null : new BoundingBox(box[0], box[1], box[2], box[3], box[4], box[5]);
        }
    }

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static MinecraftServer loadedFor;
    private static List<Plot> plots = new ArrayList<>();

    private static Path file(MinecraftServer server) {
        return server.getWorldPath(LevelResource.ROOT).resolve(CompanionMod.MOD_ID).resolve("plots.json");
    }

    private static List<Plot> load(MinecraftServer server) {
        if (loadedFor == server) return plots;
        loadedFor = server;
        plots = new ArrayList<>();
        Path f = file(server);
        if (Files.exists(f)) {
            try {
                List<Plot> read = GSON.fromJson(Files.readString(f), new TypeToken<List<Plot>>() {}.getType());
                if (read != null) plots = new ArrayList<>(read);
            } catch (IOException | RuntimeException e) {
                CompanionMod.LOGGER.error("Couldn't read {}", f, e);
            }
        }
        return plots;
    }

    static void save(MinecraftServer server) {
        Path f = file(server);
        try {
            Files.createDirectories(f.getParent());
            Files.writeString(f, GSON.toJson(load(server)));
        } catch (IOException e) {
            CompanionMod.LOGGER.error("Couldn't write {}", f, e);
        }
    }

    static List<Plot> all(MinecraftServer server) {
        return List.copyOf(load(server));
    }

    /** A new, empty plot after the last one. */
    static Plot create(MinecraftServer server, String owner, String prompt) {
        List<Plot> list = load(server);
        Plot p = new Plot();
        p.index = list.stream().mapToInt(x -> x.index).max().orElse(0) + 1;
        p.owner = owner;
        p.prompt = prompt;
        p.created = System.currentTimeMillis();
        list.add(p);
        save(server);
        return p;
    }

    static void remove(MinecraftServer server, Plot plot) {
        load(server).remove(plot);
        save(server);
    }

    static Plot get(MinecraftServer server, int index) {
        return load(server).stream().filter(p -> p.index == index).findFirst().orElse(null);
    }

    /** The plot a position lies in (nearest spawn block along X), if it exists. */
    static Plot at(MinecraftServer server, BlockPos pos) {
        return get(server, Math.round(pos.getX() / (float) SPACING));
    }

    /** The bedrock block of plot `index` (0 = lobby). */
    static BlockPos spawn(int index) {
        return new BlockPos(index * SPACING, SPAWN_Y, 0);
    }

    /** Makes sure the spawn block is there; returns where to stand. */
    static BlockPos standOn(ServerLevel build, int index) {
        BlockPos block = spawn(index);
        if (!build.getBlockState(block).is(Blocks.BEDROCK)) build.setBlock(block, Blocks.BEDROCK.defaultBlockState(), Block.UPDATE_ALL);
        return block.above();
    }
}
