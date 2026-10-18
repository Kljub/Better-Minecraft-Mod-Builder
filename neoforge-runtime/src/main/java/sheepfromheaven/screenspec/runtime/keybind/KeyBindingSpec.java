package sheepfromheaven.screenspec.runtime.keybind;

/**
 * Mirrors the "keyBinding" element exported by the MC Screen Designer web tool (see {@code
 * webapp/lib/elements/modKinds.ts}). Field names and JSON shape must stay in sync with that file.
 */
public final class KeyBindingSpec {
    /** lang key {@code key.<modid>.<id>} is the name in Options → Controls */
    public String id;
    /** vanilla key name, e.g. {@code "key.keyboard.g"} or {@code "key.mouse.4"}; players can rebind it */
    public String defaultKey = "key.keyboard.unknown";
    /** {@code "command"} — sends {@link #command} as the player (normal permissions);
     * {@code "screen"} — opens this mod's exported screen {@link #screen} */
    public String action = "command";
    public String command = "";
    public String screen = "";
}
