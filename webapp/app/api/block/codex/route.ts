import { guardRequest, runCodexImage } from "../../ai/cli";
import { withLinkedAccount } from "../../ai/linked";

/**
 * Block Generator, "Codex" engine: block textures from codex's built-in image generation (the
 * user's linked Codex accounts from Settings → AI, else the ChatGPT login of the machine running the
 * dev server). Returns the full-size PNGs; the browser downscales them to the chosen block size.
 * Dev server only, like the rest of the CLI integration.
 */
export async function POST(request: Request) {
  const refused = guardRequest(request);
  if (refused) return refused;
  let body: { prompt?: unknown; count?: unknown; size?: unknown; tileable?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 600) : "";
  if (!prompt) return Response.json({ error: "Describe the block" }, { status: 400 });
  const count = Math.min(2, Math.max(1, Math.round(Number(body.count) || 1)));
  const size = Math.min(256, Math.max(16, Math.round(Number(body.size) || 16)));

  // a 16px texture needs a coarse, readable pixel grid; bigger sizes can carry more detail
  const grid = size <= 32
    ? `drawn on an exact ${size}×${size} pixel grid with large square pixels, vanilla Minecraft pixel-art look`
    : `detailed hand-painted Minecraft resource-pack texture for a ${size}×${size} pack`;
  const tile = body.tileable === false ? "" : " Seamlessly tileable: the left/right and top/bottom edges must continue into each other with no border, frame or vignette.";
  const full = `a single square Minecraft block face texture of ${prompt}, ${grid}, flat front-on view filling the whole square, no perspective, no 3D cube, no lighting gradient, no text, no background, fully opaque.${tile}`;
  try {
    // Linked Codex accounts first (queue + failover at a limit); none = the server's own login.
    const pngs = await withLinkedAccount(request, "codex", (account) => runCodexImage(full, count, undefined, account));
    return Response.json({ images: pngs.map((b, i) => ({ name: `codex_${i}.png`, dataUrl: `data:image/png;base64,${b.toString("base64")}` })) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
