package sheepfromheaven.screenspec.runtime.entity;

import sheepfromheaven.screenspec.runtime.GsonSpecIO;

import java.util.Arrays;
import java.util.List;

/** Reads {@code EntitySpec[]} JSON manifests exported by the MC Screen Designer web tool. */
public final class EntitySpecLoader {
    private EntitySpecLoader() {}

    /**
     * Reads {@code assets/<namespace>/screenspec/entities.json} off the classpath — the manifest
     * the webapp's export bundle writes — or an empty list if this mod ships no custom entities.
     */
    public static List<EntitySpec> fromClasspath(String namespace) {
        return Arrays.asList(GsonSpecIO.fromClasspath(namespace, "entities", EntitySpec[].class));
    }
}
