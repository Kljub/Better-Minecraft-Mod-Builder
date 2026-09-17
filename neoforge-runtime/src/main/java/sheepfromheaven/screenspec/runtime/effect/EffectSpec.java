package sheepfromheaven.screenspec.runtime.effect;

import sheepfromheaven.screenspec.runtime.attribute.AttributeModifierSpec;

import java.util.Collections;
import java.util.List;

/**
 * Mirrors the {@code EffectSpec} shape exported by the MC Screen Designer web tool (see {@code
 * webapp/lib/types.ts}). Field names and JSON shape must stay in sync with that file.
 */
public final class EffectSpec {
    public String id;
    public String modId;
    public String displayName;
    /** {@code "beneficial" | "harmful" | "neutral"} */
    public String category = "neutral";
    /** hex color, e.g. {@code "#3388ff"} — particle/potion-swirl color. */
    public String color = "#a0a0a0";
    /** Pack texture key — informational here, the export bundle already copies it to
     * {@code assets/<modId>/textures/mob_effect/<id>.png}, the exact convention Minecraft
     * resolves an effect's status icon from automatically. */
    public String icon;
    /** Applied once immediately instead of ticking for a duration — real
     * {@code MobEffect#isInstantaneous()} override. */
    public boolean isInstant;
    /** A curated vanilla particle id (e.g. {@code "minecraft:witch"}), or empty/null for the
     * default color-tinted swirl. See {@link EffectSpecs} for the resolved id-to-constant map. */
    public String particle;
    /** A vanilla sound id (e.g. {@code "minecraft:entity.player.levelup"}) played once when the
     * effect is added, or empty/null for none — real {@code MobEffect#withSoundOnAdded}. */
    public String soundOnAdded;
    /** Stat modifiers applied while the effect is active — same declarative mechanism as
     * {@code ItemSpec.attributes}, scaled per amplifier level by vanilla automatically. */
    public List<AttributeModifierSpec> attributes = Collections.emptyList();
}
