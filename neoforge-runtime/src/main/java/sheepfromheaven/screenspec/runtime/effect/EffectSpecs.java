package sheepfromheaven.screenspec.runtime.effect;

import net.minecraft.core.Holder;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.neoforged.neoforge.registries.DeferredRegister;
import sheepfromheaven.screenspec.runtime.attribute.AttributeModifierSpec;
import sheepfromheaven.screenspec.runtime.attribute.AttributeResolver;

import java.util.ArrayList;
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
 *
 * <p>{@link EffectSpec#extraEffects} ride along with the effect: once a second (and on start)
 * each one is (re-)added with this effect's remaining duration, so they end together. For an
 * instant effect, which has no duration, they last {@link #INSTANT_EXTRA_TICKS}.
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

    private static final int EXTRA_REFRESH_TICKS = 20;
    private static final int INSTANT_EXTRA_TICKS = 200;

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
            // extras are resolved lazily (first tick), when every effect of `result` is registered
            Holder<MobEffect> holder = register.register(spec.id, () -> buildEffect(spec, modId, category, colorInt, customAttributes, result));
            result.put(spec.id, holder);
        }
        return result;
    }

    private static MobEffect buildEffect(
            EffectSpec spec, String modId, MobEffectCategory category, int colorInt,
            Map<String, Holder<Attribute>> customAttributes, Map<String, Holder<MobEffect>> customEffects) {
        SimpleParticleType particle = spec.particle == null ? null : PARTICLES.get(spec.particle);
        ExtraEffects extras = new ExtraEffects(spec, customEffects);
        MobEffect effect = particle != null
            ? new MobEffect(category, colorInt, particle) {
                @Override public boolean isInstantaneous() { return spec.isInstant; }
                @Override public boolean shouldApplyEffectTickThisTick(int duration, int amplifier) {
                    return extras.any() ? duration % EXTRA_REFRESH_TICKS == 0 : super.shouldApplyEffectTickThisTick(duration, amplifier);
                }
                @Override public boolean applyEffectTick(ServerLevel level, LivingEntity entity, int amplifier) {
                    extras.apply(entity);
                    return true;
                }
                @Override public void onEffectStarted(LivingEntity entity, int amplifier) { extras.apply(entity); }
                @Override public void applyInstantaneousEffect(ServerLevel level, Entity source, Entity indirect, LivingEntity entity, int amplifier, double health) {
                    extras.applyFor(entity, INSTANT_EXTRA_TICKS);
                }
              }
            : new MobEffect(category, colorInt) {
                @Override public boolean isInstantaneous() { return spec.isInstant; }
                @Override public boolean shouldApplyEffectTickThisTick(int duration, int amplifier) {
                    return extras.any() ? duration % EXTRA_REFRESH_TICKS == 0 : super.shouldApplyEffectTickThisTick(duration, amplifier);
                }
                @Override public boolean applyEffectTick(ServerLevel level, LivingEntity entity, int amplifier) {
                    extras.apply(entity);
                    return true;
                }
                @Override public void onEffectStarted(LivingEntity entity, int amplifier) { extras.apply(entity); }
                @Override public void applyInstantaneousEffect(ServerLevel level, Entity source, Entity indirect, LivingEntity entity, int amplifier, double health) {
                    extras.applyFor(entity, INSTANT_EXTRA_TICKS);
                }
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

    /** The {@link EffectSpec#extraEffects} of one effect, resolved on first use. */
    private static final class ExtraEffects {
        private final EffectSpec spec;
        private final Map<String, Holder<MobEffect>> customEffects;
        private List<MobEffectInstance> resolved;

        ExtraEffects(EffectSpec spec, Map<String, Holder<MobEffect>> customEffects) {
            this.spec = spec;
            this.customEffects = customEffects;
        }

        boolean any() {
            return spec.extraEffects != null && !spec.extraEffects.isEmpty();
        }

        /** Re-adds every extra with the owning effect's remaining duration. */
        void apply(LivingEntity entity) {
            if (!any()) return;
            Holder<MobEffect> self = customEffects.get(spec.id);
            MobEffectInstance own = self == null ? null : entity.getEffect(self);
            if (own == null) return;
            applyFor(entity, own.isInfiniteDuration() ? MobEffectInstance.INFINITE_DURATION : own.getDuration());
        }

        void applyFor(LivingEntity entity, int duration) {
            if (!any() || entity.level().isClientSide()) return;
            for (MobEffectInstance extra : resolve()) {
                // ambient, no particles: the owning effect already shows its own
                entity.addEffect(new MobEffectInstance(extra.getEffect(), duration, extra.getAmplifier(), true, false, true));
            }
        }

        private List<MobEffectInstance> resolve() {
            if (resolved != null) return resolved;
            List<MobEffectInstance> out = new ArrayList<>();
            for (EffectSpec.ExtraEffect extra : spec.extraEffects) {
                if (extra.effectId == null || extra.effectId.isBlank() || extra.effectId.equals(spec.id)) continue;
                Holder<MobEffect> effect = customEffects.get(extra.effectId);
                if (effect == null) {
                    Identifier id = Identifier.tryParse(extra.effectId);
                    effect = id == null ? null : BuiltInRegistries.MOB_EFFECT.get(id).<Holder<MobEffect>>map(ref -> ref).orElse(null);
                }
                if (effect != null) out.add(new MobEffectInstance(effect, 1, Math.max(0, extra.amplifier)));
            }
            return resolved = out;
        }
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
