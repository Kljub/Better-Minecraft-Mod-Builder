import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";

/**
 * The companion mod's jars as built in this monorepo (companion-mod/build/<mc>/libs,
 * `./gradlew build` and `./gradlew build -Pmc=1.21.1`). GET lists them; GET ?mc=<version> downloads one.
 */
const ROOT = join(process.cwd(), "..", "companion-mod", "build");
const VERSIONS = ["26.2", "1.21.1"];

async function jarFor(mc: string): Promise<{ file: string; size: number } | null> {
  try {
    const dir = join(ROOT, mc, "libs");
    const file = (await readdir(dir)).filter((f) => f.startsWith("mmb-companion-") && f.endsWith(`+mc${mc}.jar`)).sort().pop();
    return file ? { file, size: (await stat(join(dir, file))).size } : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const mc = new URL(request.url).searchParams.get("mc");
  if (!mc) {
    const builds = await Promise.all(VERSIONS.map(async (v) => ({ mc: v, jar: await jarFor(v) })));
    return Response.json({ versions: builds.map((b) => ({ mc: b.mc, file: b.jar?.file ?? null, size: b.jar?.size ?? 0 })) });
  }
  if (!VERSIONS.includes(mc)) return Response.json({ error: `Unknown Minecraft version ${mc}` }, { status: 400 });
  const jar = await jarFor(mc);
  if (!jar) return Response.json({ error: `Not built for ${mc} yet — run ./gradlew build${mc === "26.2" ? "" : ` -Pmc=${mc}`} in companion-mod/` }, { status: 404 });
  const bytes = await readFile(join(ROOT, mc, "libs", jar.file));
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/java-archive",
      "content-disposition": `attachment; filename="${jar.file}"`,
      "cache-control": "no-store",
    },
  });
}
