package sheepfromheaven.screenspec.runtime.entity;

import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.ZombieRenderer;
import net.minecraft.client.renderer.entity.state.ZombieRenderState;
import net.minecraft.resources.Identifier;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.api.distmarker.OnlyIn;

/**
 * Shared client renderer for every {@link EntitySpec} with {@code bodyTemplate: "zombie"} —
 * reuses vanilla's zombie model/animations wholesale, only the texture differs per spec (one
 * renderer instance per spec, all of this one class — see {@link EntitySpecs#registerRenderers}).
 */
@OnlyIn(Dist.CLIENT)
public class TemplateZombieRenderer extends ZombieRenderer {
    private final Identifier texture;

    public TemplateZombieRenderer(EntityRendererProvider.Context context, Identifier texture) {
        super(context);
        this.texture = texture;
    }

    @Override
    public Identifier getTextureLocation(ZombieRenderState state) {
        return texture;
    }
}
