package sheepfromheaven.screenspec.runtime.fluid;

import net.minecraft.core.registries.Registries;
import net.minecraft.world.item.BucketItem;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.event.BuildCreativeModeTabContentsEvent;
import net.neoforged.neoforge.fluids.BaseFlowingFluid;
import net.neoforged.neoforge.fluids.FluidType;
import net.neoforged.neoforge.registries.DeferredBlock;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;
import net.neoforged.neoforge.registries.NeoForgeRegistries;

import java.util.ArrayList;
import java.util.List;

/**
 * Registers each {@link FluidSpec} the way NeoForge fluids are built by hand: a {@link FluidType}
 * (physics/behaviour), a source + flowing {@link BaseFlowingFluid}, the {@link LiquidBlock} that
 * places it in the world (properties copied from vanilla's water/lava block) and optionally a
 * {@link BucketItem} (added to Tools & Utilities). Rendering is a tinted copy of vanilla's water
 * or lava textures, registered client-side by {@link FluidSpecsClient}; blockstate, bucket item
 * model and lang come from the export bundle. Internal — called by
 * {@link sheepfromheaven.screenspec.runtime.ModElements}.
 */
public final class FluidSpecs {
    private FluidSpecs() {}

    /** One registered fluid — the client side needs the source/flowing pair for its fluid model. */
    public record Registered(FluidSpec spec, DeferredHolder<Fluid, BaseFlowingFluid.Source> source,
                             DeferredHolder<Fluid, BaseFlowingFluid.Flowing> flowing) {}

    public static void register(String modId, IEventBus modBus, List<FluidSpec> specs) {
        if (specs.isEmpty()) return;
        DeferredRegister<FluidType> types = DeferredRegister.create(NeoForgeRegistries.Keys.FLUID_TYPES, modId);
        DeferredRegister<Fluid> fluids = DeferredRegister.create(Registries.FLUID, modId);
        DeferredRegister.Blocks blocks = DeferredRegister.createBlocks(modId);
        DeferredRegister.Items items = DeferredRegister.createItems(modId);
        List<Registered> registered = new ArrayList<>();
        List<DeferredItem<BucketItem>> buckets = new ArrayList<>();

        for (FluidSpec spec : specs) {
            DeferredHolder<FluidType, FluidType> type = types.register(spec.id, () -> new FluidType(FluidType.Properties.create()
                .descriptionId("block." + modId + "." + spec.id)
                .lightLevel(clamp(spec.lightLevel, 0, 15))
                .density(spec.density)
                .viscosity(Math.max(1, spec.viscosity))
                .temperature(spec.temperature)
                .canSwim(spec.canSwim)
                .canDrown(spec.canDrown)
                .canExtinguish(spec.canExtinguish)
                .canConvertToSource(spec.canConvertToSource)
                .supportsBoating(spec.supportsBoating)
                .canPushEntity(true)));

            // Source/flowing/block/bucket reference each other — the holders are filled in below
            // before anything is resolved (registry suppliers only run during RegisterEvent).
            @SuppressWarnings("unchecked")
            DeferredHolder<Fluid, BaseFlowingFluid.Source>[] source = new DeferredHolder[1];
            @SuppressWarnings("unchecked")
            DeferredHolder<Fluid, BaseFlowingFluid.Flowing>[] flowing = new DeferredHolder[1];
            @SuppressWarnings("unchecked")
            DeferredBlock<LiquidBlock>[] block = new DeferredBlock[1];
            @SuppressWarnings("unchecked")
            DeferredItem<BucketItem>[] bucket = new DeferredItem[1];

            java.util.function.Supplier<BaseFlowingFluid.Properties> props = () -> {
                BaseFlowingFluid.Properties p = new BaseFlowingFluid.Properties(type, source[0], flowing[0])
                    .block(block[0])
                    .tickRate(Math.max(1, spec.tickRate))
                    .levelDecreasePerBlock(clamp(spec.levelDecreasePerBlock, 1, 7));
                if (bucket[0] != null) p.bucket(bucket[0]);
                return p;
            };
            source[0] = fluids.register(spec.id, () -> new BaseFlowingFluid.Source(props.get()));
            flowing[0] = fluids.register("flowing_" + spec.id, () -> new BaseFlowingFluid.Flowing(props.get()));
            block[0] = blocks.registerBlock(spec.id, p -> new LiquidBlock(source[0].get(), p), () -> {
                BlockBehaviour.Properties p = BlockBehaviour.Properties.of()
                    .mapColor("lava".equals(spec.base) ? MapColor.FIRE : MapColor.WATER)
                    .replaceable()
                    .noCollision()
                    .strength(100.0F)
                    .pushReaction(PushReaction.DESTROY)
                    .noLootTable()
                    .liquid()
                    .sound(SoundType.EMPTY);
                int light = clamp(spec.lightLevel, 0, 15);
                return light > 0 ? p.lightLevel(state -> light) : p;
            });
            if (spec.bucket) {
                bucket[0] = items.registerItem(spec.id + "_bucket", p -> new BucketItem(source[0].get(), p),
                    () -> new Item.Properties().craftRemainder(Items.BUCKET).stacksTo(1));
                buckets.add(bucket[0]);
            }
            registered.add(new Registered(spec, source[0], flowing[0]));
        }

        types.register(modBus);
        fluids.register(modBus);
        blocks.register(modBus);
        items.register(modBus);

        if (!buckets.isEmpty()) {
            modBus.addListener(BuildCreativeModeTabContentsEvent.class, event -> {
                if (event.getTabKey() != CreativeModeTabs.TOOLS_AND_UTILITIES) return;
                for (DeferredItem<BucketItem> b : buckets) event.accept(b.get());
            });
        }
        if (FMLEnvironment.getDist() == Dist.CLIENT) FluidSpecsClient.register(modBus, registered);
    }

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }
}
