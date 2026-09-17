package sheepfromheaven.screenspec.runtime.armor;

import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.TagKey;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.equipment.ArmorMaterial;
import net.minecraft.world.item.equipment.ArmorType;
import net.minecraft.world.item.equipment.EquipmentAsset;
import net.minecraft.world.item.equipment.EquipmentAssets;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds and registers vanilla armor {@link Item}s (4 pieces per {@link ArmorSpec}) via a real
 * {@link ArmorMaterial}. Internal — called only by {@link sheepfromheaven.screenspec.runtime.ModContent}
 * (wired up automatically per loaded mod, see {@code ScreenSpecMod}); a mod author using the MC
 * Screen Designer web tool never calls this directly.
 *
 * <p><b>Version note:</b> unlike every other content type, armor materials have no datapack
 * registry in this MC version — {@code ArmorMaterial} is a plain record with no codec, so it must
 * be built here in Java from the spec's numbers. Signatures verified via {@code javap} against the
 * actual game jar — see the plan file's research notes. Repair uses a real exported tag file
 * ({@code data/<modId>/tags/item/<id>_repair.json}, written by the webapp's export bundle) rather
 * than a single-item {@code Item.Properties.repairable(Item)}, so an anvil repair actually works
 * without hand-registering anything extra here. The equip sound is always vanilla's generic one
 * ({@link SoundEvents#ARMOR_EQUIP_GENERIC}) — not yet exposed as a webapp field.
 */
public final class ArmorSpecs {
    private ArmorSpecs() {}

    public static DeferredRegister.Items createRegister(String modId) {
        return DeferredRegister.createItems(modId);
    }

    /** Registers 4 items per spec (helmet/chestplate/leggings/boots) and returns them keyed by
     * {@code "<spec.id>_<piece>"} (e.g. {@code "ruby_helmet"}). */
    public static Map<String, DeferredItem<Item>> registerAll(DeferredRegister.Items register, List<ArmorSpec> specs, String modId) {
        Map<String, DeferredItem<Item>> result = new LinkedHashMap<>();
        for (ArmorSpec spec : specs) {
            ArmorMaterial material = buildMaterial(spec, modId);
            Rarity rarity = resolveRarity(spec.rarity);
            registerPiece(register, result, spec, material, ArmorType.HELMET, "helmet", rarity);
            registerPiece(register, result, spec, material, ArmorType.CHESTPLATE, "chestplate", rarity);
            registerPiece(register, result, spec, material, ArmorType.LEGGINGS, "leggings", rarity);
            registerPiece(register, result, spec, material, ArmorType.BOOTS, "boots", rarity);
        }
        return result;
    }

    /** {@code "<spec.id>_<piece>"} — the exact key {@link #registerAll} uses, so callers (e.g.
     * {@code ModContent}'s creative-tab wiring) can look a specific piece up without re-deriving it. */
    public static String pieceId(ArmorSpec spec, String piece) {
        return spec.id + "_" + piece;
    }

    private static void registerPiece(
            DeferredRegister.Items register, Map<String, DeferredItem<Item>> result,
            ArmorSpec spec, ArmorMaterial material, ArmorType type, String piece, Rarity rarity) {
        String id = pieceId(spec, piece);
        DeferredItem<Item> item = register.register(id, () ->
            new Item(new Item.Properties().humanoidArmor(material, type).rarity(rarity)));
        result.put(id, item);
    }

    private static ArmorMaterial buildMaterial(ArmorSpec spec, String modId) {
        Map<ArmorType, Integer> defense = new EnumMap<>(ArmorType.class);
        defense.put(ArmorType.HELMET, spec.defenseHelmet);
        defense.put(ArmorType.CHESTPLATE, spec.defenseChestplate);
        defense.put(ArmorType.LEGGINGS, spec.defenseLeggings);
        defense.put(ArmorType.BOOTS, spec.defenseBoots);

        TagKey<Item> repairIngredient = TagKey.create(Registries.ITEM, Identifier.fromNamespaceAndPath(modId, spec.id + "_repair"));
        ResourceKey<EquipmentAsset> assetId = ResourceKey.create(EquipmentAssets.ROOT_ID, Identifier.fromNamespaceAndPath(modId, spec.id));

        return new ArmorMaterial(
            spec.durability,
            defense,
            spec.enchantmentValue,
            SoundEvents.ARMOR_EQUIP_GENERIC,
            spec.toughness,
            spec.knockbackResistance,
            repairIngredient,
            assetId
        );
    }

    private static Rarity resolveRarity(String key) {
        return switch (key == null ? "common" : key) {
            case "uncommon" -> Rarity.UNCOMMON;
            case "rare" -> Rarity.RARE;
            case "epic" -> Rarity.EPIC;
            default -> Rarity.COMMON;
        };
    }
}
