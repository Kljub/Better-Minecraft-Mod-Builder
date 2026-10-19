package sheepfromheaven.mmb.companion;

import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.config.ModConfig;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.RegisterCommandsEvent;

/**
 * Companion mod for the MC Mod Builder web UI: {@code /mmb generate <prompt>} asks the web UI
 * (by domain / IP, see {@link CompanionConfig}) to design a structure with Claude or Codex, places
 * it in front of the player and uploads the structure template (.nbt) to the user's account, where
 * the open project picks it up in its Structures tab.
 */
@Mod(CompanionMod.MOD_ID)
public final class CompanionMod {
    public static final String MOD_ID = "mmb_companion";

    public CompanionMod(IEventBus modBus, ModContainer container) {
        container.registerConfig(ModConfig.Type.COMMON, CompanionConfig.SPEC);
        NeoForge.EVENT_BUS.addListener((RegisterCommandsEvent e) -> MmbCommands.register(e.getDispatcher()));
    }
}
