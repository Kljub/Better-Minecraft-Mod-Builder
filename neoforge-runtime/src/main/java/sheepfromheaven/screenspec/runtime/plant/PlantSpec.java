package sheepfromheaven.screenspec.runtime.plant;

/**
 * Mirrors the "plant" element exported by the MC Screen Designer web tool (see {@code
 * webapp/lib/elements/modKinds.ts}). Field names and JSON shape must stay in sync with that file.
 */
public final class PlantSpec {
    /** registry path of the plant block + its item; the potted variant is {@code potted_<id>} */
    public String id;
    /** {@code "flower" | "tall_flower"} */
    public String type = "flower";
    /** flower only: effect a suspicious stew made from it gives, e.g. {@code "minecraft:night_vision"}; empty = saturation */
    public String stewEffect = "";
    public float stewSeconds = 5;
    /** flower only: also register {@code potted_<id>} and let it go into a flower pot */
    public boolean potted = true;
    public int lightLevel = 0;
}
