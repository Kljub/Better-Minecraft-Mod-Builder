package sheepfromheaven.screenspec.runtime.attribute;

/**
 * Mirrors the {@code CustomAttributeSpec} shape exported by the MC Screen Designer web tool (see
 * {@code webapp/lib/types.ts}) — a project-defined attribute (beyond the curated vanilla set every
 * Item's Attributes list already offers), global to the project: define once, reference from any
 * item's attribute modifiers, and/or attach as a default stat on living entities/players.
 */
public final class CustomAttributeSpec {
    /** registry name, e.g. "mana" */
    public String id;
    public String displayName;
    public double defaultBase;
    public double min;
    public double max;
    /** "positive" | "neutral" | "negative" — tooltip color when shown on an item, matches
     * vanilla's {@code Attribute.Sentiment}. */
    public String sentiment = "neutral";
    /** Adds this attribute (at {@link #defaultBase}) to every living entity type. */
    public boolean addToAllLiving;
    /** Adds this attribute (at {@link #defaultBase}) to the player specifically. Independent of
     * {@link #addToAllLiving} — set both, either, or neither. */
    public boolean addToPlayers;
}
