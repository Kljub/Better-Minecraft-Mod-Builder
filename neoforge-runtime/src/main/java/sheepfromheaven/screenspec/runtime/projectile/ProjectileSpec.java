package sheepfromheaven.screenspec.runtime.projectile;

/**
 * Mirrors the "projectile" element exported by the MC Screen Designer web tool (see {@code
 * webapp/lib/elements/modKinds.ts}). Field names and JSON shape must stay in sync with that file.
 */
public final class ProjectileSpec {
    /** registry path of both the projectile entity and the throwable item that fires it */
    public String id;
    /** damage dealt to the entity it hits (half-hearts) */
    public float damage = 2;
    /** throw speed (snowball 1.5) */
    public float speed = 1.5F;
    /** random spread (snowball 1.0, 0 = perfectly accurate) */
    public float inaccuracy = 1;
    /** downward pull per tick (snowball 0.03, 0 = flies straight) */
    public float gravity = 0.03F;
    /** seconds the hit entity burns; 0 = none */
    public int fireSeconds = 0;
    /** explosion power on impact (TNT 4); 0 = none */
    public float explosionPower = 0;
    /** explosion breaks blocks (respects the mobGriefing game rule) */
    public boolean explosionBreaksBlocks = false;
    /** effect given to a living entity it hits, e.g. {@code "minecraft:slowness"}; empty = none */
    public String effect = "";
    public int effectSeconds = 5;
    /** 0 = level I */
    public int effectAmplifier = 0;
    /** ticks before the item can be thrown again; 0 = none */
    public int cooldown = 0;
    public int stackSize = 16;
    /** drawn glowing (full brightness) */
    public boolean glowing = false;
}
