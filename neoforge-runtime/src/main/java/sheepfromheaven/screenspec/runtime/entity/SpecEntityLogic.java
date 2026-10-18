package sheepfromheaven.screenspec.runtime.entity;

import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.PanicGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.player.Player;

/**
 * Behaviour shared by {@link SpecMob} and {@link SpecMonster}: AI goals per {@code behavior},
 * melee attacks dealing the spec's damage type, and the client-side animation states.
 */
final class SpecEntityLogic {
    /** entity event id broadcast when a melee hit lands — starts the attack animation client-side */
    static final byte ATTACK_EVENT = 4;

    private SpecEntityLogic() {}

    static void registerGoals(PathfinderMob mob, EntitySpec spec) {
        String behavior = spec.behavior == null ? "passive" : spec.behavior;
        mob.goalSelector.addGoal(0, new FloatGoal(mob));
        switch (behavior) {
            case "stationary" -> mob.goalSelector.addGoal(6, new LookAtPlayerGoal(mob, Player.class, 8.0F));
            case "hostile_melee" -> {
                mob.goalSelector.addGoal(2, new MeleeAttackGoal(mob, 1.0, false));
                mob.goalSelector.addGoal(5, new WaterAvoidingRandomStrollGoal(mob, 0.8));
                mob.goalSelector.addGoal(6, new LookAtPlayerGoal(mob, Player.class, 8.0F));
                mob.goalSelector.addGoal(7, new RandomLookAroundGoal(mob));
                mob.targetSelector.addGoal(1, new HurtByTargetGoal(mob));
                mob.targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(mob, Player.class, true));
            }
            case "neutral" -> {
                mob.goalSelector.addGoal(2, new MeleeAttackGoal(mob, 1.0, true));
                mob.goalSelector.addGoal(5, new WaterAvoidingRandomStrollGoal(mob, 0.8));
                mob.goalSelector.addGoal(6, new LookAtPlayerGoal(mob, Player.class, 6.0F));
                mob.goalSelector.addGoal(7, new RandomLookAroundGoal(mob));
                mob.targetSelector.addGoal(1, new HurtByTargetGoal(mob));
            }
            default -> {
                mob.goalSelector.addGoal(1, new PanicGoal(mob, 1.25));
                mob.goalSelector.addGoal(5, new WaterAvoidingRandomStrollGoal(mob, 1.0));
                mob.goalSelector.addGoal(6, new LookAtPlayerGoal(mob, Player.class, 6.0F));
                mob.goalSelector.addGoal(7, new RandomLookAroundGoal(mob));
            }
        }
    }

    /** The spec's damage type as a source caused by {@code mob}; falls back to vanilla mob_attack if it doesn't exist. */
    static DamageSource attackSource(Mob mob, EntitySpec spec) {
        Identifier id = Identifier.tryParse(spec.damageType == null || spec.damageType.isBlank() ? "minecraft:mob_attack" : spec.damageType);
        if (id != null) {
            ResourceKey<DamageType> key = ResourceKey.create(Registries.DAMAGE_TYPE, id);
            if (mob.level().registryAccess().lookupOrThrow(Registries.DAMAGE_TYPE).get(key).isPresent()) {
                return mob.damageSources().source(key, mob);
            }
        }
        return mob.damageSources().mobAttack(mob);
    }

    /** Melee hit with the spec's damage type; returns whether it hurt. */
    static boolean doHurtTarget(Mob mob, EntitySpec spec, ServerLevel level, Entity target) {
        float damage = (float) mob.getAttributeValue(net.minecraft.world.entity.ai.attributes.Attributes.ATTACK_DAMAGE);
        boolean hurt = target.hurtServer(level, attackSource(mob, spec), damage);
        if (hurt) {
            mob.setLastHurtMob(target);
            level.broadcastEntityEvent(mob, ATTACK_EVENT);
        }
        return hurt;
    }

    /** Client tick: idle plays while standing still (and loops if the animation does). */
    static void tickAnimations(Mob mob, AnimationState idle) {
        if (mob.level().isClientSide()) idle.animateWhen(!mob.walkAnimation.isMoving(), mob.tickCount);
    }
}
