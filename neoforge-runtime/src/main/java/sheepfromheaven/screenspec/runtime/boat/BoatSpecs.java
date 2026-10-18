package sheepfromheaven.screenspec.runtime.boat;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.vehicle.boat.Boat;
import net.minecraft.world.entity.vehicle.boat.ChestBoat;
import net.minecraft.world.item.BoatItem;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.event.BuildCreativeModeTabContentsEvent;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.ArrayList;
import java.util.List;

/**
 * Registers each {@link BoatSpec} exactly like vanilla's wood boats ({@code EntityTypes.OAK_BOAT}
 * / {@code OAK_CHEST_BOAT}: same entity classes, size and tracking range) plus their
 * {@link BoatItem}s in Tools & Utilities. Rendering reuses vanilla's boat model with the spec's own
 * texture — see {@link BoatSpecsClient}. Internal — called by
 * {@link sheepfromheaven.screenspec.runtime.ModElements}.
 */
public final class BoatSpecs {
    private BoatSpecs() {}

    public record Registered(BoatSpec spec, DeferredHolder<EntityType<?>, EntityType<Boat>> boat,
                             DeferredHolder<EntityType<?>, EntityType<ChestBoat>> chestBoat) {}

    public static void register(String modId, IEventBus modBus, List<BoatSpec> specs) {
        if (specs.isEmpty()) return;
        DeferredRegister.Entities entities = DeferredRegister.createEntities(modId);
        DeferredRegister.Items items = DeferredRegister.createItems(modId);
        List<Registered> registered = new ArrayList<>();
        List<DeferredItem<BoatItem>> tabItems = new ArrayList<>();

        for (BoatSpec spec : specs) {
            // Entity and item point at each other (the boat drops its item) — both are lazy holders.
            @SuppressWarnings("unchecked")
            DeferredItem<BoatItem>[] boatItem = new DeferredItem[1];
            @SuppressWarnings("unchecked")
            DeferredItem<BoatItem>[] chestItem = new DeferredItem[1];

            DeferredHolder<EntityType<?>, EntityType<Boat>> boat = entities.registerEntityType(spec.id + "_boat",
                (type, level) -> new Boat(type, level, () -> boatItem[0].get()), MobCategory.MISC,
                b -> b.noLootTable().sized(1.375F, 0.5625F).eyeHeight(0.5625F).clientTrackingRange(10));
            boatItem[0] = items.registerItem(spec.id + "_boat", p -> new BoatItem(boat.get(), p), () -> new Item.Properties().stacksTo(1));
            tabItems.add(boatItem[0]);

            DeferredHolder<EntityType<?>, EntityType<ChestBoat>> chest = null;
            if (spec.chestBoat) {
                chest = entities.registerEntityType(spec.id + "_chest_boat",
                    (type, level) -> new ChestBoat(type, level, () -> chestItem[0].get()), MobCategory.MISC,
                    b -> b.noLootTable().sized(1.375F, 0.5625F).eyeHeight(0.5625F).clientTrackingRange(10));
                DeferredHolder<EntityType<?>, EntityType<ChestBoat>> chestType = chest;
                chestItem[0] = items.registerItem(spec.id + "_chest_boat", p -> new BoatItem(chestType.get(), p), () -> new Item.Properties().stacksTo(1));
                tabItems.add(chestItem[0]);
            }
            registered.add(new Registered(spec, boat, chest));
        }
        entities.register(modBus);
        items.register(modBus);

        modBus.addListener(BuildCreativeModeTabContentsEvent.class, event -> {
            if (event.getTabKey() != CreativeModeTabs.TOOLS_AND_UTILITIES) return;
            for (DeferredItem<BoatItem> item : tabItems) event.accept(item.get());
        });
        if (FMLEnvironment.getDist() == Dist.CLIENT) BoatSpecsClient.register(modId, modBus, registered);
    }
}
