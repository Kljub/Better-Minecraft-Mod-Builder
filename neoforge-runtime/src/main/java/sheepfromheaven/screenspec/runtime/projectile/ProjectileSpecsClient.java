package sheepfromheaven.screenspec.runtime.projectile;

import net.minecraft.client.renderer.entity.ThrownItemRenderer;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;

import java.util.List;

/** Client half of {@link ProjectileSpecs}: vanilla's thrown-item renderer (draws the item icon, optionally full-bright). */
final class ProjectileSpecsClient {
    private ProjectileSpecsClient() {}

    static void register(IEventBus modBus, List<ProjectileSpecs.Registered> projectiles) {
        modBus.addListener(EntityRenderersEvent.RegisterRenderers.class, event -> {
            for (ProjectileSpecs.Registered p : projectiles) {
                boolean glowing = p.spec().glowing;
                event.registerEntityRenderer(p.type().get(), context -> new ThrownItemRenderer<>(context, 1.0F, glowing));
            }
        });
    }
}
