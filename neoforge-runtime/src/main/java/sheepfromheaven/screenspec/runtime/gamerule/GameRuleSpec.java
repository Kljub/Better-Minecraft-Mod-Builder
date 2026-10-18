package sheepfromheaven.screenspec.runtime.gamerule;

/**
 * Mirrors the "gameRule" element exported by the MC Screen Designer web tool (see {@code
 * webapp/lib/elements/modKinds.ts}). Field names and JSON shape must stay in sync with that file.
 */
public final class GameRuleSpec {
    /** registry path — the rule is {@code <modid>:<id>} in {@code /gamerule} */
    public String id;
    /** {@code "boolean" | "integer"} */
    public String type = "boolean";
    /** vanilla category id: player, mobs, spawning, drops, updates, chat, misc */
    public String category = "misc";
    public boolean defaultBoolean;
    public int defaultInteger;
    public int min = Integer.MIN_VALUE;
    public int max = Integer.MAX_VALUE;
}
