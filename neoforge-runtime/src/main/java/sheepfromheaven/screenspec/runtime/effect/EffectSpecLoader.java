package sheepfromheaven.screenspec.runtime.effect;

import sheepfromheaven.screenspec.runtime.GsonSpecIO;

import java.util.Arrays;
import java.util.List;

/** Reads {@code EffectSpec[]} JSON manifests exported by the MC Screen Designer web tool. */
public final class EffectSpecLoader {
    private EffectSpecLoader() {}

    /**
     * Reads {@code assets/<namespace>/screenspec/effects.json} off the classpath — the manifest
     * the webapp's export bundle writes — or an empty list if this mod defines no custom effects.
     */
    public static List<EffectSpec> fromClasspath(String namespace) {
        return Arrays.asList(GsonSpecIO.fromClasspath(namespace, "effects", EffectSpec[].class));
    }
}
