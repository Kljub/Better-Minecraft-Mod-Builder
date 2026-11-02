package sheepfromheaven.mmb.companion;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import net.minecraft.commands.arguments.blocks.BlockStateParser;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.Vec3i;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtIo;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Replays the web UI's compiled structure (size, palette of block-state strings, build ops — see
 * webapp/lib/structureAi.ts) in front of the player, spread over ticks by {@link BuildJob}, and saves
 * world regions as structure-template .nbt bytes. Server thread only. Shared by the
 * 1.21.1 and 26.2 builds; what differs lives in Compat (src/v1_21_1, src/v26_2).
 */
final class Structures {
    private Structures() {}

    /**
     * The web UI's compiled structure (webapp/lib/structureAi.ts): size, palette and the build ops
     * as flat records of 8 ints — kind (0 fill, 1 hollow, 2 walls, 3 set), x1,y1,z1, x2,y2,z2, palette
     * index (-1 = air). Palette entries this Minecraft doesn't know are null; their ops are skipped.
     */
    record Compiled(int sx, int sy, int sz, BlockState[] palette, int[] ops, List<String> unknown) {
        static final int STRIDE = 8;

        Vec3i size(Rotation rotation) {
            boolean turned = rotation == Rotation.CLOCKWISE_90 || rotation == Rotation.COUNTERCLOCKWISE_90;
            return new Vec3i(turned ? sz : sx, sy, turned ? sx : sz);
        }
    }

    static Compiled fromJson(ServerLevel level, JsonObject json) {
        HolderLookup<Block> blocks = level.registryAccess().lookupOrThrow(Registries.BLOCK);
        JsonArray size = json.getAsJsonArray("size");
        JsonArray palette = json.getAsJsonArray("palette");
        JsonArray ops = json.getAsJsonArray("ops");
        if (ops == null) throw new IllegalStateException("The web UI is older than this mod — update it (no build ops in the answer).");

        BlockState[] states = new BlockState[palette.size()];
        List<String> unknown = new ArrayList<>();
        for (int i = 0; i < palette.size(); i++) {
            String state = palette.get(i).getAsString();
            try {
                states[i] = BlockStateParser.parseForBlock(blocks, state, false).blockState();
            } catch (CommandSyntaxException e) {
                if (unknown.size() < 10) unknown.add(state);
            }
        }
        int[] flat = new int[ops.size() - ops.size() % Compiled.STRIDE];
        for (int i = 0; i < flat.length; i++) flat[i] = ops.get(i).getAsInt();
        return new Compiled(size.get(0).getAsInt(), size.get(1).getAsInt(), size.get(2).getAsInt(), states, flat, unknown);
    }

    /** One build op in world coordinates (a turned box is still an axis-aligned box). */
    private record WorldOp(int kind, BoundingBox box, BlockState state) {}

    /**
     * Replays the ops into the world, turned by `rotation`, the structure's corner at the box's min
     * corner — chunk column by chunk column (each op clipped to the column, in op order), so every
     * chunk is loaded once. One call does one op in one column. With `record`, every block it changes
     * is remembered first (for undoing an edit).
     */
    static BuildJob.Step placeOps(ServerLevel level, Compiled c, Rotation rotation, BoundingBox box, BuildJob.Snapshot record) {
        List<WorldOp> ops = new ArrayList<>();
        int[] o = c.ops();
        long total = 0;
        for (int i = 0; i + Compiled.STRIDE <= o.length; i += Compiled.STRIDE) {
            int p = o[i + 7];
            if (p >= c.palette().length || (p >= 0 && c.palette()[p] == null)) continue;
            BlockPos a = world(c, rotation, box, o[i + 1], o[i + 2], o[i + 3]);
            BlockPos b = world(c, rotation, box, o[i + 4], o[i + 5], o[i + 6]);
            BlockState state = p < 0 ? Blocks.AIR.defaultBlockState() : c.palette()[p].rotate(rotation);
            BoundingBox wb = BoundingBox.fromCorners(a, b);
            ops.add(new WorldOp(o[i], wb, state));
            total += (long) wb.getXSpan() * wb.getYSpan() * wb.getZSpan();
        }
        long totalBlocks = total;
        int minCx = box.minX() >> 4, maxCx = box.maxX() >> 4, minCz = box.minZ() >> 4, maxCz = box.maxZ() >> 4;
        return new BuildJob.Step() {
            private int cx = minCx, cz = minCz, op;
            private long done;
            private final BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();

            @Override public long total() { return totalBlocks; }
            @Override public long done() { return done; }

            @Override public boolean next() {
                if (cz > maxCz) return false;
                if (op < ops.size()) {
                    WorldOp w = ops.get(op++);
                    BoundingBox b = w.box();
                    int x0 = Math.max(b.minX(), cx << 4), x1 = Math.min(b.maxX(), (cx << 4) + 15);
                    int z0 = Math.max(b.minZ(), cz << 4), z1 = Math.min(b.maxZ(), (cz << 4) + 15);
                    if (x0 <= x1 && z0 <= z1) {
                        BlockState air = Blocks.AIR.defaultBlockState();
                        for (int y = b.minY(); y <= b.maxY(); y++) for (int z = z0; z <= z1; z++) for (int x = x0; x <= x1; x++) {
                            boolean onX = x == b.minX() || x == b.maxX(), onY = y == b.minY() || y == b.maxY(), onZ = z == b.minZ() || z == b.maxZ();
                            BlockState put = switch (w.kind()) {
                                case 1 -> onX || onY || onZ ? w.state() : air; // hollow
                                case 2 -> onX || onZ ? w.state() : null;      // walls
                                default -> w.state();                          // fill, set
                            };
                            if (put == null) continue;
                            pos.set(x, y, z);
                            BlockState before = level.getBlockState(pos);
                            if (before == put) continue;
                            if (record != null) record.add(pos, before);
                            level.setBlock(pos, put, Block.UPDATE_CLIENTS);
                        }
                        done += (long) (x1 - x0 + 1) * b.getYSpan() * (z1 - z0 + 1);
                    }
                    return true;
                }
                op = 0;
                if (++cx > maxCx) { cx = minCx; cz++; }
                return true;
            }
        };
    }

    /** Structure position → world position (same turn as StructureTemplate.transform, shifted into the box). */
    private static BlockPos world(Compiled c, Rotation rotation, BoundingBox box, int x, int y, int z) {
        int wx, wz;
        switch (rotation) {
            case CLOCKWISE_90 -> { wx = c.sz() - 1 - z; wz = x; }
            case CLOCKWISE_180 -> { wx = c.sx() - 1 - x; wz = c.sz() - 1 - z; }
            case COUNTERCLOCKWISE_90 -> { wx = z; wz = c.sx() - 1 - x; }
            default -> { wx = x; wz = z; }
        }
        return new BlockPos(box.minX() + wx, box.minY() + y, box.minZ() + wz);
    }

    /** The structure's front (its z = 0 side) faces north; turn it so the front faces back at the player. */
    static Rotation facingPlayer(Direction look) {
        return switch (look.getOpposite()) {
            case EAST -> Rotation.CLOCKWISE_90;
            case SOUTH -> Rotation.CLOCKWISE_180;
            case WEST -> Rotation.COUNTERCLOCKWISE_90;
            default -> Rotation.NONE;
        };
    }

    /** Where the rotated template goes: two blocks in front of the player, centred, floor at the feet. */
    static BoundingBox targetBox(Vec3i s, BlockPos feet, Direction look) {
        int w = s.getX(), h = s.getY(), d = s.getZ();
        int x, z;
        switch (look) {
            case NORTH -> { x = feet.getX() - w / 2; z = feet.getZ() - 2 - d + 1; }
            case SOUTH -> { x = feet.getX() - w / 2; z = feet.getZ() + 2; }
            case EAST -> { x = feet.getX() + 2; z = feet.getZ() - d / 2; }
            default -> { x = feet.getX() - 2 - w + 1; z = feet.getZ() - d / 2; }
        }
        return new BoundingBox(x, feet.getY(), z, x + w - 1, feet.getY() + h - 1, z + d - 1);
    }

    /** Copies a world region (blocks + block entities, including air; no entities) into a template. */
    static StructureTemplate capture(ServerLevel level, BoundingBox box, String author) {
        StructureTemplate t = new StructureTemplate();
        Compat.fillFromWorld(t, level, new BlockPos(box.minX(), box.minY(), box.minZ()), new Vec3i(box.getXSpan(), box.getYSpan(), box.getZSpan()));
        t.setAuthor(author);
        return t;
    }

    static byte[] toNbt(StructureTemplate template) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        NbtIo.writeCompressed(template.save(new CompoundTag()), out);
        return out.toByteArray();
    }
}
