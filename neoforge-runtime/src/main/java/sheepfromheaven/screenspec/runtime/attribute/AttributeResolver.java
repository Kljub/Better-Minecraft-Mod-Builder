package sheepfromheaven.screenspec.runtime.attribute;

import net.minecraft.core.Holder;
import net.minecraft.world.entity.EquipmentSlotGroup;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;

import java.util.Map;

/**
 * Resolves an {@link AttributeModifierSpec} to real vanilla types — shared by item
 * (ItemAttributeModifiers) and effect (MobEffect.addAttributeModifier) attribute-modifier
 * building, so both interpret {@code attribute}/{@code operation}/{@code slot} identically.
 */
public final class AttributeResolver {
    private AttributeResolver() {}

    /** Resolves one of the curated vanilla keys, or a project-defined {@code CustomAttributeSpec}
     * id (via the {@code customAttributes} map built by {@code CustomAttributeSpecs#registerAll}). */
    public static Holder<Attribute> resolveAttribute(String key, Map<String, Holder<Attribute>> customAttributes) {
        Holder<Attribute> custom = customAttributes.get(key);
        if (custom != null) return custom;
        return switch (key == null ? "" : key) {
            case "generic.max_health" -> Attributes.MAX_HEALTH;
            case "generic.attack_damage" -> Attributes.ATTACK_DAMAGE;
            case "generic.attack_speed" -> Attributes.ATTACK_SPEED;
            case "generic.armor" -> Attributes.ARMOR;
            case "generic.armor_toughness" -> Attributes.ARMOR_TOUGHNESS;
            case "generic.movement_speed" -> Attributes.MOVEMENT_SPEED;
            case "generic.knockback_resistance" -> Attributes.KNOCKBACK_RESISTANCE;
            case "generic.luck" -> Attributes.LUCK;
            default -> throw new IllegalArgumentException(
                "Unknown attribute: " + key + " (not a vanilla key or a project-defined custom attribute)");
        };
    }

    public static AttributeModifier.Operation resolveOperation(String op) {
        return switch (op == null ? "add_value" : op) {
            case "add_multiplied_base" -> AttributeModifier.Operation.ADD_MULTIPLIED_BASE;
            case "add_multiplied_total" -> AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL;
            default -> AttributeModifier.Operation.ADD_VALUE;
        };
    }

    public static EquipmentSlotGroup resolveSlotGroup(String slot) {
        return switch (slot == null ? "any" : slot) {
            case "mainhand" -> EquipmentSlotGroup.MAINHAND;
            case "offhand" -> EquipmentSlotGroup.OFFHAND;
            case "hand" -> EquipmentSlotGroup.HAND;
            case "head" -> EquipmentSlotGroup.HEAD;
            case "chest" -> EquipmentSlotGroup.CHEST;
            case "legs" -> EquipmentSlotGroup.LEGS;
            case "feet" -> EquipmentSlotGroup.FEET;
            case "armor" -> EquipmentSlotGroup.ARMOR;
            case "body" -> EquipmentSlotGroup.BODY;
            default -> EquipmentSlotGroup.ANY;
        };
    }
}
