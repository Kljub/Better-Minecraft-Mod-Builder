package sheepfromheaven.screenspec.runtime.attribute;

import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.RangedAttribute;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.event.entity.EntityAttributeModificationEvent;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds and registers custom {@link Attribute}s from {@link CustomAttributeSpec}s, and wires up
 * their "add to all living things" / "add to players" defaults. Internal — called only by {@link
 * sheepfromheaven.screenspec.runtime.ModContent}; a mod author using the MC Screen Designer web
 * tool never calls this directly.
 */
public final class CustomAttributeSpecs {
    private CustomAttributeSpecs() {}

    public static DeferredRegister<Attribute> createRegister(String modId) {
        return DeferredRegister.create(Registries.ATTRIBUTE, modId);
    }

    /** Registers one {@link RangedAttribute} per spec and returns them keyed by {@link CustomAttributeSpec#id}. */
    public static Map<String, Holder<Attribute>> registerAll(DeferredRegister<Attribute> register, List<CustomAttributeSpec> specs, String modId) {
        Map<String, Holder<Attribute>> result = new LinkedHashMap<>();
        for (CustomAttributeSpec spec : specs) {
            String descriptionId = "attribute.name." + modId + "." + spec.id;
            Holder<Attribute> holder = register.register(spec.id, () ->
                new RangedAttribute(descriptionId, spec.defaultBase, spec.min, spec.max)
                    .setSentiment(resolveSentiment(spec.sentiment)));
            result.put(spec.id, holder);
        }
        return result;
    }

    /**
     * Adds each spec's attribute as a default stat where requested (all living entity types
     * and/or the player specifically). Must be called with the same {@code modBus} the register
     * above was subscribed to, and only if {@code specs} is non-empty.
     */
    public static void registerDefaults(IEventBus modBus, List<CustomAttributeSpec> specs, Map<String, Holder<Attribute>> registered) {
        modBus.addListener(EntityAttributeModificationEvent.class, event -> {
            for (CustomAttributeSpec spec : specs) {
                Holder<Attribute> holder = registered.get(spec.id);
                if (holder == null) continue;
                if (spec.addToAllLiving) {
                    for (EntityType<? extends LivingEntity> type : event.getTypes()) {
                        if (!event.has(type, holder)) event.add(type, holder, spec.defaultBase);
                    }
                }
                if (spec.addToPlayers && !event.has(EntityTypes.PLAYER, holder)) {
                    event.add(EntityTypes.PLAYER, holder, spec.defaultBase);
                }
            }
        });
    }

    private static Attribute.Sentiment resolveSentiment(String key) {
        return switch (key == null ? "neutral" : key) {
            case "positive" -> Attribute.Sentiment.POSITIVE;
            case "negative" -> Attribute.Sentiment.NEGATIVE;
            default -> Attribute.Sentiment.NEUTRAL;
        };
    }
}
