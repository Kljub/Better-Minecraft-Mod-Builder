package sheepfromheaven.screenspec.runtime.entity;

import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.SkeletonRenderer;
import net.minecraft.client.renderer.entity.state.SkeletonRenderState;
import net.minecraft.resources.Identifier;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.api.distmarker.OnlyIn;

/**
 * Shared client renderer for every {@link EntitySpec} with {@code bodyTemplate: "skeleton"} —
 * reuses vanilla's skeleton model/animations wholesale, only the texture differs per spec (one
 * renderer instance per spec, all of this one class — see {@link EntitySpecs#registerRenderers}).
 */
@OnlyIn(Dist.CLIENT)
public class TemplateSkeletonRenderer extends SkeletonRenderer {
    private final Identifier texture;

    public TemplateSkeletonRenderer(EntityRendererProvider.Context context, Identifier texture) {
        super(context);
        this.texture = texture;
    }

    @Override
    public Identifier getTextureLocation(SkeletonRenderState state) {
        return texture;
    }
}
