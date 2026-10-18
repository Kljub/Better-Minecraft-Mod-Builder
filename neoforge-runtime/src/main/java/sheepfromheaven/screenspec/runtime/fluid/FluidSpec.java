package sheepfromheaven.screenspec.runtime.fluid;

/**
 * Mirrors the "fluid" element exported by the MC Screen Designer web tool (see {@code
 * webapp/lib/elements/modKinds.ts}). Field names and JSON shape must stay in sync with that file.
 */
public final class FluidSpec {
    /** registry path of the source fluid, its LiquidBlock and FluidType; flowing fluid is
     * {@code flowing_<id>}, the bucket {@code <id>_bucket} */
    public String id;
    /** {@code "water" | "lava"} — which vanilla still/flow textures are tinted with {@link #color} */
    public String base = "water";
    /** hex RGB tint, e.g. {@code "#33cc55"} */
    public String color = "#3f76e4";
    public int lightLevel = 0;
    /** 1000 = water; negative = lighter than air (gas) */
    public int density = 1000;
    /** 1000 = water, 6000 = lava */
    public int viscosity = 1000;
    /** Kelvin; 300 = water, 1300 = lava */
    public int temperature = 300;
    public boolean canSwim = true;
    public boolean canDrown = true;
    public boolean canExtinguish = true;
    /** two sources next to each other make a new one, like water */
    public boolean canConvertToSource = false;
    public boolean supportsBoating = false;
    /** ticks between flow updates; water 5, lava 30 */
    public int tickRate = 5;
    /** how far it spreads: 1 = water (8 blocks), 2 = lava in the Overworld (4 blocks) */
    public int levelDecreasePerBlock = 1;
    public boolean bucket = true;
}
