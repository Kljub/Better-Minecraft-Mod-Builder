package sheepfromheaven.screenspec.runtime.entity;

import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.SpiderRenderer;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.monster.spider.Spider;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.api.distmarker.OnlyIn;

/**
 * Shared client renderer for every {@link EntitySpec} with {@code bodyTemplate: "spider"} —
 * reuses vanilla's spider model/animations wholesale, only the texture differs per spec (one
 * renderer instance per spec, all of this one class — see {@link EntitySpecs#registerRenderers}).
 */
@OnlyIn(Dist.CLIENT)
public class TemplateSpiderRenderer extends SpiderRenderer<Spider> {
    private final Identifier texture;

    public TemplateSpiderRenderer(EntityRendererProvider.Context context, Identifier texture) {
        super(context);
        this.texture = texture;
    }

    @Override
    public Identifier getTextureLocation(LivingEntityRenderState state) {
        return texture;
    }
}
