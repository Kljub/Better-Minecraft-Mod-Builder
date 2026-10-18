package sheepfromheaven.screenspec.runtime.entity;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.level.Level;

/** A non-monster custom mob (creature/ambient/water/misc category) — see {@link EntitySpec}. */
public class SpecMob extends PathfinderMob implements SpecEntity {
    private final EntitySpec spec;
    private final AnimationState idleAnimationState = new AnimationState();
    private final AnimationState attackAnimationState = new AnimationState();

    public SpecMob(EntityType<? extends SpecMob> type, Level level, EntitySpec spec) {
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
