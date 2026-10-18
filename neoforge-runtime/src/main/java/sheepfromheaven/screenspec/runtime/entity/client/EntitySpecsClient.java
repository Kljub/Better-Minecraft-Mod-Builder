package sheepfromheaven.screenspec.runtime.entity.client;

import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntityType;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;
import net.minecraft.world.entity.MobCategory;
import sheepfromheaven.screenspec.runtime.entity.EntitySpec;
import sheepfromheaven.screenspec.runtime.entity.EntitySpecs;
import sheepfromheaven.screenspec.runtime.entity.SpecMob;
import sheepfromheaven.screenspec.runtime.entity.SpecMonster;

import java.util.List;

/** Client half of {@link sheepfromheaven.screenspec.runtime.entity.EntitySpecs}: model layers and renderers. */
public final class EntitySpecsClient {
    private EntitySpecsClient() {}

    public static void register(String modId, IEventBus modBus, List<EntitySpec> specs) {
        modBus.addListener(EntityRenderersEvent.RegisterLayerDefinitions.class, event -> {
            for (EntitySpec spec : specs) event.registerLayerDefinition(layer(modId, spec), () -> SpecModel.createLayer(spec));
        });
        modBus.addListener(EntityRenderersEvent.RegisterRenderers.class, event -> {
            for (EntitySpec spec : specs) {
                EntityType<?> type = BuiltInRegistries.ENTITY_TYPE.getValue(Identifier.fromNamespaceAndPath(modId, spec.id));
                Identifier texture = Identifier.fromNamespaceAndPath(modId, spec.texture == null || spec.texture.isBlank() ? "textures/entity/" + spec.id + ".png" : spec.texture);
                float shadow = Math.max(0.2F, Math.min(1.5F, spec.hitboxWidth * 0.6F));
                if (EntitySpecs.category(spec.mobCategory) == MobCategory.MONSTER) {
                    @SuppressWarnings("unchecked") EntityType<SpecMonster> t = (EntityType<SpecMonster>) type;
                    event.registerEntityRenderer(t, (EntityRendererProvider<SpecMonster>) ctx -> new SpecRenderer<>(ctx, new SpecModel(ctx.bakeLayer(layer(modId, spec)), spec), texture, shadow));
                } else {
                    @SuppressWarnings("unchecked") EntityType<SpecMob> t = (EntityType<SpecMob>) type;
                    event.registerEntityRenderer(t, (EntityRendererProvider<SpecMob>) ctx -> new SpecRenderer<>(ctx, new SpecModel(ctx.bakeLayer(layer(modId, spec)), spec), texture, shadow));
                }
            }
        });
    }

    private static ModelLayerLocation layer(String modId, EntitySpec spec) {
        return new ModelLayerLocation(Identifier.fromNamespaceAndPath(modId, spec.id), "main");
    }
}
