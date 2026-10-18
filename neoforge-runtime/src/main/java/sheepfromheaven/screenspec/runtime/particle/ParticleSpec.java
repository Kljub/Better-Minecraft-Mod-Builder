package sheepfromheaven.screenspec.runtime.particle;

/**
 * Mirrors the "particle" element exported by the MC Screen Designer web tool (see {@code
 * webapp/lib/elements/modKinds.ts}). Field names and JSON shape must stay in sync with that file.
 */
public final class ParticleSpec {
    /** registry path — spawned with {@code /particle <modid>:<id>} */
    public String id;
    /** ticks the particle lives (20 = 1 s) */
    public int lifetime = 20;
    /** random extra ticks added per particle, 0..lifetimeVariance */
    public int lifetimeVariance = 0;
    /** downward acceleration per tick; negative floats up */
    public float gravity = 0;
    /** size multiplier (1 = vanilla default ~0.2 blocks) */
    public float scale = 1;
    /** velocity kept per tick (vanilla default 0.98) */
    public float friction = 0.98F;
    /** collides with blocks */
    public boolean physics = true;
    /** ignores light — glows in the dark */
    public boolean emissive = false;
    /** semi-transparent texture pixels allowed */
    public boolean translucent = false;
    /** play the texture frames in order over its lifetime instead of a random frame */
    public boolean animated = false;
    /** fades out over its last quarter */
    public boolean fadeOut = false;
    /** hex RGB multiplied onto the texture; "#ffffff" = unchanged */
    public String tint = "#ffffff";
}
