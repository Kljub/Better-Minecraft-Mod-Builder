package sheepfromheaven.screenspec.runtime.entity;

import java.util.List;

/**
 * Mirrors the {@code EntitySpec} shape exported by the MC Screen Designer web tool (see {@code
 * webapp/lib/types.ts}). Field names and JSON shape must stay in sync with that file.
 *
 * <p>There's no code-gen step in this runtime, so a custom mob isn't a bespoke Java class per
 * spec — one shared entity/renderer class pair backs every spec that picks a given {@link
 * #bodyTemplate} (see {@link EntitySpecs}'s internal {@code Template} dispatch), each instantiated
 * with its own {@code EntityType}, attributes, hitbox and texture. AI goals are inherited wholesale
 * from that vanilla template — a separate AI system is being developed outside this tool and hooks
 * in later by hand (see the commented extension seam in each Template&lt;Template&gt;Entity.java).
 * Natural biome spawning isn't wired either; v1 mobs are spawn-egg/{@code /summon} only.
 *
 * <p>{@link #useCustomModel} swaps only the *rendering* — {@link #bodyTemplate} still decides
 * AI/physics either way (see {@link EntitySpecs#registerRenderers}).
 */
public final class EntitySpec {
    public String id;
    public String modId;
    public String displayName;
    /** {@code "zombie" | "skeleton" | "spider" | "creeper"} */
    public String bodyTemplate = "zombie";
    /** Pack texture key — must match the chosen template's (or, with {@link #useCustomModel},
     * {@link #geometry}'s) UV layout. */
    public String texture;
    /** {@code "monster" | "creature" | "ambient" | "misc"} */
    public String mobCategory = "monster";
    public double maxHealth = 20;
    public double movementSpeed = 0.23;
    public double attackDamage = 3;
    public float hitboxWidth = 0.6f;
    public float hitboxHeight = 1.95f;
    public boolean fireImmune;
    /** "#RRGGBB" — informational only here, only drives the webapp-generated spawn-egg icon PNG;
     * this MC version's SpawnEggItem has no runtime color-tint mechanism any more. */
    public String spawnEggPrimaryColor;
    public String spawnEggSecondaryColor;
    public String creativeTab = "SPAWN_EGGS";
    /** true swaps the in-game model+renderer from the vanilla {@link #bodyTemplate}'s own to one
     * dynamically built from {@link #geometry} at mod-init time (see
     * {@link EntitySpecs#buildLayerDefinition}) — no code-gen, plain builder calls in a loop. */
    public boolean useCustomModel;
    public Geometry geometry;

    /** A cuboid-model manifest — Minecraft's real "box UV" entity-model shape (same convention
     * Blockbench's Java/Bedrock box-UV mode uses), built dynamically rather than compiled, since
     * this runtime has no code-gen step. */
    public static final class Geometry {
        /** Must match the referenced {@link EntitySpec#texture} PNG's actual pixel size. */
        public int textureWidth = 64;
        public int textureHeight = 64;
        public List<Cuboid> cuboids;
    }

    /** One box: `position` is the min corner, `size` is width/height/depth, both in 1/16-block
     * model units; rotates around its own geometric center (no separate pivot). `uv` is the box's
     * `texOffs(u,v)` origin — the 6 faces auto-layout from there via Minecraft's fixed cross
     * pattern (verified in the decompiled {@code ModelPart.Cube} constructor), not per-face UV. */
    public static final class Cuboid {
        /** Minecraft part name — must be unique per entity. */
        public String name;
        public float[] position = { 0, 0, 0 };
        public float[] size = { 1, 1, 1 };
        /** degrees */
        public float[] rotation = { 0, 0, 0 };
        public int[] uv = { 0, 0 };
        public boolean mirror;
    }
}
