package sheepfromheaven.screenspec.runtime.attribute;

import sheepfromheaven.screenspec.runtime.GsonSpecIO;

import java.util.Arrays;
import java.util.List;

/** Reads {@code CustomAttributeSpec[]} JSON manifests exported by the MC Screen Designer web tool. */
public final class CustomAttributeSpecLoader {
    private CustomAttributeSpecLoader() {}

    /**
     * Reads {@code assets/<namespace>/screenspec/attributes.json} off the classpath — the
     * manifest the webapp's export bundle writes — or an empty list if this mod defines no custom
     * attributes.
     */
    public static List<CustomAttributeSpec> fromClasspath(String namespace) {
        return Arrays.asList(GsonSpecIO.fromClasspath(namespace, "attributes", CustomAttributeSpec[].class));
    }
}
