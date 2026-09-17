package sheepfromheaven.screenspec.runtime.item;

import sheepfromheaven.screenspec.runtime.attribute.AttributeModifierSpec;

import java.util.Collections;
import java.util.List;

/**
 * Mirrors the {@code ItemSpec} shape exported by the MC Screen Designer web tool (see {@code
 * webapp/lib/types.ts}). Field names and JSON shape must stay in sync with that file.
 */
public final class ItemSpec {
    public String id;
    public String modId;
    public String displayName;
    /**
     * The pack texture key the webapp used (e.g. {@code "item/ruby_sword.png"}) — informational
     * only here. The actual in-game texture/model come from the generated resourcepack-shape
     * files the export bundle writes alongside this manifest ({@code models/item/<id>.json} etc,
     * see {@code webapp/lib/exportBundle.ts}); this loader doesn't touch them.
     */
    public String texture;
    /** {@code "simple" | "food" | "armor"} */
    public String category = "simple";
    public int stackSize = 64;
    /** {@code "common" | "uncommon" | "rare" | "epic"} */
    public String rarity = "common";
    public boolean fireResistant;
    /** {@code > 0} makes the item damageable (maxDamage). */
    public int durability;
    public int nutrition;
    public double saturation;
    public boolean alwaysEdible;
    /** Only meaningful for {@code category == "armor"}: {@code "helmet" | "chestplate" | "leggings" | "boots"}. */
    public String armorSlot;
    public List<AttributeModifierSpec> attributes = Collections.emptyList();
    public String creativeTab = "custom";
}
