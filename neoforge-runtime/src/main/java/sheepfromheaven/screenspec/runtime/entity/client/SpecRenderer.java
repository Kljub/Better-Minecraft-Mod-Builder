package sheepfromheaven.screenspec.runtime.entity.client;

import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.item.ItemModelResolver;
import net.minecraft.client.renderer.item.ItemStackRenderState;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Mob;
import sheepfromheaven.screenspec.runtime.entity.SpecEntity;

/** Shared renderer for every custom mob; model and texture are per-spec instance state. */
public class SpecRenderer<T extends Mob & SpecEntity> extends MobRenderer<T, SpecRenderState, SpecModel> {
    private final Identifier texture;
    private final ItemModelResolver itemModels;
    private final MeshPartsLayer<T> meshLayer;

    public SpecRenderer(EntityRendererProvider.Context context, SpecModel model, Identifier texture, float shadow) {
        super(context, model, shadow);
        this.texture = texture;
        this.itemModels = context.getItemModelResolver();
        // Mesh Models mobs: their parts carry OBJ meshes instead of (or besides) cubes.
        this.meshLayer = MeshPartsLayer.hasMeshes(model.spec) ? new MeshPartsLayer<>(this, model.spec) : null;
        if (meshLayer != null) addLayer(meshLayer);
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
        if (meshLayer != null) {
            while (state.meshParts.size() < meshLayer.size()) state.meshParts.add(new ItemStackRenderState());
            for (int i = 0; i < meshLayer.size(); i++) {
                itemModels.updateForNonLiving(state.meshParts.get(i), meshLayer.stack(i), ItemDisplayContext.NONE, entity);
            }
        }
    }

    @Override
    public Identifier getTextureLocation(SpecRenderState state) {
        return texture;
    }
}
