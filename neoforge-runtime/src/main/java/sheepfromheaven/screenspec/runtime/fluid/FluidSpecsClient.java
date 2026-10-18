package sheepfromheaven.screenspec.runtime.fluid;

import net.minecraft.client.renderer.block.FluidModel;
import net.minecraft.client.resources.model.sprite.Material;
import net.minecraft.resources.Identifier;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.client.event.RegisterFluidModelsEvent;
import net.neoforged.neoforge.client.fluid.FluidTintSources;

import java.util.List;

/**
 * Client half of {@link FluidSpecs} — kept in its own class so the dedicated server never loads
 * the client-only {@link FluidModel}. This MC version's fluid rendering is a {@code FluidModel}
 * per fluid (see vanilla's {@code FluidStateModelSet}); each spec reuses vanilla's water or lava
 * still/flow sprites with a constant tint, which the bucket's {@code neoforge:fluid_container}
 * item model then picks up too.
 */
final class FluidSpecsClient {
    private FluidSpecsClient() {}

    static void register(IEventBus modBus, List<FluidSpecs.Registered> fluids) {
        modBus.addListener(RegisterFluidModelsEvent.class, event -> {
            for (FluidSpecs.Registered f : fluids) {
                boolean lava = "lava".equals(f.spec().base);
                String still = lava ? "block/lava_still" : "block/water_still";
                String flow = lava ? "block/lava_flow" : "block/water_flow";
                FluidModel.Unbaked model = new FluidModel.Unbaked(
                    new Material(Identifier.withDefaultNamespace(still)),
                    new Material(Identifier.withDefaultNamespace(flow)),
                    lava ? null : new Material(Identifier.withDefaultNamespace("block/water_overlay")),
                    FluidTintSources.constant(0xFF000000 | parseColor(f.spec().color)));
                event.register(model, f.source(), f.flowing());
            }
        });
    }

    private static int parseColor(String hex) {
        try {
            return Integer.parseInt(hex.startsWith("#") ? hex.substring(1) : hex, 16) & 0xFFFFFF;
        } catch (RuntimeException e) {
            return 0x3F76E4;
        }
    }
}
