package sheepfromheaven.screenspec.runtime.entity;

import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Mob;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.api.distmarker.OnlyIn;

/**
 * Shared client renderer for every {@link EntitySpec} with {@link EntitySpec#useCustomModel} set —
 * generic over {@code T extends Mob} (same shape as vanilla's own {@code SpiderRenderer<T extends
 * Spider>}) so this one class works regardless of which {@code bodyTemplate} the spec behaviorally
 * extends; the baked {@link GenericEntityModel} and texture are both per-spec instance state, not
 * per-class (see {@link EntitySpecs#registerRenderers}).
 */
@OnlyIn(Dist.CLIENT)
public class GenericMobRenderer<T extends Mob> extends MobRenderer<T, LivingEntityRenderState, GenericEntityModel> {
    private final Identifier texture;

    public GenericMobRenderer(EntityRendererProvider.Context context, GenericEntityModel model, Identifier texture) {
        super(context, model, 0.5F);
        this.texture = texture;
    }

    @Override
    public Identifier getTextureLocation(LivingEntityRenderState state) {
        return texture;
    }

    @Override
    public LivingEntityRenderState createRenderState() {
        return new LivingEntityRenderState();
    }
}
