package sheepfromheaven.screenspec.runtime.entity;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.level.Level;

/** A monster-category custom mob (despawns in peaceful, spawns in the dark) — see {@link EntitySpec}. */
public class SpecMonster extends Monster implements SpecEntity {
    private final EntitySpec spec;
    private final AnimationState idleAnimationState = new AnimationState();
    private final AnimationState attackAnimationState = new AnimationState();

    public SpecMonster(EntityType<? extends SpecMonster> type, Level level, EntitySpec spec) {
        super(type, level);
        this.spec = spec;
        this.xpReward = spec.xpReward;
        SpecEntityLogic.registerGoals(this, spec);
    }

    @Override public EntitySpec spec() { return spec; }
    @Override public AnimationState idleAnimationState() { return idleAnimationState; }
    @Override public AnimationState attackAnimationState() { return attackAnimationState; }

    @Override
    public boolean doHurtTarget(ServerLevel level, Entity target) {
        return SpecEntityLogic.doHurtTarget(this, spec, level, target);
    }

    @Override
    protected void actuallyHurt(ServerLevel level, DamageSource source, float amount) {
        super.actuallyHurt(level, source, amount);
        SpecEntityLogic.dropOnHurt(this, spec, level, source);
    }

    @Override
    public void tick() {
        super.tick();
        SpecEntityLogic.tickAnimations(this, idleAnimationState);
    }

    @Override
    public void handleEntityEvent(byte id) {
        if (id == SpecEntityLogic.ATTACK_EVENT) attackAnimationState.start(this.tickCount);
        else super.handleEntityEvent(id);
    }
}
