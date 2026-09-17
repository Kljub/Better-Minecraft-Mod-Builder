package sheepfromheaven.screenspec.runtime.block;

import sheepfromheaven.screenspec.runtime.GsonSpecIO;

import java.util.Arrays;
import java.util.List;

/** Reads {@code BlockSpec[]} JSON manifests exported by the MC Screen Designer web tool. */
public final class BlockSpecLoader {
    private BlockSpecLoader() {}

    /**
     * Reads {@code assets/<namespace>/screenspec/blocks.json} off the classpath — the manifest the
     * webapp's export bundle writes — or an empty list if this mod ships no blocks.
     */
    public static List<BlockSpec> fromClasspath(String namespace) {
        return Arrays.asList(GsonSpecIO.fromClasspath(namespace, "blocks", BlockSpec[].class));
    }
}
