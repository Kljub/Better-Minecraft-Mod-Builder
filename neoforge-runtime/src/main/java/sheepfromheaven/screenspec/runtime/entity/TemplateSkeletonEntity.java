package sheepfromheaven.screenspec.runtime.entity;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.monster.skeleton.Skeleton;
import net.minecraft.world.level.Level;

/**
 * Shared Java entity class backing every {@link EntitySpec} with {@code bodyTemplate: "skeleton"}
 * — one class registered under many distinct {@code EntityType}s (one per spec, see {@link
 * EntitySpecs#registerAll}), not one class per mob. Inherits vanilla skeleton AI wholesale; see
 * the commented extension seam below for where a separately-developed custom AI system hooks in.
 */
public class TemplateSkeletonEntity extends Skeleton {
    public TemplateSkeletonEntity(EntityType<? extends Skeleton> type, Level level) {
        super(type, level);
    }

    // Extension seam — custom AI goals are being developed separately (out of scope here).
    // Uncomment and fill in once ready; every skeleton-templated mob picks this up automatically.
    //
    // @Override
    // protected void registerGoals() {
    //     super.registerGoals(); // keep vanilla skeleton behavior as a base, or omit to fully replace
    //     this.goalSelector.addGoal(1, new MyCustomGoal(this));
    // }
}
