package sheepfromheaven.screenspec.runtime.entity;

import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.api.distmarker.OnlyIn;

/**
 * The model for every {@link EntitySpec} with {@link EntitySpec#useCustomModel} set — one shared
 * class, one instance per spec, wrapping that spec's own baked {@link ModelPart} (built from its
 * {@link EntitySpec.Geometry} by {@link EntitySpecs#buildLayerDefinition}). No overrides needed:
 * {@code EntityModel}'s {@code renderToBuffer}/{@code setupAnim} aren't abstract and already do
 * the right thing for a static (non-animated) model — v1 has no walk-cycle/bone animation.
 */
@OnlyIn(Dist.CLIENT)
public class GenericEntityModel extends EntityModel<LivingEntityRenderState> {
    public GenericEntityModel(ModelPart root) {
        super(root);
    }
}
