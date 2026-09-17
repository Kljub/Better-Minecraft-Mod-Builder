package sheepfromheaven.screenspec.runtime;

import com.google.gson.Gson;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.lang.reflect.Array;
import java.nio.charset.StandardCharsets;

/**
 * Shared classpath-array-loading helper for the {@code *SpecLoader} classes ({@code
 * ItemSpecLoader}, {@code BlockSpecLoader}, ...) — mirrors {@link ScreenSpecLoader}'s {@code
 * fromClasspath} approach, generalized to an array type since those manifests are JSON arrays
 * rather than a single object.
 *
 * <p>Only classpath loading is provided here: item/block registration must happen synchronously
 * during mod construction, before NeoForge's {@code RegisterEvent} fires and before any {@code
 * ResourceManager} exists — see {@link ScreenSpecLoader#fromClasspath} for the same constraint.
 */
public final class GsonSpecIO {
    private static final Gson GSON = new Gson();

    private GsonSpecIO() {}

    /**
     * Reads {@code assets/<namespace>/screenspec/<name>.json} off the classpath as a JSON array of
     * {@code arrayType}'s component type, or returns an empty array if that mod doesn't ship this
     * manifest (most mods won't — items/blocks are opt-in, unlike screens).
     */
    public static <T> T[] fromClasspath(String namespace, String name, Class<T[]> arrayType) {
        String path = "assets/" + namespace + "/screenspec/" + name + ".json";
        try (InputStream in = GsonSpecIO.class.getClassLoader().getResourceAsStream(path)) {
            if (in == null) return emptyArray(arrayType);
            try (Reader reader = new InputStreamReader(in, StandardCharsets.UTF_8)) {
                T[] result = GSON.fromJson(reader, arrayType);
                return result != null ? result : emptyArray(arrayType);
            }
        } catch (IOException e) {
            throw new IllegalArgumentException("Failed to read spec resource at " + path, e);
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> T[] emptyArray(Class<T[]> arrayType) {
        return (T[]) Array.newInstance(arrayType.getComponentType(), 0);
    }
}
