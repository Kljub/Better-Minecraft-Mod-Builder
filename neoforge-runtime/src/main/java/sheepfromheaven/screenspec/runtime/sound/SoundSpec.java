package sheepfromheaven.screenspec.runtime.sound;

/**
 * Mirrors the "sound" element exported by the MC Screen Designer web tool (see
 * {@code webapp/lib/elements/soundKind.ts}). The .ogg and the sounds.json entry are plain resources;
 * this only registers the SoundEvent so code and other elements can refer to "<modid>:<id>".
 */
public final class SoundSpec {
    public String id;
    /** volume slider category the mod should play it under (informational for callers) */
    public String category = "neutral";
    /** hearing distance in blocks; 16 = vanilla's variable range */
    public int range = 16;
}
