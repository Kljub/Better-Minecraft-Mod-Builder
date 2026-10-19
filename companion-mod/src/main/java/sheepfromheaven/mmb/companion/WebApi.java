package sheepfromheaven.mmb.companion;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.function.Supplier;

/**
 * HTTP calls to the web UI (async — never on the server thread). Every request carries the user's
 * token as "Authorization: Bearer …"; errors come back as the web UI's {"error": "…"} message.
 */
final class WebApi {
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private WebApi() {}

    static final class ApiException extends RuntimeException {
        ApiException(String message) { super(message); }
    }

    static String base() {
        String url = CompanionConfig.SERVER_URL.get().trim();
        while (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        return url;
    }

    private static HttpRequest.Builder request(String path, Duration timeout) {
        String token = CompanionConfig.TOKEN.get().trim();
        if (token.isEmpty()) throw new ApiException("Not connected — run /mmb connect <url> <token> (token from the web UI: Settings → AI → Minecraft mod).");
        return HttpRequest.newBuilder(URI.create(base() + path))
                .timeout(timeout)
                .header("Authorization", "Bearer " + token)
                .header("User-Agent", "mmb-companion");
    }

    /** Builds the request lazily so a missing token / bad URL also arrives as a failed future. */
    private static CompletableFuture<JsonObject> send(Supplier<HttpRequest> build) {
        HttpRequest req;
        try {
            req = build.get();
        } catch (RuntimeException e) {
            return CompletableFuture.failedFuture(e);
        }
        return HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofString()).thenApply(res -> {
            JsonObject body;
            try {
                body = JsonParser.parseString(res.body()).getAsJsonObject();
            } catch (RuntimeException e) {
                throw new ApiException("HTTP " + res.statusCode() + " — is " + base() + " the MC Mod Builder web UI?");
            }
            if (res.statusCode() >= 300) throw new ApiException(body.has("error") ? body.get("error").getAsString() : "HTTP " + res.statusCode());
            return body;
        });
    }

    static CompletableFuture<JsonObject> ping() {
        return send(() -> request("/api/mod/ping", Duration.ofSeconds(15)).GET().build());
    }

    static CompletableFuture<JsonObject> generate(String prompt) {
        JsonObject body = new JsonObject();
        body.addProperty("prompt", prompt);
        body.addProperty("provider", CompanionConfig.PROVIDER.get());
        body.addProperty("model", CompanionConfig.MODEL.get());
        body.addProperty("maxSize", CompanionConfig.MAX_SIZE.get());
        if (!CompanionConfig.PROJECT.get().isBlank()) body.addProperty("project", CompanionConfig.PROJECT.get().trim());
        return send(() -> request("/api/mod/structures/generate", Duration.ofMinutes(12))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                .build());
    }

    /** @param parent id of the /mmb generate run this is the placed result of, or 0 */
    static CompletableFuture<JsonObject> upload(String name, byte[] nbt, long parent) {
        StringBuilder q = new StringBuilder("?name=").append(URLEncoder.encode(name, StandardCharsets.UTF_8));
        if (parent > 0) q.append("&parent=").append(parent);
        if (!CompanionConfig.PROJECT.get().isBlank()) q.append("&project=").append(URLEncoder.encode(CompanionConfig.PROJECT.get().trim(), StandardCharsets.UTF_8));
        return send(() -> request("/api/mod/structures/upload" + q, Duration.ofMinutes(2))
                .header("Content-Type", "application/octet-stream")
                .POST(HttpRequest.BodyPublishers.ofByteArray(nbt))
                .build());
    }
}
