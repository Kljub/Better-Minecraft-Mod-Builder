package sheepfromheaven.screenspec.runtime.entity.client;

import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Mob;
import sheepfromheaven.screenspec.runtime.entity.SpecEntity;

/** Shared renderer for every custom mob; model and texture are per-spec instance state. */
public class SpecRenderer<T extends Mob & SpecEntity> extends MobRenderer<T, SpecRenderState, SpecModel> {
    private final Identifier texture;

    public SpecRenderer(EntityRendererProvider.Context context, SpecModel model, Identifier texture, float shadow) {
        super(context, model, shadow);
        this.texture = texture;
    }

    @Override
    public SpecRenderState createRenderState() {
        return new SpecRenderState();
    }

    @Override
    public void extractRenderState(T entity, SpecRenderState state, float partialTicks) {
        super.extractRenderState(entity, state, partialTicks);
        state.idleAnimationState.copyFrom(entity.idleAnimationState());
        state.attackAnimationState.copyFrom(entity.attackAnimationState());
    }

    @Override
    public Identifier getTextureLocation(SpecRenderState state) {
        return texture;
    }
}
