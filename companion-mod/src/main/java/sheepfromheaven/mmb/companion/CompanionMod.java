package sheepfromheaven.mmb.companion;

import com.mojang.logging.LogUtils;
import net.neoforged.bus.api.IEventBus;
import org.slf4j.Logger;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.config.ModConfig;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.RegisterCommandsEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;

/**
 * Companion mod for the MC Mod Builder web UI: {@code /mmb generate <prompt>} asks the web UI
 * (by domain / IP, see {@link CompanionConfig}) to design a structure with Claude or Codex, places
 * it in front of the player and uploads the structure template (.nbt) to the user's account, where
 * the open project picks it up in its Structures tab.
 */
@Mod(CompanionMod.MOD_ID)
public final class CompanionMod {
    public static final String MOD_ID = "mmb_companion";
    static final Logger LOGGER = LogUtils.getLogger();

    private static void spawnInBuildWorld(Player player) {
        if (CompanionConfig.SPAWN_IN_BUILD_WORLD.get() && player instanceof ServerPlayer p) MmbCommands.toBuildWorld(p);
    }

    public CompanionMod(IEventBus modBus, ModContainer container) {
        container.registerConfig(ModConfig.Type.COMMON, CompanionConfig.SPEC);
        NeoForge.EVENT_BUS.addListener((RegisterCommandsEvent e) -> MmbCommands.register(e.getDispatcher()));
        NeoForge.EVENT_BUS.addListener((ServerTickEvent.Post e) -> BuildJob.tick(e.getServer()));
        NeoForge.EVENT_BUS.addListener((PlayerEvent.PlayerLoggedInEvent e) -> spawnInBuildWorld(e.getEntity()));
        NeoForge.EVENT_BUS.addListener((PlayerEvent.PlayerRespawnEvent e) -> spawnInBuildWorld(e.getEntity()));
    }
}
