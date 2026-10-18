package sheepfromheaven.screenspec.runtime.trim;

/**
 * Mirrors the "armorTrim" element exported by the MC Screen Designer web tool (see {@code
 * webapp/lib/elements/modKinds.ts}). Field names and JSON shape must stay in sync with that file.
 */
public final class ArmorTrimSpec {
    /** trim pattern id; its smithing template item is {@code <id>_armor_trim_smithing_template} */
    public String id;
}
