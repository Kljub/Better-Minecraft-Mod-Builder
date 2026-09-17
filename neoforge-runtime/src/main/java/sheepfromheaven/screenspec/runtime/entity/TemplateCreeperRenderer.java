package sheepfromheaven.screenspec.runtime.entity;

import net.minecraft.client.renderer.entity.CreeperRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.state.CreeperRenderState;
import net.minecraft.resources.Identifier;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.api.distmarker.OnlyIn;

/**
 * Shared client renderer for every {@link EntitySpec} with {@code bodyTemplate: "creeper"} —
 * reuses vanilla's creeper model/animations wholesale, only the texture differs per spec (one
 * renderer instance per spec, all of this one class — see {@link EntitySpecs#registerRenderers}).
 */
@OnlyIn(Dist.CLIENT)
public class TemplateCreeperRenderer extends CreeperRenderer {
    private final Identifier texture;

    public TemplateCreeperRenderer(EntityRendererProvider.Context context, Identifier texture) {
        super(context);
        this.texture = texture;
    }

    @Override
    public Identifier getTextureLocation(CreeperRenderState state) {
        return texture;
    }
}
