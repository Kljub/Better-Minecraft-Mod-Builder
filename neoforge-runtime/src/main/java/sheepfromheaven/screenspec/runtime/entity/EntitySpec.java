package sheepfromheaven.screenspec.runtime.entity;

/**
 * Mirrors the {@code EntitySpec} shape exported by the MC Screen Designer web tool (see {@code
 * webapp/lib/types.ts}). Field names and JSON shape must stay in sync with that file.
 *
 * <p>There's no code-gen step in this runtime, so a custom mob isn't a bespoke Java class per
 * spec — one shared entity/renderer class pair backs every spec that picks a given {@link
 * #bodyTemplate} (see {@link BodyTemplate}), each instantiated with its own {@code EntityType},
 * attributes, hitbox and texture. AI goals are inherited wholesale from that vanilla template — a
 * separate AI system is being developed outside this tool and hooks in later by hand (see the
 * commented extension seam in each Template&lt;Template&gt;Entity.java). Natural biome spawning
 * isn't wired either; v1 mobs are spawn-egg/{@code /summon} only. See {@link EntitySpecs}.
 */
public final class EntitySpec {
    public String id;
    public String modId;
    public String displayName;
    /** {@code "zombie" | "skeleton" | "spider" | "creeper"} — see {@link BodyTemplate}. */
    public String bodyTemplate = "zombie";
    /** Pack texture key — must match the chosen template's vanilla skin UV layout. */
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
}
