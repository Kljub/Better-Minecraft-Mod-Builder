package sheepfromheaven.screenspec.runtime.item;

import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.component.ItemAttributeModifiers;
import net.minecraft.world.item.equipment.Equippable;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;
import sheepfromheaven.screenspec.runtime.attribute.AttributeModifierSpec;
import sheepfromheaven.screenspec.runtime.attribute.AttributeResolver;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds and registers vanilla {@link Item}s from {@link ItemSpec}s. Internal — called only by
 * {@link sheepfromheaven.screenspec.runtime.ModContent} (in turn wired up automatically per loaded
 * mod, see {@code ScreenSpecMod}); a mod author using the MC Screen Designer web tool never calls
 * this directly.
 *
 * <p><b>Version note:</b> this targets NeoForge {@code 26.2.0.53-beta} / Minecraft {@code 26.2}'s
 * data-component-driven item model (armor via the {@code Equippable} component rather than an
 * {@code ArmorItem} subclass, attribute modifiers via {@code DataComponents.ATTRIBUTE_MODIFIERS}).
 * If a future MC/NeoForge bump renames these classes, this is the one place to update — same
 * isolation idea as {@code DrawContext} for the rendering side.
 */
public final class ItemSpecs {
    private ItemSpecs() {}

    public static DeferredRegister.Items createRegister(String modId) {
        return DeferredRegister.createItems(modId);
    }

    /**
     * Registers one {@link Item} per spec and returns them keyed by {@link ItemSpec#id}.
     * {@code customAttributes} resolves an {@link AttributeModifierSpec#attribute} that isn't one
     * of the curated vanilla keys against the project's own {@code CustomAttributeSpec}s (see
     * {@link sheepfromheaven.screenspec.runtime.attribute.CustomAttributeSpecs}) — pass an empty
     * map if the project defines none.
     */
    public static Map<String, DeferredItem<Item>> registerAll(
            DeferredRegister.Items register, List<ItemSpec> specs, String modId, Map<String, Holder<Attribute>> customAttributes) {
        Map<String, DeferredItem<Item>> result = new LinkedHashMap<>();
        for (ItemSpec spec : specs) {
            Item.Properties props = buildProperties(spec, modId, customAttributes);
            DeferredItem<Item> item = register.register(spec.id, () -> new Item(props));
            result.put(spec.id, item);
        }
        return result;
    }

    private static Item.Properties buildProperties(ItemSpec spec, String modId, Map<String, Holder<Attribute>> customAttributes) {
        Item.Properties props = new Item.Properties()
            .stacksTo(spec.durability > 0 ? 1 : Math.max(1, spec.stackSize))
            .rarity(resolveRarity(spec.rarity));
        if (spec.fireResistant) props = props.fireResistant();
        if (spec.durability > 0) props = props.durability(spec.durability);

        if ("food".equals(spec.category)) {
            FoodProperties.Builder food = new FoodProperties.Builder()
                .nutrition(spec.nutrition)
                .saturationModifier((float) spec.saturation);
            if (spec.alwaysEdible) food = food.alwaysEdible();
            props = props.food(food.build());
        }

        if ("armor".equals(spec.category) && spec.armorSlot != null) {
            props = props.component(DataComponents.EQUIPPABLE, Equippable.builder(resolveEquipmentSlot(spec.armorSlot)).build());
        }

        if (spec.attributes != null && !spec.attributes.isEmpty()) {
            ItemAttributeModifiers.Builder modifiers = ItemAttributeModifiers.builder();
            int i = 0;
            for (AttributeModifierSpec attr : spec.attributes) {
                Identifier id = Identifier.fromNamespaceAndPath(modId, spec.id + "_" + (i++));
                modifiers.add(
                    AttributeResolver.resolveAttribute(attr.attribute, customAttributes),
                    new AttributeModifier(id, attr.amount, AttributeResolver.resolveOperation(attr.operation)),
                    AttributeResolver.resolveSlotGroup(attr.slot)
                );
            }
            props = props.component(DataComponents.ATTRIBUTE_MODIFIERS, modifiers.build());
        }

        return props;
    }

    private static Rarity resolveRarity(String key) {
        return switch (key == null ? "common" : key) {
            case "uncommon" -> Rarity.UNCOMMON;
            case "rare" -> Rarity.RARE;
            case "epic" -> Rarity.EPIC;
            default -> Rarity.COMMON;
        };
    }

    private static EquipmentSlot resolveEquipmentSlot(String armorSlot) {
        return switch (armorSlot) {
            case "helmet" -> EquipmentSlot.HEAD;
            case "leggings" -> EquipmentSlot.LEGS;
            case "boots" -> EquipmentSlot.FEET;
            default -> EquipmentSlot.CHEST;
        };
    }

}
