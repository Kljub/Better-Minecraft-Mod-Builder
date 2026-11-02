package sheepfromheaven.mmb.companion;

import it.unimi.dsi.fastutil.ints.IntArrayList;
import it.unimi.dsi.fastutil.longs.LongArrayList;
import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.Clearable;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.level.chunk.LevelChunkSection;
import net.minecraft.world.level.levelgen.structure.BoundingBox;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Block work spread over server ticks (25 ms each) so even a 1024×256×1024 structure never freezes
 * the server: a list of steps, each walking a box section by section or the build ops block by block
 * from where the last tick stopped. Server thread only — see {@link #tick}.
 */
final class BuildJob {
    /** time per tick spent on block work */
    private static final long BUDGET_NANOS = 25_000_000L;
    private static final long PROGRESS_EVERY_NANOS = 5_000_000_000L;
    private static final List<BuildJob> RUNNING = new ArrayList<>();

    /** One small piece of work per call (a block, or a 16³ section): returns false once it's done. */
    interface Step {
        boolean next();
        /** blocks this step walks in total, and how many so far (for the progress message) */
        long total();
        long done();
    }

    private final ServerLevel level;
    private final List<Step> steps;
    private final Consumer<String> progress;
    private final Runnable done;
    private final Consumer<RuntimeException> failed;
    private final long total;
    private int current;
    private long lastProgress = System.nanoTime();

    private BuildJob(ServerLevel level, List<Step> steps, Consumer<String> progress, Runnable done, Consumer<RuntimeException> failed) {
        this.level = level;
        this.steps = steps;
        this.progress = progress;
        this.done = done;
        this.failed = failed;
        this.total = Math.max(1, steps.stream().mapToLong(Step::total).sum());
    }

    /** `done` runs when all steps finished; `failed` instead when one threw (the job stops there). */
    static void start(ServerLevel level, List<Step> steps, Consumer<String> progress, Runnable done, Consumer<RuntimeException> failed) {
        RUNNING.add(new BuildJob(level, steps, progress, done, failed));
    }

    /** Called at the end of every server tick. */
    static void tick(MinecraftServer server) {
        if (RUNNING.isEmpty()) return;
        long deadline = System.nanoTime() + BUDGET_NANOS;
        // Round robin: the oldest job first, the rest get what's left of the budget.
        for (BuildJob job : List.copyOf(RUNNING)) {
            if (System.nanoTime() >= deadline) break;
            boolean finished;
            try {
                finished = job.run(deadline);
            } catch (RuntimeException e) {
                RUNNING.remove(job);
                CompanionMod.LOGGER.error("Build job failed", e);
                job.failed.accept(e);
                continue;
            }
            if (finished) {
                RUNNING.remove(job);
                job.done.run();
            }
        }
    }

    /** Works until the deadline; true when all steps are done. */
    private boolean run(long deadline) {
        while (current < steps.size()) {
            if (!steps.get(current).next()) current++;
            else if (System.nanoTime() >= deadline) {
                report();
                return false;
            }
        }
        return true;
    }

    private void report() {
        long now = System.nanoTime();
        if (now - lastProgress < PROGRESS_EVERY_NANOS) return;
        lastProgress = now;
        long walked = steps.stream().mapToLong(Step::done).sum();
        progress.accept("Building … " + Math.min(99, walked * 100 / total) + "%");
    }

    // ── steps ────────────────────────────────────────────────────────────────

    /**
     * Walks a box one chunk section (16³) per call, chunk column by chunk column so each chunk is
     * loaded once; sections that are all air are skipped without looking at their blocks.
     */
    abstract static class SectionStep implements Step {
        final ServerLevel level;
        final BoundingBox box;
        private final int minCx, maxCx, minCz, maxCz, minSy, maxSy;
        private int cx, cz, sy;
        private long done;
        private LevelChunk chunk;
        private final BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();

        SectionStep(ServerLevel level, BoundingBox box) {
            this.level = level;
            this.box = box;
            minCx = box.minX() >> 4; maxCx = box.maxX() >> 4;
            minCz = box.minZ() >> 4; maxCz = box.maxZ() >> 4;
            minSy = box.minY() >> 4; maxSy = box.maxY() >> 4;
            cx = minCx; cz = minCz; sy = minSy;
        }

        @Override public long total() { return (long) box.getXSpan() * box.getYSpan() * box.getZSpan(); }
        @Override public long done() { return done; }

        @Override public boolean next() {
            if (cz > maxCz) return false;
            if (chunk == null) chunk = level.getChunk(cx, cz);
            int x0 = Math.max(box.minX(), cx << 4), x1 = Math.min(box.maxX(), (cx << 4) + 15);
            int y0 = Math.max(box.minY(), sy << 4), y1 = Math.min(box.maxY(), (sy << 4) + 15);
            int z0 = Math.max(box.minZ(), cz << 4), z1 = Math.min(box.maxZ(), (cz << 4) + 15);
            int index = level.getSectionIndexFromSectionY(sy);
            LevelChunkSection section = index >= 0 && index < chunk.getSections().length ? chunk.getSection(index) : null;
            if (section != null && !section.hasOnlyAir()) {
                for (int y = y0; y <= y1; y++) for (int z = z0; z <= z1; z++) for (int x = x0; x <= x1; x++) {
                    BlockState state = section.getBlockState(x & 15, y & 15, z & 15);
                    if (!state.isAir()) visit(pos.set(x, y, z), state);
                }
            }
            done += (long) (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
            if (++sy > maxSy) {
                sy = minSy;
                chunk = null;
                if (++cx > maxCx) { cx = minCx; cz++; }
            }
            return true;
        }

        /** a non-air block in the box */
        abstract void visit(BlockPos.MutableBlockPos pos, BlockState state);
    }

    /** Block states that were in a box, for undo (global state ids — no block-entity contents). */
    static final class Snapshot {
        final LongArrayList positions = new LongArrayList();
        final IntArrayList states = new IntArrayList();
        /** stops recording past this many blocks (≈ 12 bytes each) */
        static final int LIMIT = 16_000_000;
        boolean overflow;

        void add(BlockPos pos, BlockState state) {
            if (positions.size() >= LIMIT) { overflow = true; return; }
            positions.add(pos.asLong());
            states.add(Block.getId(state));
        }
    }

    /** Empties a box to air (containers first so nothing drops), optionally recording what was there. */
    static Step clear(ServerLevel level, BoundingBox box, Snapshot record) {
        return new SectionStep(level, box) {
            @Override void visit(BlockPos.MutableBlockPos pos, BlockState state) {
                if (record != null) record.add(pos, state);
                if (level.getBlockEntity(pos) instanceof Clearable c) c.clearContent();
                level.setBlock(pos, Blocks.AIR.defaultBlockState(), Compat.CLEAR_FLAGS);
            }
        };
    }

    /** Fixes connections (fences, panes, stairs …) the way structure placement does. */
    static Step updateShapes(ServerLevel level, BoundingBox box) {
        return new SectionStep(level, box) {
            @Override void visit(BlockPos.MutableBlockPos pos, BlockState state) {
                BlockState shaped = Block.updateFromNeighbourShapes(state, level, pos);
                if (shaped != state) level.setBlock(pos, shaped, Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE);
            }
        };
    }

    /** Puts a snapshot back. */
    static Step restore(ServerLevel level, Snapshot snapshot) {
        return new Step() {
            private int i;
            private final BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();

            @Override public long total() { return snapshot.positions.size(); }
            @Override public long done() { return i; }

            @Override public boolean next() {
                if (i >= snapshot.positions.size()) return false;
                pos.set(snapshot.positions.getLong(i));
                level.setBlock(pos, Block.stateById(snapshot.states.getInt(i)), Block.UPDATE_CLIENTS);
                i++;
                return true;
            }
        };
    }
}
