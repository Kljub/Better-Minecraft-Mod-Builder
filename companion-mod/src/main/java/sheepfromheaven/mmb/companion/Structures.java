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
import net.minecraft.nbt.IntTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.NbtIo;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Clearable;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructurePlaceSettings;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Turns the web UI's expanded structure (size, palette of block-state strings, flat x,y,z,index
 * list — see webapp/lib/structureAi.ts) into a {@link StructureTemplate}, places it in front of the
 * player and saves world regions as structure-template .nbt bytes. Server thread only. Shared by the
 * 1.21.1 and 26.2 builds; what differs lives in Compat (src/v1_21_1, src/v26_2).
 */
final class Structures {
    private Structures() {}

    record Built(StructureTemplate template, List<String> unknown) {}

    static Built fromJson(ServerLevel level, JsonObject json) {
        HolderLookup<Block> blocks = level.registryAccess().lookupOrThrow(Registries.BLOCK);
        JsonArray size = json.getAsJsonArray("size");
        JsonArray palette = json.getAsJsonArray("palette");
        JsonArray list = json.getAsJsonArray("blocks");

        ListTag paletteTag = new ListTag();
        int[] remap = new int[palette.size()];
        List<String> unknown = new ArrayList<>();
        for (int i = 0; i < palette.size(); i++) {
            String state = palette.get(i).getAsString();
            try {
                paletteTag.add(NbtUtils.writeBlockState(BlockStateParser.parseForBlock(blocks, state, false).blockState()));
                remap[i] = paletteTag.size() - 1;
            } catch (CommandSyntaxException e) {
                remap[i] = -1;
                if (unknown.size() < 10) unknown.add(state);
            }
        }

        ListTag blockTag = new ListTag();
        for (int i = 0; i + 3 < list.size(); i += 4) {
            int p = list.get(i + 3).getAsInt();
            if (p < 0 || p >= remap.length || remap[p] < 0) continue;
            CompoundTag b = new CompoundTag();
            b.put("pos", ints(list.get(i).getAsInt(), list.get(i + 1).getAsInt(), list.get(i + 2).getAsInt()));
            b.putInt("state", remap[p]);
            blockTag.add(b);
        }

        CompoundTag tag = new CompoundTag();
        tag.put("size", ints(size.get(0).getAsInt(), size.get(1).getAsInt(), size.get(2).getAsInt()));
        tag.put("palette", paletteTag);
        tag.put("blocks", blockTag);
        tag.put("entities", new ListTag());
        NbtUtils.addCurrentDataVersion(tag);

        StructureTemplate template = new StructureTemplate();
        template.load(blocks, tag);
        return new Built(template, unknown);
    }

    private static ListTag ints(int... values) {
        ListTag t = new ListTag();
        for (int v : values) t.add(IntTag.valueOf(v));
        return t;
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
    static BoundingBox targetBox(StructureTemplate template, Rotation rotation, BlockPos feet, Direction look) {
        Vec3i s = template.getSize(rotation);
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

    /** Clears the box to air and places the template rotated into it. */
    static void place(ServerLevel level, StructureTemplate template, Rotation rotation, BoundingBox box) {
        StructurePlaceSettings settings = new StructurePlaceSettings().setRotation(rotation);
        BoundingBox atZero = template.getBoundingBox(settings, BlockPos.ZERO);
        BlockPos origin = new BlockPos(box.minX() - atZero.minX(), box.minY() - atZero.minY(), box.minZ() - atZero.minZ());
        clear(level, box);
        template.placeInWorld(level, origin, origin, settings, RandomSource.create(), Block.UPDATE_CLIENTS);
    }

    static void clear(ServerLevel level, BoundingBox box) {
        for (BlockPos pos : BlockPos.betweenClosed(box.minX(), box.minY(), box.minZ(), box.maxX(), box.maxY(), box.maxZ())) {
            if (level.getBlockState(pos).isAir()) continue;
            // empty chests etc. first so nothing spills (the undo snapshot already holds their items)
            if (level.getBlockEntity(pos) instanceof Clearable c) c.clearContent();
            level.setBlock(pos, Blocks.AIR.defaultBlockState(), Compat.CLEAR_FLAGS);
        }
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
