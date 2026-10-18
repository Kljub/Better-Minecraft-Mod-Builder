package sheepfromheaven.screenspec.runtime.command;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.mojang.logging.LogUtils;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.server.permissions.Permission;
import net.minecraft.server.permissions.PermissionCheck;
import net.minecraft.server.permissions.PermissionLevel;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.RegisterCommandsEvent;
import org.slf4j.Logger;

import java.util.List;

/**
 * Registers {@link CommandSpec}s as real Brigadier commands on {@link RegisterCommandsEvent} — a
 * "macro" command: each configured vanilla command line is run in order through the server's
 * own dispatcher ({@code Commands#performPrefixedCommand}), as the player/source who typed it.
 * Internal — called only by {@link sheepfromheaven.screenspec.runtime.ModElements}.
 *
 * <p>Security: a free-text argument is never substituted into an {@link CommandSpec#elevate}d
 * command — the caller could otherwise inject arbitrary syntax ({@code "x run op me"}) that then
 * runs with permissions they don't have. The webapp refuses that combination; this re-checks it.
 */
public final class CommandSpecs {
    private static final Logger LOGGER = LogUtils.getLogger();

    private CommandSpecs() {}

    public static void register(String modId, List<CommandSpec> specs) {
        if (specs.isEmpty()) return;
        NeoForge.EVENT_BUS.addListener(RegisterCommandsEvent.class, event -> {
            for (CommandSpec spec : specs) {
                if (spec.id == null || !spec.id.matches("[a-z0-9_\\-]+")) {
                    LOGGER.warn("[screenspec] {}: skipping command with invalid name '{}'", modId, spec.id);
                    continue;
                }
                if (spec.elevate && "text".equals(spec.argument)) {
                    LOGGER.warn("[screenspec] {}: skipping /{} — a text argument can't be combined with elevated permissions", modId, spec.id);
                    continue;
                }
                registerOne(event.getDispatcher(), spec);
            }
        });
    }

    private static PermissionLevel level(CommandSpec spec) {
        return PermissionLevel.byId(Math.max(0, Math.min(4, spec.permissionLevel)));
    }

    private static void registerOne(CommandDispatcher<CommandSourceStack> dispatcher, CommandSpec spec) {
        PermissionLevel level = level(spec);
        LiteralArgumentBuilder<CommandSourceStack> root = Commands.literal(spec.id);
        if (level != PermissionLevel.ALL) {
            root.requires(Commands.hasPermission(new PermissionCheck.Require(new Permission.HasCommandLevel(level))));
        }
        String arg = spec.argumentName == null || spec.argumentName.isBlank() ? "value" : spec.argumentName;
        switch (spec.argument == null ? "none" : spec.argument) {
            case "player" -> root.then(Commands.argument(arg, EntityArgument.player())
                .executes(c -> run(c, spec, EntityArgument.getPlayer(c, arg).getScoreboardName())));
            case "integer" -> root.then(Commands.argument(arg, IntegerArgumentType.integer())
                .executes(c -> run(c, spec, Integer.toString(IntegerArgumentType.getInteger(c, arg)))));
            case "text" -> root.then(Commands.argument(arg, StringArgumentType.greedyString())
                .executes(c -> run(c, spec, StringArgumentType.getString(c, arg))));
            default -> root.executes(c -> run(c, spec, ""));
        }
        dispatcher.register(root);
    }

    private static int run(CommandContext<CommandSourceStack> context, CommandSpec spec, String argValue) throws CommandSyntaxException {
        CommandSourceStack source = context.getSource();
        if (spec.elevate) source = source.withMaximumPermission(LevelBasedPermissionSet.forLevel(level(spec)));
        // One line per command — strip newlines from the argument so it can't start a second one.
        String safeArg = argValue.replace('\n', ' ').replace('\r', ' ');
        for (String line : spec.commands) {
            String cmd = line.strip();
            if (cmd.isEmpty() || cmd.startsWith("#")) continue;
            if (cmd.startsWith("/")) cmd = cmd.substring(1);
            source.getServer().getCommands().performPrefixedCommand(source, cmd.replace("$(arg)", safeArg));
        }
        if (spec.feedback != null && !spec.feedback.isBlank()) {
            String msg = spec.feedback.replace("$(arg)", safeArg);
            context.getSource().sendSuccess(() -> Component.literal(msg), false);
        }
        return 1;
    }
}
