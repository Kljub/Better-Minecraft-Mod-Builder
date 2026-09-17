package sheepfromheaven.screenspec.runtime.effect;

import sheepfromheaven.screenspec.runtime.GsonSpecIO;

import java.util.Arrays;
import java.util.List;

/** Reads {@code PotionSpec[]} JSON manifests exported by the MC Screen Designer web tool. */
public final class PotionSpecLoader {
    private PotionSpecLoader() {}

    /**
     * Reads {@code assets/<namespace>/screenspec/potions.json} off the classpath — the manifest
     * the webapp's export bundle writes — or an empty list if this mod defines no potions.
     */
    public static List<PotionSpec> fromClasspath(String namespace) {
        return Arrays.asList(GsonSpecIO.fromClasspath(namespace, "potions", PotionSpec[].class));
    }
}
