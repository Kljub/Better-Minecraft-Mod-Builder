package sheepfromheaven.screenspec.runtime.boat;

import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.object.boat.BoatModel;
import net.minecraft.client.renderer.entity.BoatRenderer;
import net.minecraft.resources.Identifier;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;

import java.util.List;

/**
 * Client half of {@link BoatSpecs}: one model layer per boat ({@code <modid>:boat/<id>} /
 * {@code <modid>:chest_boat/<id>}, vanilla's boat geometry) and vanilla's {@link BoatRenderer},
 * which derives the texture from that layer id — so the texture lives at
 * {@code assets/<modid>/textures/entity/boat/<id>.png} exactly like vanilla's oak boat.
 */
final class BoatSpecsClient {
    private BoatSpecsClient() {}

    static void register(String modId, IEventBus modBus, List<BoatSpecs.Registered> boats) {
        modBus.addListener(EntityRenderersEvent.RegisterLayerDefinitions.class, event -> {
            for (BoatSpecs.Registered b : boats) {
                event.registerLayerDefinition(boatLayer(modId, b.spec()), BoatModel::createBoatModel);
                if (b.chestBoat() != null) event.registerLayerDefinition(chestLayer(modId, b.spec()), BoatModel::createChestBoatModel);
            }
        });
        modBus.addListener(EntityRenderersEvent.RegisterRenderers.class, event -> {
            for (BoatSpecs.Registered b : boats) {
                ModelLayerLocation boat = boatLayer(modId, b.spec());
                event.registerEntityRenderer(b.boat().get(), context -> new BoatRenderer(context, boat));
                if (b.chestBoat() != null) {
                    ModelLayerLocation chest = chestLayer(modId, b.spec());
                    event.registerEntityRenderer(b.chestBoat().get(), context -> new BoatRenderer(context, chest));
                }
            }
        });
    }

    private static ModelLayerLocation boatLayer(String modId, BoatSpec spec) {
        return new ModelLayerLocation(Identifier.fromNamespaceAndPath(modId, "boat/" + spec.id), "main");
    }

    private static ModelLayerLocation chestLayer(String modId, BoatSpec spec) {
        return new ModelLayerLocation(Identifier.fromNamespaceAndPath(modId, "chest_boat/" + spec.id), "main");
    }
}
