package sheepfromheaven.screenspec.runtime.entity;

import net.minecraft.world.entity.AnimationState;

/** What the shared renderer needs from both mob classes ({@link SpecMob}, {@link SpecMonster}). */
public interface SpecEntity {
    EntitySpec spec();
    AnimationState idleAnimationState();
    AnimationState attackAnimationState();
}
