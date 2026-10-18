package sheepfromheaven.screenspec.runtime.mesh;

import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.event.BuildCreativeModeTabContentsEvent;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.ArrayList;
import java.util.List;

/**
 * Registers the Mesh Models items and blocks of one mod ({@code elements/mesh_models.json}). Their
 * look is entirely data: the OBJ model, textures and item/blockstate definitions the webapp exports.
 * Items go to the Ingredients tab, blocks (with their block item) to Building Blocks.
 */
public final class MeshModelSpecs {
    private MeshModelSpecs() {}

    public static void register(String modId, IEventBus modBus, List<MeshModelSpec> specs) {
        List<MeshModelSpec> valid = new ArrayList<>();
        for (MeshModelSpec s : specs) if (s != null && s.id != null && !s.id.isBlank()) valid.add(s);
        if (valid.isEmpty()) return;

        DeferredRegister.Blocks blocks = DeferredRegister.createBlocks(modId);
        DeferredRegister.Items items = DeferredRegister.createItems(modId);
        List<DeferredItem<? extends Item>> plainItems = new ArrayList<>();
        List<DeferredItem<? extends Item>> blockItems = new ArrayList<>();
        for (MeshModelSpec spec : valid) {
            if ("block".equals(spec.target)) {
                MeshModelSpec.Box b = spec.box == null ? new MeshModelSpec.Box() : spec.box;
                var shape = Block.box(clamp(b.from, 0, 0), clamp(b.from, 1, 0), clamp(b.from, 2, 0), clamp(b.to, 0, 16), clamp(b.to, 1, 16), clamp(b.to, 2, 16));
                float hardness = Math.max(0, spec.hardness);
                var block = blocks.registerBlock(spec.id, p -> MeshBlock.create(p, shape),
                    () -> BlockBehaviour.Properties.of().strength(hardness, hardness * 3).noOcclusion().sound(SoundType.STONE));
                blockItems.add(items.registerSimpleBlockItem(spec.id, block));
            } else {
                plainItems.add(items.registerSimpleItem(spec.id));
            }
        }
        blocks.register(modBus);
        items.register(modBus);
        modBus.addListener(BuildCreativeModeTabContentsEvent.class, event -> {
            if (event.getTabKey() == CreativeModeTabs.INGREDIENTS) plainItems.forEach(i -> event.accept(i.get()));
            if (event.getTabKey() == CreativeModeTabs.BUILDING_BLOCKS) blockItems.forEach(i -> event.accept(i.get()));
        });
    }

    private static double clamp(double[] v, int i, double fallback) {
        double x = v != null && v.length > i ? v[i] : fallback;
        return Math.max(0, Math.min(16, x));
    }
}
