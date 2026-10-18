import { guardRequest, runCodexImage } from "../../ai/cli";
import { withLinkedAccount } from "../../ai/linked";

/**
 * Screen GUI Generator, "Codex" engine: GUI textures from codex's built-in image generation
 * (the user's linked Codex accounts from Settings → AI, else the ChatGPT login of the machine running
 * the dev server). Returns the full-size PNGs; the browser
 * fits them to the target size. Dev server only, like the rest of the CLI integration.
 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const refused = guardRequest(request);
  if (refused) return refused;
  let body: { prompt?: unknown; count?: unknown; image?: unknown; width?: unknown; height?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 600) : "";
  if (!prompt) return Response.json({ error: "Describe the style" }, { status: 400 });
  const count = Math.min(2, Math.max(1, Math.round(Number(body.count) || 1)));
  const width = Math.min(512, Math.max(16, Math.round(Number(body.width) || 176)));
  const height = Math.min(512, Math.max(16, Math.round(Number(body.height) || 166)));

  let image: Buffer | undefined;
  if (typeof body.image === "string") {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(body.image);
    if (!m) return Response.json({ error: "Base image must be a PNG data URL" }, { status: 400 });
    image = Buffer.from(m[1], "base64");
    if (image.length > MAX_IMAGE_BYTES) return Response.json({ error: "Base image is too large" }, { status: 400 });
  }

  const style = "flat 2D Minecraft-style GUI texture, crisp pixel art with clean beveled borders, no text, no perspective";
  const full = image
    ? `restyle it as ${prompt}. Keep the exact layout, proportions, slot positions and outline of the original; only change materials, colours and shading. ${style}.`
    : `a Minecraft GUI panel background, ${prompt}, aspect ratio ${width}:${height}, empty interior space for UI elements, fully opaque with no transparent or see-through areas, ${style}.`;
  try {
    // Linked Codex accounts first (queue + failover at a limit); none = the server's own login.
    const pngs = await withLinkedAccount(request, "codex", (account) => runCodexImage(full, count, image, account));
    return Response.json({ images: pngs.map((b, i) => ({ name: `codex_${i}.png`, dataUrl: `data:image/png;base64,${b.toString("base64")}` })) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
