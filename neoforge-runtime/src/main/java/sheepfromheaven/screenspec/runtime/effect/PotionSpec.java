package sheepfromheaven.screenspec.runtime.effect;

import java.util.Collections;
import java.util.List;

/**
 * Mirrors the {@code PotionSpec} shape exported by the MC Screen Designer web tool (see {@code
 * webapp/lib/types.ts}) — a named bundle of effect instances (a brewable potion "kind"). Registers
 * the {@code Potion} definition itself; wiring an actual brewing-stand recipe to produce it is out
 * of scope for now (part of the separate, later Crafting Recipes phase).
 */
public final class PotionSpec {
    public String id;
    public String modId;
    public String displayName;
    public List<PotionEffectEntry> effects = Collections.emptyList();
}
