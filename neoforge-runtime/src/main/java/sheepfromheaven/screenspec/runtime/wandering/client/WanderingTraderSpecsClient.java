package sheepfromheaven.screenspec.runtime.wandering.client;

import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.WanderingTraderRenderer;
import net.minecraft.client.renderer.entity.state.VillagerRenderState;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.npc.wanderingtrader.WanderingTrader;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;
import net.neoforged.neoforge.registries.DeferredHolder;
import sheepfromheaven.screenspec.runtime.wandering.SpecWanderingTrader;
import sheepfromheaven.screenspec.runtime.wandering.WanderingTraderSpec;

import java.util.List;
import java.util.Map;

/** Client half of {@link sheepfromheaven.screenspec.runtime.wandering.WanderingTraderSpecs}: the vanilla wandering trader renderer with the trader's own texture. */
public final class WanderingTraderSpecsClient {
    private WanderingTraderSpecsClient() {}

    public static void register(String modId, IEventBus modBus, List<WanderingTraderSpec> specs,
                                Map<String, DeferredHolder<EntityType<?>, EntityType<SpecWanderingTrader>>> types) {
        modBus.addListener(EntityRenderersEvent.RegisterRenderers.class, event -> {
            for (WanderingTraderSpec spec : specs) {
                Identifier texture = spec.texture == null || spec.texture.isBlank()
                    ? Identifier.withDefaultNamespace("textures/entity/wandering_trader/wandering_trader.png")
                    : Identifier.fromNamespaceAndPath(modId, spec.texture);
                event.registerEntityRenderer(types.get(spec.id).get(), (EntityRendererProvider<WanderingTrader>) ctx -> new WanderingTraderRenderer(ctx) {
                    @Override
                    public Identifier getTextureLocation(VillagerRenderState state) {
                        return texture;
                    }
                });
            }
        });
    }
}
