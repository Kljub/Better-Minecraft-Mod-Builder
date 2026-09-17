package sheepfromheaven.screenspec.runtime.item;

import sheepfromheaven.screenspec.runtime.GsonSpecIO;

import java.util.Arrays;
import java.util.List;

/** Reads {@code ItemSpec[]} JSON manifests exported by the MC Screen Designer web tool. */
public final class ItemSpecLoader {
    private ItemSpecLoader() {}

    /**
     * Reads {@code assets/<namespace>/screenspec/items.json} off the classpath — the manifest the
     * webapp's export bundle writes — or an empty list if this mod ships no items.
     */
    public static List<ItemSpec> fromClasspath(String namespace) {
        return Arrays.asList(GsonSpecIO.fromClasspath(namespace, "items", ItemSpec[].class));
    }
}
