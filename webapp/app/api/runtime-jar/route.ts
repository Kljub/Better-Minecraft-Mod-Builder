import { readFile } from "fs/promises";
import { join } from "path";

/**
 * GET ?mc=<version>: the neoforge-runtime jar that "Build mod (.jar)" nests into a mod (Jar-in-Jar)
 * — the monorepo's own build (neoforge-runtime/build/libs, `./gradlew jar`), only when it targets
 * the requested Minecraft version. 404 otherwise: the mod is then built without it and needs the
 * ScreenSpec runtime installed next to it.
 */
const RUNTIME_ROOT = join(process.cwd(), "..", "neoforge-runtime");

export async function GET(request: Request) {
  const mc = new URL(request.url).searchParams.get("mc") ?? "";
  try {
    const props = Object.fromEntries((await readFile(join(RUNTIME_ROOT, "gradle.properties"), "utf8"))
      .split(/\r?\n/).filter((l) => /^\s*[\w.]+\s*=/.test(l)).map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }));
    const minecraft = props.minecraft_version, version = props.mod_version, artifact = props.artifact_id;
    if (!minecraft || !version || !artifact) return Response.json({ error: "Runtime not configured" }, { status: 404 });
    if (mc && mc !== minecraft) return Response.json({ error: `Runtime is built for Minecraft ${minecraft}, not ${mc}` }, { status: 404 });
    const bytes = await readFile(join(RUNTIME_ROOT, "build", "libs", `${artifact}-${version}.jar`));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/java-archive",
        "cache-control": "no-store",
        "x-runtime-version": version,
        "x-minecraft-version": minecraft,
      },
    });
  } catch {
    return Response.json({ error: "Runtime jar not built — run ./gradlew jar in neoforge-runtime" }, { status: 404 });
  }
}
