package sheepfromheaven.mmb.companion;

import net.neoforged.neoforge.common.ModConfigSpec;

/** config/mmb_companion-common.toml — also set in-game with {@code /mmb connect <url> <token>}. */
public final class CompanionConfig {
    private static final ModConfigSpec.Builder BUILDER = new ModConfigSpec.Builder();

    public static final ModConfigSpec.ConfigValue<String> SERVER_URL = BUILDER
            .comment("The web UI's address, e.g. http://192.168.1.20:3000 or https://modbuilder.example.com")
            .define("serverUrl", "http://localhost:3000");
    public static final ModConfigSpec.ConfigValue<String> TOKEN = BUILDER
            .comment("API token from the web UI: Settings → AI → Minecraft mod → Create token (starts with mmb_)")
            .define("token", "");
    public static final ModConfigSpec.ConfigValue<String> PROJECT = BUILDER
            .comment("Project key to send structures to; empty = whichever project is open in the editor")
            .define("project", "");
    public static final ModConfigSpec.ConfigValue<String> PROVIDER = BUILDER
            .comment("AI for /mmb generate: auto (Claude, then Codex), claude or codex")
            .define("provider", "auto");
    public static final ModConfigSpec.ConfigValue<String> MODEL = BUILDER
            .comment("Optional model name passed to the CLI (empty = its default)")
            .define("model", "");
    public static final ModConfigSpec.IntValue MAX_SIZE = BUILDER
            .comment("Largest width/length (x, z) of a generated structure, in blocks")
            .defineInRange("maxSize", 48, 4, MmbCommands.MAX_SIDE);
    public static final ModConfigSpec.IntValue MAX_HEIGHT = BUILDER
            .comment("Largest height (y) of a generated structure, in blocks")
            .defineInRange("maxHeight", 48, 4, MmbCommands.MAX_HEIGHT);

    public static final ModConfigSpec.BooleanValue ONLY_IN_BUILD_WORLD = BUILDER
            .comment("/mmb generate only works in the empty build world (/mmb world, /mmb leave) — the other worlds stay untouched")
            .define("onlyInBuildWorld", true);
    public static final ModConfigSpec.BooleanValue SPAWN_IN_BUILD_WORLD = BUILDER
            .comment("Players land on the build world's bedrock block when they join and when they respawn (a server just for AI building)")
            .define("spawnInBuildWorld", false);
    public static final ModConfigSpec.IntValue PERMISSION_LEVEL = BUILDER
            .comment("Who may use /mmb: 0 = every player (fine with onlyInBuildWorld on a server), 2 = operators (game masters), 4 = owners")
            .defineInRange("permissionLevel", 2, 0, 4);

    public static final ModConfigSpec SPEC = BUILDER.build();

    private CompanionConfig() {}
}
