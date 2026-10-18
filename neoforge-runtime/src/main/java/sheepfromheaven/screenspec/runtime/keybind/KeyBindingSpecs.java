package sheepfromheaven.screenspec.runtime.keybind;

import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.loading.FMLEnvironment;

import java.util.List;

/**
 * Key bindings are client-only — on a dedicated server this is a no-op; see
 * {@link KeyBindingSpecsClient}. Internal — called by
 * {@link sheepfromheaven.screenspec.runtime.ModElements}.
 */
public final class KeyBindingSpecs {
    private KeyBindingSpecs() {}

    public static void register(String modId, IEventBus modBus, List<KeyBindingSpec> specs) {
        if (specs.isEmpty() || FMLEnvironment.getDist() != Dist.CLIENT) return;
        KeyBindingSpecsClient.register(modId, modBus, specs);
    }
}
