package sheepfromheaven.mmb.companion;

import com.google.gson.JsonObject;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.coordinates.BlockPosArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.GlobalPos;
import net.minecraft.core.Vec3i;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructurePlaceSettings;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;

/**
 * /mmb connect &lt;url&gt; &lt;token&gt; · status · project [key] · generate &lt;prompt&gt; · edit &lt;prompt&gt; · undo ·
 * pos1 [pos] · pos2 [pos] · upload [name] · world · leave · plots · plot &lt;nr&gt;. Permission level from the config
 * (default 2); generating only happens in the empty build world unless the config allows any world.
 */
final class MmbCommands {
    private MmbCommands() {}

    private record Generated(long id, String name, ResourceKey<Level> dimension, BoundingBox box, Rotation rotation) {}
    /** Small builds: a template of the area before (block-entity contents included). Big ones: a block-state snapshot. */
    private record Undo(ResourceKey<Level> dimension, BoundingBox box, BlockPos origin, StructureTemplate before, BuildJob.Snapshot snapshot, boolean edit) {}

    private static final Map<UUID, Generated> LAST = new ConcurrentHashMap<>();
    private static final Map<UUID, Undo> UNDO = new ConcurrentHashMap<>();
    private static final Map<UUID, BlockPos[]> SELECTION = new ConcurrentHashMap<>();
    private static final Set<UUID> BUSY = ConcurrentHashMap.newKeySet();
    /** the web UI's limits (webapp/lib/structureAi.ts MAX_SIDE / MAX_HEIGHT) */
    static final int MAX_SIDE = 1024, MAX_HEIGHT = 256;
    /**
     * Largest region (blocks, air included) saved as a template — for undo and for .nbt uploads.
     * 128³; bigger builds get a block-state undo and aren't uploaded (the web UI keeps their AI data).
     */
    private static final long MAX_TEMPLATE_VOLUME = 128L * 128 * 128;

    private static long volume(BoundingBox box) {
        return (long) box.getXSpan() * box.getYSpan() * box.getZSpan();
    }

    static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(Commands.literal("mmb")
                .requires(Compat.permission(CompanionConfig.PERMISSION_LEVEL::get))
                .executes(ctx -> help(ctx.getSource()))
                // "<url> <token>" as one greedy argument: Brigadier's quotable strings don't allow ':' or '/'
                // Changing the web UI account / project is for admins only, whatever permissionLevel allows.
                .then(Commands.literal("connect")
                        .requires(Compat.permission(() -> 3))
                        .then(Commands.argument("url_and_token", StringArgumentType.greedyString())
                                .executes(ctx -> connect(ctx.getSource(), StringArgumentType.getString(ctx, "url_and_token")))))
                .then(Commands.literal("status").executes(ctx -> status(ctx.getSource())))
                .then(Commands.literal("project")
                        .requires(Compat.permission(() -> 3))
                        .executes(ctx -> project(ctx.getSource(), ""))
                        .then(Commands.argument("key", StringArgumentType.greedyString())
                                .executes(ctx -> project(ctx.getSource(), StringArgumentType.getString(ctx, "key")))))
                .then(Commands.literal("generate")
                        .then(Commands.argument("prompt", StringArgumentType.greedyString())
                                .executes(ctx -> generate(ctx.getSource(), StringArgumentType.getString(ctx, "prompt")))))
                .then(Commands.literal("edit")
                        .then(Commands.argument("prompt", StringArgumentType.greedyString())
                                .executes(ctx -> edit(ctx.getSource(), StringArgumentType.getString(ctx, "prompt")))))
                .then(Commands.literal("undo").executes(ctx -> undo(ctx.getSource())))
                .then(Commands.literal("world").executes(ctx -> world(ctx.getSource())))
                .then(Commands.literal("leave").executes(ctx -> leave(ctx.getSource())))
                .then(Commands.literal("plots").executes(ctx -> plots(ctx.getSource())))
                .then(Commands.literal("plot")
                        .then(Commands.argument("nr", IntegerArgumentType.integer(1))
                                .executes(ctx -> plot(ctx.getSource(), IntegerArgumentType.getInteger(ctx, "nr")))))
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
        info(src, "/mmb connect <url> <token> · /mmb status · /mmb world · /mmb leave · /mmb plots · /mmb plot <nr> · /mmb generate <prompt> · /mmb edit <prompt> · /mmb undo · /mmb pos1 · /mmb pos2 · /mmb upload [name] · /mmb project [key]");
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
        if (CompanionConfig.ONLY_IN_BUILD_WORLD.get() && src.getLevel().dimension() != Compat.BUILD_WORLD) {
            fail(src, "Structures are only generated in the empty build world — /mmb world takes you there, /mmb leave back.");
            return 0;
        }
        UUID id = who(src);
        if (!BUSY.add(id)) {
            fail(src, "Still working on your last structure …");
            return 0;
        }
        Direction look = Direction.fromYRot(src.getRotation().y);
        BlockPos feet = BlockPos.containing(src.getPosition());
        ServerLevel level = src.getLevel();
        // In the build world every structure gets its own fresh plot; players are taken there right away.
        Plots.Plot plot = null;
        if (level.dimension() == Compat.BUILD_WORLD) {
            plot = Plots.create(src.getServer(), src.getTextName(), prompt);
            feet = Plots.standOn(level, plot.index);
            look = Direction.NORTH;
            if (src.getEntity() instanceof ServerPlayer player) Compat.teleport(player, level, feet.getX() + 0.5, feet.getY(), feet.getZ() + 0.5, 180, 0);
            info(src, "Plot #" + plot.index + " — the structure will appear in front of you.");
        }
        Plots.Plot target = plot;
        Direction finalLook = look;
        BlockPos finalFeet = feet;
        info(src, "Designing \"" + prompt + "\" with " + CompanionConfig.PROVIDER.get() + " — this can take a few minutes …");
        WebApi.generate(prompt).whenComplete((json, err) -> src.getServer().execute(() -> {
            boolean started = false;
            try {
                if (err != null) { fail(src, "Generation failed: " + message(err)); return; }
                placeGenerated(src, id, level, json, finalLook, finalFeet, target);
                started = true;
            } catch (RuntimeException e) {
                fail(src, "Couldn't place the structure: " + message(e));
            } finally {
                if (!started) {
                    BUSY.remove(id);
                    if (target != null) Plots.remove(src.getServer(), target);
                }
            }
        }));
        return 1;
    }

    /** Starts the build (spread over ticks); BUSY is cleared when it's done. */
    private static void placeGenerated(CommandSourceStack src, UUID id, ServerLevel level, JsonObject json, Direction look, BlockPos feet, Plots.Plot plot) {
        Structures.Compiled compiled = Structures.fromJson(level, json);
        String name = json.get("name").getAsString();
        long genId = json.get("id").getAsLong();
        Rotation rotation = Structures.facingPlayer(look);
        BoundingBox box = Structures.targetBox(compiled.size(rotation), feet, look);
        boolean small = volume(box) <= MAX_TEMPLATE_VOLUME;
        if (plot != null) {
            plot.name = name;
            plot.generation = genId;
            plot.box = new int[] {box.minX(), box.minY(), box.minZ(), box.maxX(), box.maxY(), box.maxZ()};
            plot.rotation = rotation.name();
            Plots.save(src.getServer());
        }

        BlockPos origin = new BlockPos(box.minX(), box.minY(), box.minZ());
        BuildJob.Snapshot snapshot = small ? null : new BuildJob.Snapshot();
        UNDO.put(id, new Undo(level.dimension(), box, origin, small ? Structures.capture(level, box, "undo") : null, snapshot, false));
        if (!compiled.unknown().isEmpty()) fail(src, "Skipping unknown blocks: " + String.join(", ", compiled.unknown()));
        String dims = box.getXSpan() + "×" + box.getYSpan() + "×" + box.getZSpan();
        if (!small) info(src, "Building " + name + " (" + dims + ", " + json.get("blockCount").getAsLong() + " blocks) over the next moments …");

        BuildJob.start(level, List.of(
                BuildJob.clear(level, box, snapshot),
                Structures.placeOps(level, compiled, rotation, box, null),
                BuildJob.updateShapes(level, box)
        ), msg -> info(src, msg), () -> {
            BUSY.remove(id);
            LAST.put(id, new Generated(genId, name, level.dimension(), box, rotation));
            info(src, "Placed " + name + " (" + dims + ", " + json.get("provider").getAsString() + "). /mmb undo removes it"
                    + (small ? "; edit it and /mmb upload sends your version." : "."));
            if (snapshot != null && snapshot.overflow) fail(src, "The area held too many blocks to remember — /mmb undo can't fully restore it.");
            if (small) uploadBox(src, level, box, name, genId, src.getTextName());
            else info(src, "Too big to upload as .nbt (more than " + MAX_TEMPLATE_VOLUME + " blocks of space) — the design is saved in the web UI.");
        }, e -> {
            BUSY.remove(id);
            fail(src, "Building stopped: " + message(e) + " — /mmb undo restores the area.");
        });
    }

    /** The structure to edit: the plot you stand on in the build world, else your last generation here. */
    private static Generated editTarget(CommandSourceStack src) {
        if (src.getLevel().dimension() == Compat.BUILD_WORLD) {
            Plots.Plot p = Plots.at(src.getServer(), BlockPos.containing(src.getPosition()));
            if (p != null && p.box != null && p.generation > 0) {
                Rotation r = p.rotation == null ? Rotation.CLOCKWISE_180 : Rotation.valueOf(p.rotation); // plots face north
                return new Generated(p.generation, p.name, Compat.BUILD_WORLD, p.box(), r);
            }
        }
        Generated last = LAST.get(who(src));
        return last != null && last.dimension() == src.getLevel().dimension() ? last : null;
    }

    private static int edit(CommandSourceStack src, String prompt) {
        Generated target = editTarget(src);
        if (target == null) {
            fail(src, "Stand on a structure's plot (/mmb plots, /mmb plot <nr>) or generate one first.");
            return 0;
        }
        UUID id = who(src);
        if (!BUSY.add(id)) {
            fail(src, "Still working on your last structure …");
            return 0;
        }
        ServerLevel level = src.getLevel();
        info(src, "Changing " + target.name() + ": \"" + prompt + "\" with " + CompanionConfig.PROVIDER.get() + " …");
        WebApi.edit(target.id(), prompt).whenComplete((json, err) -> src.getServer().execute(() -> {
            boolean started = false;
            try {
                if (err != null) { fail(src, "Edit failed: " + message(err)); return; }
                applyEdit(src, id, level, json, target);
                started = true;
            } catch (RuntimeException e) {
                fail(src, "Couldn't apply the edit: " + message(e));
            } finally {
                if (!started) BUSY.remove(id);
            }
        }));
        return 1;
    }

    /** Builds the edit's ops on top of the structure (no clearing); undo puts back exactly what they changed. */
    private static void applyEdit(CommandSourceStack src, UUID id, ServerLevel level, JsonObject json, Generated target) {
        Structures.Compiled compiled = Structures.fromJson(level, json);
        BoundingBox box = target.box();
        Vec3i size = compiled.size(target.rotation());
        if (size.getX() != box.getXSpan() || size.getY() != box.getYSpan() || size.getZ() != box.getZSpan()) {
            throw new IllegalStateException("The edit doesn't match the structure's size");
        }
        boolean small = volume(box) <= MAX_TEMPLATE_VOLUME;
        BuildJob.Snapshot snapshot = small ? null : new BuildJob.Snapshot();
        BlockPos origin = new BlockPos(box.minX(), box.minY(), box.minZ());
        UNDO.put(id, new Undo(level.dimension(), box, origin, small ? Structures.capture(level, box, "undo") : null, snapshot, true));
        if (!compiled.unknown().isEmpty()) fail(src, "Skipping unknown blocks: " + String.join(", ", compiled.unknown()));

        BuildJob.start(level, List.of(
                Structures.placeOps(level, compiled, target.rotation(), box, snapshot),
                BuildJob.updateShapes(level, box)
        ), msg -> info(src, msg), () -> {
            BUSY.remove(id);
            info(src, "Changed " + target.name() + " (" + json.get("provider").getAsString() + "). /mmb undo takes the change back.");
            if (snapshot != null && snapshot.overflow) fail(src, "The edit changed too many blocks to remember — /mmb undo can't fully restore it.");
            if (small) uploadBox(src, level, box, target.name(), target.id(), src.getTextName());
        }, e -> {
            BUSY.remove(id);
            fail(src, "Edit stopped: " + message(e) + " — /mmb undo takes back what was changed.");
        });
    }

    private static int undo(CommandSourceStack src) {
        UUID id = who(src);
        Undo u = UNDO.get(id);
        if (u == null || u.dimension() != src.getLevel().dimension()) {
            fail(src, "Nothing to undo here.");
            return 0;
        }
        if (!BUSY.add(id)) {
            fail(src, "Still building — wait until it's done.");
            return 0;
        }
        UNDO.remove(id);
        if (!u.edit()) LAST.remove(id);
        ServerLevel level = src.getLevel();
        if (u.before() != null) {
            BUSY.remove(id);
            u.before().placeInWorld(level, u.origin(), u.origin(), new StructurePlaceSettings(), RandomSource.create(), Block.UPDATE_CLIENTS);
            info(src, "Restored what was there before.");
            return 1;
        }
        info(src, "Restoring what was there before …");
        // A generation is cleared away first; an edit's snapshot already holds every block it changed (air included).
        List<BuildJob.Step> steps = u.edit()
                ? List.of(BuildJob.restore(level, u.snapshot()), BuildJob.updateShapes(level, u.box()))
                : List.of(BuildJob.clear(level, u.box(), null), BuildJob.restore(level, u.snapshot()), BuildJob.updateShapes(level, u.box()));
        BuildJob.start(level, steps,
                msg -> info(src, msg), () -> {
                    BUSY.remove(id);
                    info(src, "Restored what was there before.");
                }, e -> {
                    BUSY.remove(id);
                    fail(src, "Undo stopped: " + message(e));
                });
        return 1;
    }

    // ── build world ──────────────────────────────────────────────────────────

    /** Where each player came from before /mmb world. */
    private static final Map<UUID, Back> BACK = new ConcurrentHashMap<>();
    private record Back(ResourceKey<Level> dimension, double x, double y, double z, float yRot, float xRot) {}

    private static int world(CommandSourceStack src) {
        if (!(src.getEntity() instanceof ServerPlayer player)) {
            fail(src, "Only players can travel.");
            return 0;
        }
        if (!toBuildWorld(player)) {
            fail(src, "The build world is missing — restart the server once with this mod installed.");
            return 0;
        }
        info(src, "Welcome to the build world — /mmb generate <prompt> builds in front of you, /mmb leave takes you back.");
        return 1;
    }

    /** Puts the player on the build world's lobby bedrock block (plot 0; everything else is void), remembering where they came from. */
    static boolean toBuildWorld(ServerPlayer player) {
        ServerLevel build = player.level().getServer().getLevel(Compat.BUILD_WORLD);
        if (build == null) return false;
        if (player.level() != build) {
            BACK.put(player.getUUID(), new Back(player.level().dimension(), player.getX(), player.getY(), player.getZ(), player.getYRot(), player.getXRot()));
        }
        BlockPos stand = Plots.standOn(build, 0);
        Compat.teleport(player, build, stand.getX() + 0.5, stand.getY(), stand.getZ() + 0.5, player.getYRot(), player.getXRot());
        return true;
    }

    private static int plots(CommandSourceStack src) {
        List<Plots.Plot> all = Plots.all(src.getServer()).stream().filter(p -> p.box != null).toList();
        if (all.isEmpty()) {
            info(src, "No structures yet — /mmb world, then /mmb generate <prompt>.");
            return 1;
        }
        info(src, all.size() + " structure(s) in the build world — /mmb plot <nr> takes you there:");
        for (Plots.Plot p : all.subList(Math.max(0, all.size() - 20), all.size())) {
            BoundingBox b = p.box();
            info(src, "#" + p.index + " " + p.name + " (" + b.getXSpan() + "×" + b.getYSpan() + "×" + b.getZSpan() + ", " + p.owner + ") — " + p.prompt);
        }
        return 1;
    }

    private static int plot(CommandSourceStack src, int index) {
        if (!(src.getEntity() instanceof ServerPlayer player)) {
            fail(src, "Only players can travel.");
            return 0;
        }
        Plots.Plot p = Plots.get(src.getServer(), index);
        ServerLevel build = src.getServer().getLevel(Compat.BUILD_WORLD);
        if (p == null || build == null) {
            fail(src, "There's no plot #" + index + " — /mmb plots lists them.");
            return 0;
        }
        if (player.level() != build) {
            BACK.put(player.getUUID(), new Back(player.level().dimension(), player.getX(), player.getY(), player.getZ(), player.getYRot(), player.getXRot()));
        }
        BlockPos stand = Plots.standOn(build, index);
        Compat.teleport(player, build, stand.getX() + 0.5, stand.getY(), stand.getZ() + 0.5, 180, 0);
        info(src, "Plot #" + index + " " + p.name + " — edit it, then /mmb upload sends your version.");
        return 1;
    }

    private static int leave(CommandSourceStack src) {
        if (!(src.getEntity() instanceof ServerPlayer player)) {
            fail(src, "Only players can travel.");
            return 0;
        }
        Back back = BACK.remove(player.getUUID());
        ServerLevel level = back == null ? null : src.getServer().getLevel(back.dimension());
        if (level != null) {
            Compat.teleport(player, level, back.x(), back.y(), back.z(), back.yRot(), back.xRot());
        } else {
            GlobalPos spawn = Compat.worldSpawn(src.getServer());
            ServerLevel spawnLevel = src.getServer().getLevel(spawn.dimension());
            if (spawnLevel == null) spawnLevel = src.getServer().overworld();
            BlockPos p = spawn.pos();
            Compat.teleport(player, spawnLevel, p.getX() + 0.5, p.getY(), p.getZ() + 0.5, player.getYRot(), player.getXRot());
        }
        info(src, "Back again.");
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
            if (volume(box) > MAX_TEMPLATE_VOLUME) {
                fail(src, "The selection is too big to upload (" + box.getXSpan() + "×" + box.getYSpan() + "×" + box.getZSpan()
                        + " — at most " + MAX_TEMPLATE_VOLUME + " blocks of space, e.g. 256×32×256).");
                return 0;
            }
            uploadBox(src, src.getLevel(), box, name == null ? "structure" : name, 0, src.getTextName());
            SELECTION.remove(id);
            return 1;
        }
        // Standing on a plot of the build world: that plot's structure, as edited.
        Plots.Plot here = src.getLevel().dimension() == Compat.BUILD_WORLD ? Plots.at(src.getServer(), BlockPos.containing(src.getPosition())) : null;
        if (here != null && here.box != null) {
            if (volume(here.box()) > MAX_TEMPLATE_VOLUME) {
                fail(src, "This structure is too big to upload — select a part with /mmb pos1 and /mmb pos2.");
                return 0;
            }
            uploadBox(src, src.getLevel(), here.box(), name == null ? here.name : name, here.generation, src.getTextName());
            return 1;
        }
        Generated last = LAST.get(id);
        if (last == null || last.dimension() != src.getLevel().dimension()) {
            fail(src, "Mark the corners with /mmb pos1 and /mmb pos2 first (or /mmb generate something).");
            return 0;
        }
        if (volume(last.box()) > MAX_TEMPLATE_VOLUME) {
            fail(src, "Your last structure is too big to upload — select a part with /mmb pos1 and /mmb pos2.");
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
