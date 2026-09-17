package sheepfromheaven.screenspec.runtime.effect;

/** One effect instance within a {@link PotionSpec} — mirrors the webapp's PotionEffectEntry. */
public final class PotionEffectEntry {
    /** A vanilla effect id (e.g. {@code "minecraft:speed"}) or a project {@link EffectSpec}'s bare id. */
    public String effectId;
    public double durationSeconds = 30;
    public int amplifier;
}
