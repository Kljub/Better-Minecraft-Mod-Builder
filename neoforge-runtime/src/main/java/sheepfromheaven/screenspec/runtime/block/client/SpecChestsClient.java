package sheepfromheaven.screenspec.runtime.block.client;

import net.minecraft.client.renderer.Sheets;
import net.minecraft.client.renderer.blockentity.ChestRenderer;
import net.minecraft.client.renderer.blockentity.state.ChestRenderState;
import net.minecraft.client.resources.model.sprite.SpriteId;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;
import sheepfromheaven.screenspec.runtime.block.SpecChestBlockEntity;

import java.util.function.Supplier;

/**
 * Draws chest blocks with their own skin: the exported textures/entity/chest/&lt;id&gt;.png of the
 * block's namespace (the chests atlas collects that folder from every namespace).
 */
public final class SpecChestsClient {
    private SpecChestsClient() {}

    public static void register(IEventBus modBus, Supplier<BlockEntityType<SpecChestBlockEntity>> type) {
        modBus.addListener(EntityRenderersEvent.RegisterRenderers.class, event ->
            event.registerBlockEntityRenderer(type.get(), context -> new ChestRenderer<SpecChestBlockEntity>(context) {
                @Override
                protected SpriteId getCustomSprite(SpecChestBlockEntity blockEntity, ChestRenderState state) {
                    return Sheets.CHEST_MAPPER.apply(BuiltInRegistries.BLOCK.getKey(blockEntity.getBlockState().getBlock()));
                }
            }));
    }
}
