package sheepfromheaven.screenspec.runtime.keybind;

import com.mojang.blaze3d.platform.InputConstants;
import com.mojang.logging.LogUtils;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.RegisterKeyMappingsEvent;
import net.neoforged.neoforge.common.NeoForge;
import org.slf4j.Logger;
import sheepfromheaven.screenspec.runtime.ScreenSpec;
import sheepfromheaven.screenspec.runtime.ScreenSpecLoader;
import sheepfromheaven.screenspec.runtime.SpecScreen;

import java.util.ArrayList;
import java.util.List;

/**
 * Registers one {@link KeyMapping} per {@link KeyBindingSpec} under a "<modid>" category in
 * Options → Controls, and polls them each client tick ({@code consumeClick}, the vanilla pattern).
 * A command action goes through {@code ClientPacketListener#sendCommand} — exactly as if the player
 * typed it, so the server applies the player's own permissions. A screen action opens the mod's
 * exported plain screen; container screens need the server to open a menu and aren't supported here.
 */
final class KeyBindingSpecsClient {
    private static final Logger LOGGER = LogUtils.getLogger();

    private KeyBindingSpecsClient() {}

    private record Bound(KeyBindingSpec spec, KeyMapping mapping) {}

    static void register(String modId, IEventBus modBus, List<KeyBindingSpec> specs) {
        KeyMapping.Category category = new KeyMapping.Category(Identifier.fromNamespaceAndPath(modId, "keys"));
        List<Bound> bound = new ArrayList<>();
        for (KeyBindingSpec spec : specs) {
            InputConstants.Key key;
            try {
                key = InputConstants.getKey(spec.defaultKey == null ? "key.keyboard.unknown" : spec.defaultKey);
            } catch (IllegalArgumentException e) {
                LOGGER.warn("[screenspec] {}: key binding '{}' has unknown default key '{}'", modId, spec.id, spec.defaultKey);
                key = InputConstants.UNKNOWN;
            }
            bound.add(new Bound(spec, new KeyMapping("key." + modId + "." + spec.id, key.getType(), key.getValue(), category)));
        }
        modBus.addListener(RegisterKeyMappingsEvent.class, event -> {
            event.registerCategory(category);
            for (Bound b : bound) event.register(b.mapping());
        });
        NeoForge.EVENT_BUS.addListener(ClientTickEvent.Post.class, event -> {
            Minecraft mc = Minecraft.getInstance();
            if (mc.player == null) return;
            for (Bound b : bound) {
                while (b.mapping().consumeClick()) run(mc, modId, b.spec());
            }
        });
    }

    private static void run(Minecraft mc, String modId, KeyBindingSpec spec) {
        if ("screen".equals(spec.action)) {
            ScreenSpec screen;
            try {
                screen = ScreenSpecLoader.fromResource(mc.getResourceManager(), modId, spec.screen);
            } catch (RuntimeException e) {
                mc.player.sendSystemMessage(Component.literal("[" + modId + "] screen '" + spec.screen + "' not found"));
                return;
            }
            if (screen.container != null) {
                mc.player.sendSystemMessage(Component.literal("[" + modId + "] '" + spec.screen + "' has inventory slots and must be opened by the server"));
                return;
            }
            mc.gui.setScreen(new SpecScreen(Component.literal(spec.screen), screen) {});
            return;
        }
        String cmd = spec.command == null ? "" : spec.command.strip();
        if (cmd.startsWith("/")) cmd = cmd.substring(1);
        if (!cmd.isEmpty()) mc.player.connection.sendCommand(cmd);
    }
}
