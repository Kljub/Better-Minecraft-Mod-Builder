package sheepfromheaven.screenspec.runtime.effect;

import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.item.alchemy.Potion;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Builds and registers {@link Potion}s from {@link PotionSpec}s. Internal — called only by {@link
 * sheepfromheaven.screenspec.runtime.ModContent}; a mod author using the MC Screen Designer web
 * tool never calls this directly.
 */
public final class PotionSpecs {
    private PotionSpecs() {}

    public static DeferredRegister<Potion> createRegister(String modId) {
        return DeferredRegister.create(Registries.POTION, modId);
    }

    /**
     * Registers one {@link Potion} per spec. {@code customEffects} resolves a {@link
     * PotionEffectEntry#effectId} that isn't a fully-qualified vanilla id (e.g. {@code
     * "minecraft:speed"}) against the project's own {@link EffectSpec}s (see {@link EffectSpecs#registerAll}).
     */
    public static void registerAll(DeferredRegister<Potion> register, List<PotionSpec> specs, Map<String, Holder<MobEffect>> customEffects) {
        for (PotionSpec spec : specs) {
            register.register(spec.id, () -> buildPotion(spec, customEffects));
        }
    }

    private static Potion buildPotion(PotionSpec spec, Map<String, Holder<MobEffect>> customEffects) {
        List<MobEffectInstance> instances = new ArrayList<>();
        for (PotionEffectEntry entry : spec.effects) {
            Holder<MobEffect> effect = resolveEffect(entry.effectId, customEffects);
            int durationTicks = Math.max(1, (int) Math.round(entry.durationSeconds * 20));
            instances.add(new MobEffectInstance(effect, durationTicks, entry.amplifier));
        }
        return new Potion(spec.id, instances.toArray(new MobEffectInstance[0]));
    }

    private static Holder<MobEffect> resolveEffect(String effectId, Map<String, Holder<MobEffect>> customEffects) {
        Holder<MobEffect> custom = customEffects.get(effectId);
        if (custom != null) return custom;
        Identifier id = Identifier.parse(effectId);
        return BuiltInRegistries.MOB_EFFECT.get(id)
            .<Holder<MobEffect>>map(ref -> ref)
            .orElseThrow(() -> new IllegalArgumentException("Unknown effect: " + effectId));
    }
}
