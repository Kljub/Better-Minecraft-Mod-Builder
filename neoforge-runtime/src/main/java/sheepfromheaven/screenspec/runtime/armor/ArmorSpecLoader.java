package sheepfromheaven.screenspec.runtime.armor;

import sheepfromheaven.screenspec.runtime.GsonSpecIO;

import java.util.Arrays;
import java.util.List;

/** Reads {@code ArmorSpec[]} JSON manifests exported by the MC Screen Designer web tool. */
public final class ArmorSpecLoader {
    private ArmorSpecLoader() {}

    /**
     * Reads {@code assets/<namespace>/screenspec/armors.json} off the classpath — the manifest the
     * webapp's export bundle writes — or an empty list if this mod ships no armor sets.
     */
    public static List<ArmorSpec> fromClasspath(String namespace) {
        return Arrays.asList(GsonSpecIO.fromClasspath(namespace, "armors", ArmorSpec[].class));
    }
}
