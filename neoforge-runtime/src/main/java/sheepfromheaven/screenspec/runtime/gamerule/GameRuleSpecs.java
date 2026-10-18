package sheepfromheaven.screenspec.runtime.gamerule;

import com.mojang.brigadier.arguments.BoolArgumentType;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.serialization.Codec;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.flag.FeatureFlagSet;
import net.minecraft.world.level.gamerules.GameRule;
import net.minecraft.world.level.gamerules.GameRuleCategory;
import net.minecraft.world.level.gamerules.GameRuleType;
import net.minecraft.world.level.gamerules.GameRuleTypeVisitor;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Registers {@link GameRuleSpec}s into this MC version's {@code minecraft:game_rule} registry
 * (game rules are registry entries since 1.21.11 — same constructor vanilla's own
 * {@code GameRules.registerBoolean/registerInteger} use). They then show up in {@code /gamerule
 * <modid>:<id>} and the world-creation Game Rules screen like any vanilla rule; lang keys
 * {@code gamerule.<modid>.<id>} (+ {@code .description}) come from the export bundle. Mod code
 * (or another element) reads a value with {@link #getBoolean}/{@link #getInteger}.
 */
public final class GameRuleSpecs {
    private static final Map<Identifier, DeferredHolder<GameRule<?>, ? extends GameRule<?>>> RULES = new HashMap<>();

    private GameRuleSpecs() {}

    public static void register(String modId, IEventBus modBus, List<GameRuleSpec> specs) {
        if (specs.isEmpty()) return;
        DeferredRegister<GameRule<?>> register = DeferredRegister.create(Registries.GAME_RULE, modId);
        for (GameRuleSpec spec : specs) {
            GameRuleCategory category = category(spec.category);
            DeferredHolder<GameRule<?>, ? extends GameRule<?>> holder = "integer".equals(spec.type)
                ? register.register(spec.id, () -> {
                    int min = Math.min(spec.min, spec.max);
                    int max = Math.max(spec.min, spec.max);
                    int def = Math.max(min, Math.min(max, spec.defaultInteger));
                    return new GameRule<>(category, GameRuleType.INT, IntegerArgumentType.integer(min, max),
                        GameRuleTypeVisitor::visitInteger, Codec.intRange(min, max), i -> i, def, FeatureFlagSet.of());
                })
                : register.register(spec.id, () -> new GameRule<>(category, GameRuleType.BOOL, BoolArgumentType.bool(),
                    GameRuleTypeVisitor::visitBoolean, Codec.BOOL, b -> b ? 1 : 0, spec.defaultBoolean, FeatureFlagSet.of()));
            RULES.put(Identifier.fromNamespaceAndPath(modId, spec.id), holder);
        }
        register.register(modBus);
    }

    private static GameRuleCategory category(String id) {
        return switch (id == null ? "misc" : id) {
            case "player" -> GameRuleCategory.PLAYER;
            case "mobs" -> GameRuleCategory.MOBS;
            case "spawning" -> GameRuleCategory.SPAWNING;
            case "drops" -> GameRuleCategory.DROPS;
            case "updates" -> GameRuleCategory.UPDATES;
            case "chat" -> GameRuleCategory.CHAT;
            default -> GameRuleCategory.MISC;
        };
    }

    /** Current value of a boolean rule this library registered, e.g. {@code getBoolean(server, "mymod", "allow_flying")}. */
    @SuppressWarnings("unchecked")
    public static boolean getBoolean(MinecraftServer server, String modId, String id) {
        var holder = RULES.get(Identifier.fromNamespaceAndPath(modId, id));
        if (holder == null) throw new IllegalArgumentException("No game rule " + modId + ":" + id);
        return server.getGameRules().get((GameRule<Boolean>) holder.get());
    }

    @SuppressWarnings("unchecked")
    public static int getInteger(MinecraftServer server, String modId, String id) {
        var holder = RULES.get(Identifier.fromNamespaceAndPath(modId, id));
        if (holder == null) throw new IllegalArgumentException("No game rule " + modId + ":" + id);
        return server.getGameRules().get((GameRule<Integer>) holder.get());
    }
}
