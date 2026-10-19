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
            .comment("Largest side of a generated structure, in blocks")
            .defineInRange("maxSize", 48, 4, 128);

    public static final ModConfigSpec SPEC = BUILDER.build();

    private CompanionConfig() {}
}
