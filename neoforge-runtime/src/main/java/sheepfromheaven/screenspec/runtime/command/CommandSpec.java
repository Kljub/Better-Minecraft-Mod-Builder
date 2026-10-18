package sheepfromheaven.screenspec.runtime.command;

import java.util.Collections;
import java.util.List;

/**
 * Mirrors the "command" element exported by the MC Screen Designer web tool (see {@code
 * webapp/lib/elements/modKinds.ts}). Field names and JSON shape must stay in sync with that file.
 */
public final class CommandSpec {
    /** the literal typed after the slash, e.g. {@code "heal"} for {@code /heal} */
    public String id;
    /** 0 = everyone … 4 = server owner — vanilla's command permission levels */
    public int permissionLevel = 0;
    /** {@code "none" | "player" | "integer" | "text"} — one optional argument, substituted into
     * every command line as {@code $(arg)} */
    public String argument = "none";
    public String argumentName = "value";
    /** run the lines with at least {@link #permissionLevel} instead of the caller's own permissions
     * (e.g. so {@code /heal} can use {@code effect give} for non-op players) */
    public boolean elevate;
    /** vanilla command lines (no leading slash), run in order as the caller */
    public List<String> commands = Collections.emptyList();
    /** chat message shown to the caller afterwards; empty = none */
    public String feedback = "";
}
