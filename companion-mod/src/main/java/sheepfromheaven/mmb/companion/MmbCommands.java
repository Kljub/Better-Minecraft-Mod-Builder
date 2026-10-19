package sheepfromheaven.mmb.companion;

import com.google.gson.JsonObject;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.coordinates.BlockPosArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructurePlaceSettings;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;

/**
 * /mmb connect &lt;url&gt; &lt;token&gt; · status · project [key] · generate &lt;prompt&gt; · undo ·
 * pos1 [pos] · pos2 [pos] · upload [name]. Needs op level 2 (it places blocks).
 */
final class MmbCommands {
    private MmbCommands() {}

    private record Generated(long id, String name, ResourceKey<Level> dimension, BoundingBox box) {}
    private record Undo(ResourceKey<Level> dimension, BlockPos origin, StructureTemplate before) {}

    private static final Map<UUID, Generated> LAST = new ConcurrentHashMap<>();
    private static final Map<UUID, Undo> UNDO = new ConcurrentHashMap<>();
    private static final Map<UUID, BlockPos[]> SELECTION = new ConcurrentHashMap<>();
    private static final Set<UUID> BUSY = ConcurrentHashMap.newKeySet();
    /** the web UI's limit (webapp/lib/structureAi.ts MAX_SIZE) */
    private static final int MAX_UPLOAD_SIDE = 128;

    static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(Commands.literal("mmb")
                .requires(Compat.GAMEMASTERS)
                .executes(ctx -> help(ctx.getSource()))
                // "<url> <token>" as one greedy argument: Brigadier's quotable strings don't allow ':' or '/'
                .then(Commands.literal("connect")
                        .then(Commands.argument("url_and_token", StringArgumentType.greedyString())
                                .executes(ctx -> connect(ctx.getSource(), StringArgumentType.getString(ctx, "url_and_token")))))
                .then(Commands.literal("status").executes(ctx -> status(ctx.getSource())))
                .then(Commands.literal("project")
                        .executes(ctx -> project(ctx.getSource(), ""))
                        .then(Commands.argument("key", StringArgumentType.greedyString())
                                .executes(ctx -> project(ctx.getSource(), StringArgumentType.getString(ctx, "key")))))
                .then(Commands.literal("generate")
                        .then(Commands.argument("prompt", StringArgumentType.greedyString())
                                .executes(ctx -> generate(ctx.getSource(), StringArgumentType.getString(ctx, "prompt")))))
                .then(Commands.literal("undo").executes(ctx -> undo(ctx.getSource())))
                .then(Commands.literal("pos1")
                        .executes(ctx -> select(ctx.getSource(), 0, BlockPos.containing(ctx.getSource().getPosition())))
                        .then(Commands.argument("pos", BlockPosArgument.blockPos()).executes(ctx -> select(ctx.getSource(), 0, BlockPosArgument.getLoadedBlockPos(ctx, "pos")))))
                .then(Commands.literal("pos2")
                        .executes(ctx -> select(ctx.getSource(), 1, BlockPos.containing(ctx.getSource().getPosition())))
                        .then(Commands.argument("pos", BlockPosArgument.blockPos()).executes(ctx -> select(ctx.getSource(), 1, BlockPosArgument.getLoadedBlockPos(ctx, "pos")))))
                .then(Commands.literal("upload")
                        .executes(ctx -> upload(ctx, null))
                        .then(Commands.argument("name", StringArgumentType.word()).executes(ctx -> upload(ctx, StringArgumentType.getString(ctx, "name"))))));
    }

    // ── messages ─────────────────────────────────────────────────────────────

    private static void info(CommandSourceStack src, String msg) {
        src.sendSuccess(() -> Component.literal("[MMB] ").withStyle(ChatFormatting.AQUA).append(Component.literal(msg).withStyle(ChatFormatting.WHITE)), false);
    }

    private static void fail(CommandSourceStack src, String msg) {
        src.sendFailure(Component.literal("[MMB] " + msg));
    }

    private static String message(Throwable t) {
        Throwable c = t instanceof CompletionException && t.getCause() != null ? t.getCause() : t;
        return c.getMessage() != null ? c.getMessage() : c.toString();
    }

    /** Players, and also the console / command blocks (one shared slot) — e.g. /execute positioned … run mmb generate … */
    private static final UUID CONSOLE = new UUID(0, 0);

    private static UUID who(CommandSourceStack src) {
        Entity e = src.getEntity();
        return e != null ? e.getUUID() : CONSOLE;
    }

    private static int help(CommandSourceStack src) {
        info(src, "/mmb connect <url> <token> · /mmb status · /mmb generate <prompt> · /mmb undo · /mmb pos1 · /mmb pos2 · /mmb upload [name] · /mmb project [key]");
        return 1;
    }

    // ── connection ───────────────────────────────────────────────────────────

    private static int connect(CommandSourceStack src, String args) {
        String[] parts = args.trim().split("\\s+");
        if (parts.length != 2) {
            fail(src, "Usage: /mmb connect <url> <token>");
            return 0;
        }
        String url = parts[0], token = parts[1];
        if (!url.matches("https?://[^\\s/]+(/.*)?")) {
            fail(src, "The URL must start with http:// or https:// (e.g. http://192.168.1.20:3000)");
            return 0;
        }
        CompanionConfig.SERVER_URL.set(url);
        CompanionConfig.TOKEN.set(token.trim());
        CompanionConfig.SPEC.save();
        info(src, "Saved. Checking " + WebApi.base() + " …");
        return status(src);
    }

    private static int status(CommandSourceStack src) {
        WebApi.ping().whenComplete((body, err) -> src.getServer().execute(() -> {
            if (err != null) { fail(src, "Not connected to " + WebApi.base() + ": " + message(err)); return; }
            String project = CompanionConfig.PROJECT.get().isBlank() ? "the project open in the editor" : "project " + CompanionConfig.PROJECT.get();
            info(src, "Connected to " + WebApi.base() + " as " + body.get("username").getAsString() + " — structures go to " + project + ".");
            if (!body.get("ai").getAsBoolean()) fail(src, "That web UI isn't the dev server — /mmb generate needs it (npm run dev); uploads still work.");
        }));
        return 1;
    }

    private static int project(CommandSourceStack src, String key) {
        CompanionConfig.PROJECT.set(key.trim());
        CompanionConfig.SPEC.save();
        info(src, key.isBlank() ? "Structures go to whichever project is open in the editor." : "Structures go to project " + key.trim() + ".");
        return 1;
    }

    // ── generate / undo ──────────────────────────────────────────────────────

    private static int generate(CommandSourceStack src, String prompt) {
        UUID id = who(src);
        if (!BUSY.add(id)) {
            fail(src, "Still working on your last structure …");
            return 0;
        }
        Direction look = Direction.fromYRot(src.getRotation().y);
        BlockPos feet = BlockPos.containing(src.getPosition());
        ServerLevel level = src.getLevel();
        info(src, "Designing \"" + prompt + "\" with " + CompanionConfig.PROVIDER.get() + " — this can take a few minutes …");
        WebApi.generate(prompt).whenComplete((json, err) -> src.getServer().execute(() -> {
            try {
                if (err != null) { fail(src, "Generation failed: " + message(err)); return; }
                placeGenerated(src, id, level, json, look, feet);
            } catch (RuntimeException e) {
                fail(src, "Couldn't place the structure: " + message(e));
            } finally {
                BUSY.remove(id);
            }
        }));
        return 1;
    }

    private static void placeGenerated(CommandSourceStack src, UUID id, ServerLevel level, JsonObject json, Direction look, BlockPos feet) {
        Structures.Built built = Structures.fromJson(level, json);
        String name = json.get("name").getAsString();
        Rotation rotation = Structures.facingPlayer(look);
        BoundingBox box = Structures.targetBox(built.template(), rotation, feet, look);

        UNDO.put(id, new Undo(level.dimension(), new BlockPos(box.minX(), box.minY(), box.minZ()), Structures.capture(level, box, "undo")));
        Structures.place(level, built.template(), rotation, box);
        long genId = json.get("id").getAsLong();
        LAST.put(id, new Generated(genId, name, level.dimension(), box));

        info(src, "Placed " + name + " (" + box.getXSpan() + "×" + box.getYSpan() + "×" + box.getZSpan() + ", "
                + json.get("provider").getAsString() + "). /mmb undo removes it; edit it and /mmb upload sends your version.");
        if (!built.unknown().isEmpty()) fail(src, "Skipped unknown blocks: " + String.join(", ", built.unknown()));
        uploadBox(src, level, box, name, genId, src.getTextName());
    }

    private static int undo(CommandSourceStack src) {
        Undo u = UNDO.remove(who(src));
        if (u == null || u.dimension() != src.getLevel().dimension()) {
            fail(src, "Nothing to undo here.");
            return 0;
        }
        u.before().placeInWorld(src.getLevel(), u.origin(), u.origin(), new StructurePlaceSettings(), RandomSource.create(), Block.UPDATE_CLIENTS);
        LAST.remove(who(src));
        info(src, "Restored what was there before.");
        return 1;
    }

    // ── selection / upload ───────────────────────────────────────────────────

    private static int select(CommandSourceStack src, int corner, BlockPos pos) {
        BlockPos[] sel = SELECTION.computeIfAbsent(who(src), k -> new BlockPos[2]);
        sel[corner] = pos;
        String size = "";
        if (sel[0] != null && sel[1] != null) {
            BoundingBox box = BoundingBox.fromCorners(sel[0], sel[1]);
            size = " — selection " + box.getXSpan() + "×" + box.getYSpan() + "×" + box.getZSpan() + ", now /mmb upload <name>";
        }
        info(src, "pos" + (corner + 1) + " = " + pos.toShortString() + size);
        return 1;
    }

    /** With a pos1/pos2 selection: uploads that region. Without: re-uploads your last generated structure as you edited it. */
    private static int upload(CommandContext<CommandSourceStack> ctx, String name) {
        CommandSourceStack src = ctx.getSource();
        UUID id = who(src);
        BlockPos[] sel = SELECTION.get(id);
        if (sel != null && sel[0] != null && sel[1] != null) {
            BoundingBox box = BoundingBox.fromCorners(sel[0], sel[1]);
            int max = MAX_UPLOAD_SIDE;
            if (box.getXSpan() > max || box.getYSpan() > max || box.getZSpan() > max) {
                fail(src, "The selection is larger than " + max + " blocks on a side.");
                return 0;
            }
            uploadBox(src, src.getLevel(), box, name == null ? "structure" : name, 0, src.getTextName());
            SELECTION.remove(id);
            return 1;
        }
        Generated last = LAST.get(id);
        if (last == null || last.dimension() != src.getLevel().dimension()) {
            fail(src, "Mark the corners with /mmb pos1 and /mmb pos2 first (or /mmb generate something).");
            return 0;
        }
        uploadBox(src, src.getLevel(), last.box(), name == null ? last.name() : name, last.id(), src.getTextName());
        return 1;
    }

    private static void uploadBox(CommandSourceStack src, ServerLevel level, BoundingBox box, String name, long parent, String author) {
        byte[] nbt;
        try {
            nbt = Structures.toNbt(Structures.capture(level, box, author));
        } catch (java.io.IOException e) {
            fail(src, "Couldn't save the structure: " + e.getMessage());
            return;
        }
        WebApi.upload(name, nbt, parent).whenComplete((body, err) -> src.getServer().execute(() -> {
            if (err != null) { fail(src, "Upload failed: " + message(err)); return; }
            info(src, "Uploaded " + body.get("name").getAsString() + ".nbt (" + nbt.length / 1024 + " KB) — it appears in the editor's Structures tab, folder \"From Minecraft\".");
        }));
    }
}
