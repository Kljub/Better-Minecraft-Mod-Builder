package sheepfromheaven.screenspec;

import net.minecraft.network.chat.Component;
import net.minecraft.world.SimpleMenuProvider;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.ModList;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import sheepfromheaven.screenspec.runtime.ModContent;
import sheepfromheaven.screenspec.runtime.armor.ArmorSpec;
import sheepfromheaven.screenspec.runtime.armor.ArmorSpecLoader;
import sheepfromheaven.screenspec.runtime.attribute.CustomAttributeSpec;
import sheepfromheaven.screenspec.runtime.attribute.CustomAttributeSpecLoader;
import sheepfromheaven.screenspec.runtime.block.BlockSpec;
import sheepfromheaven.screenspec.runtime.block.BlockSpecLoader;
import sheepfromheaven.screenspec.runtime.effect.EffectSpec;
import sheepfromheaven.screenspec.runtime.effect.EffectSpecLoader;
import sheepfromheaven.screenspec.runtime.effect.PotionSpec;
import sheepfromheaven.screenspec.runtime.effect.PotionSpecLoader;
import sheepfromheaven.screenspec.runtime.entity.EntitySpec;
import sheepfromheaven.screenspec.runtime.entity.EntitySpecLoader;
import sheepfromheaven.screenspec.runtime.entity.EntitySpecs;
import sheepfromheaven.screenspec.runtime.item.ItemSpec;
import sheepfromheaven.screenspec.runtime.item.ItemSpecLoader;
import sheepfromheaven.screenspec.test.ModMenuTypes;
import sheepfromheaven.screenspec.test.OpenTestContainerPayload;
import sheepfromheaven.screenspec.test.TestClientSetup;
import sheepfromheaven.screenspec.test.TestContainerMenu;

import java.util.List;

@Mod("screenspec")
public class ScreenSpecMod {

    public ScreenSpecMod(IEventBus modBus, ModContainer modContainer) {
        ModMenuTypes.register(modBus);
        modBus.addListener(ScreenSpecMod::registerPayloads);
        registerExportedContent(modBus);
        if (FMLEnvironment.getDist() == Dist.CLIENT) {
            TestClientSetup.register(modBus);
        }
    }

    /**
     * Auto-discovers and registers any Item/Block content a loaded mod exported from the MC
     * Screen Designer web tool — a mod author using the tool never writes Java for this: export a
     * project, drop the resulting {@code assets/<modid>/...} files into their mod's resources, and
     * this runs for them at mod-construction time. Runs unconditionally on both dist (not gated
     * behind {@code Dist.CLIENT}) since item/block registries must be populated identically on a
     * dedicated server — see {@code neoforge.mods.toml}'s dependency {@code side}, which had to
     * move off {@code CLIENT} for the same reason.
     */
    private static void registerExportedContent(IEventBus modBus) {
        for (var modInfo : ModList.get().getMods()) {
            String namespace = modInfo.getModId();
            List<ItemSpec> items = ItemSpecLoader.fromClasspath(namespace);
            List<BlockSpec> blocks = BlockSpecLoader.fromClasspath(namespace);
            List<CustomAttributeSpec> customAttributes = CustomAttributeSpecLoader.fromClasspath(namespace);
            List<EffectSpec> effects = EffectSpecLoader.fromClasspath(namespace);
            List<PotionSpec> potions = PotionSpecLoader.fromClasspath(namespace);
            List<ArmorSpec> armors = ArmorSpecLoader.fromClasspath(namespace);
            List<EntitySpec> entities = EntitySpecLoader.fromClasspath(namespace);
            if (items.isEmpty() && blocks.isEmpty() && customAttributes.isEmpty() && effects.isEmpty()
                    && potions.isEmpty() && armors.isEmpty() && entities.isEmpty()) continue;
            ModContent.register(namespace, modBus, items, blocks, customAttributes, effects, potions, armors, entities);
            if (FMLEnvironment.getDist() == Dist.CLIENT && !entities.isEmpty()) {
                EntitySpecs.registerRenderers(modBus, namespace, entities);
            }
        }
    }

    private static void registerPayloads(RegisterPayloadHandlersEvent event) {
        event.registrar("1").playToServer(
            OpenTestContainerPayload.TYPE,
            OpenTestContainerPayload.CODEC,
            (payload, context) -> context.enqueueWork(() -> context.player().openMenu(new SimpleMenuProvider(
                (id, inv, player) -> new TestContainerMenu(id, inv, TestContainerMenu.demoContainerA(), TestContainerMenu.demoContainerB()),
                Component.literal("ScreenSpec Test")
            )))
        );
    }
}
