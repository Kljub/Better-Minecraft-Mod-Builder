package sheepfromheaven.screenspec.runtime.armor;

/**
 * Mirrors the {@code ArmorSpec} shape exported by the MC Screen Designer web tool (see {@code
 * webapp/lib/types.ts}). Field names and JSON shape must stay in sync with that file.
 *
 * <p>Unlike every other content type this tool exports, a real armor material has no datapack
 * registry in this MC version — {@code ArmorMaterial} is a plain Java record with no codec — so
 * this is the one spec that needs actual Java on the runtime side (see {@link ArmorSpecs}).
 */
public final class ArmorSpec {
    public String id;
    public String modId;
    public String displayName;
    public String iconHelmet;
    public String iconChestplate;
    public String iconLeggings;
    public String iconBoots;
    /** Pack texture key for the worn (3D) body texture — informational here, the export bundle
     * already copies it to the equipment-asset texture paths this spec's generated {@code
     * assets/<modId>/equipment/<id>.json} references. */
    public String equipmentTexture;
    /** Base durability unit — actual max damage is {@code durability * ArmorType.unitDurability}. */
    public int durability = 15;
    public int defenseHelmet;
    public int defenseChestplate;
    public int defenseLeggings;
    public int defenseBoots;
    public float toughness;
    public float knockbackResistance;
    public int enchantmentValue = 9;
    /** Vanilla item id (e.g. {@code "minecraft:iron_ingot"}) — becomes this armor's anvil repair tag. */
    public String repairItem = "minecraft:iron_ingot";
    public String creativeTab = "custom";
    /** {@code "common" | "uncommon" | "rare" | "epic"} */
    public String rarity = "common";
}
