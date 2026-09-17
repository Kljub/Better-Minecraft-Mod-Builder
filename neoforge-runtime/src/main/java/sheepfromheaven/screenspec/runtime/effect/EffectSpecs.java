package sheepfromheaven.screenspec.runtime.effect;

import net.minecraft.core.Holder;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.neoforged.neoforge.registries.DeferredRegister;
import sheepfromheaven.screenspec.runtime.attribute.AttributeModifierSpec;
import sheepfromheaven.screenspec.runtime.attribute.AttributeResolver;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds and registers vanilla {@link MobEffect}s from {@link EffectSpec}s. Internal — called
 * only by {@link sheepfromheaven.screenspec.runtime.ModContent}; a mod author using the MC Screen
 * Designer web tool never calls this directly.
 *
 * <p>{@code MobEffect}'s constructor is {@code protected} in this MC version (no public
 * {@code Builder}) — registered via a trivial anonymous subclass, same idea as how vanilla's own
 * effects are declared. {@code isInstantaneous()} is always overridden (even when {@code false},
 * matching the default) since a single anonymous class needs to bake in the flag regardless of
 * which constructor overload got picked for the particle. Particle ids are resolved against a
 * small curated map (verified real {@code SimpleParticleType} constants — vanilla has no public
 * generic "id to particle" registry-based constructor here); the sound id, being open-ended, goes
 * through a real registry lookup instead.
 */
public final class EffectSpecs {
    private EffectSpecs() {}

    /** Curated real vanilla particle ids the webapp offers — see EFFECT_PARTICLE_OPTIONS in
     * webapp/lib/effectRegistry.ts, must stay in sync. */
    private static final Map<String, SimpleParticleType> PARTICLES = Map.ofEntries(
        Map.entry("minecraft:witch", ParticleTypes.WITCH),
        Map.entry("minecraft:glow", ParticleTypes.GLOW),
        Map.entry("minecraft:soul", ParticleTypes.SOUL),
        Map.entry("minecraft:portal", ParticleTypes.PORTAL),
        Map.entry("minecraft:sneeze", ParticleTypes.SNEEZE),
        Map.entry("minecraft:infested", ParticleTypes.INFESTED),
        Map.entry("minecraft:crit", ParticleTypes.CRIT),
        Map.entry("minecraft:heart", ParticleTypes.HEART),
        Map.entry("minecraft:note", ParticleTypes.NOTE),
        Map.entry("minecraft:smoke", ParticleTypes.SMOKE),
        Map.entry("minecraft:flame", ParticleTypes.FLAME),
        Map.entry("minecraft:poof", ParticleTypes.POOF)
    );

    public static DeferredRegister<MobEffect> createRegister(String modId) {
        return DeferredRegister.create(Registries.MOB_EFFECT, modId);
    }

    /** Registers one {@link MobEffect} per spec and returns them keyed by {@link EffectSpec#id}. */
    public static Map<String, Holder<MobEffect>> registerAll(
            DeferredRegister<MobEffect> register, List<EffectSpec> specs, String modId, Map<String, Holder<Attribute>> customAttributes) {
        Map<String, Holder<MobEffect>> result = new LinkedHashMap<>();
        for (EffectSpec spec : specs) {
            MobEffectCategory category = resolveCategory(spec.category);
            int colorInt = parseColor(spec.color);
            Holder<MobEffect> holder = register.register(spec.id, () -> buildEffect(spec, modId, category, colorInt, customAttributes));
            result.put(spec.id, holder);
        }
        return result;
    }

    private static MobEffect buildEffect(
            EffectSpec spec, String modId, MobEffectCategory category, int colorInt, Map<String, Holder<Attribute>> customAttributes) {
        SimpleParticleType particle = spec.particle == null ? null : PARTICLES.get(spec.particle);
        MobEffect effect = particle != null
            ? new MobEffect(category, colorInt, particle) {
                @Override public boolean isInstantaneous() { return spec.isInstant; }
              }
            : new MobEffect(category, colorInt) {
                @Override public boolean isInstantaneous() { return spec.isInstant; }
              };

        if (spec.soundOnAdded != null && !spec.soundOnAdded.isBlank()) {
            Identifier soundId = Identifier.tryParse(spec.soundOnAdded);
            SoundEvent sound = soundId == null ? null : BuiltInRegistries.SOUND_EVENT.getValue(soundId);
            if (sound != null) effect = effect.withSoundOnAdded(sound);
        }

        if (spec.attributes != null) {
            int i = 0;
            for (AttributeModifierSpec attr : spec.attributes) {
                Identifier id = Identifier.fromNamespaceAndPath(modId, spec.id + "_" + (i++));
                effect.addAttributeModifier(
                    AttributeResolver.resolveAttribute(attr.attribute, customAttributes),
                    id,
                    attr.amount,
                    AttributeResolver.resolveOperation(attr.operation)
                );
            }
        }
        return effect;
    }

    private static MobEffectCategory resolveCategory(String key) {
        return switch (key == null ? "neutral" : key) {
            case "beneficial" -> MobEffectCategory.BENEFICIAL;
            case "harmful" -> MobEffectCategory.HARMFUL;
            default -> MobEffectCategory.NEUTRAL;
        };
    }

    private static int parseColor(String hex) {
        if (hex == null || hex.isEmpty()) return 0xa0a0a0;
        try {
            return Integer.parseInt(hex.startsWith("#") ? hex.substring(1) : hex, 16);
        } catch (NumberFormatException e) {
            return 0xa0a0a0;
        }
    }
}
