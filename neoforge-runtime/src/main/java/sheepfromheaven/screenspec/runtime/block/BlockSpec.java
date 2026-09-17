package sheepfromheaven.screenspec.runtime.block;

/**
 * Mirrors the {@code BlockSpec} shape exported by the MC Screen Designer web tool (see {@code
 * webapp/lib/types.ts}). Field names and JSON shape must stay in sync with that file.
 */
public final class BlockSpec {
    public String id;
    public String modId;
    public String displayName;
    /** Single texture applied to all 6 faces (cube_all) — informational only here, see {@link
     * sheepfromheaven.screenspec.runtime.item.ItemSpec#texture}'s javadoc for why. */
    public String texture;
    public double hardness = 1.5;
    public double resistance = 6;
    public boolean requiresTool;
    /** Light level emitted, 0-15. */
    public int luminance;
    /** {@code "stone" | "wood" | "metal" | "gravel" | "grass" | "glass" | "wool" | "sand"} */
    public String soundType = "stone";
    /** Whether to also register a BlockItem so the block can be held/placed. */
    public boolean hasItem = true;
    public String creativeTab = "custom";
}
