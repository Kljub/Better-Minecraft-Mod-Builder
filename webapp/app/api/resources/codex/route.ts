import { guardRequest, runCodexImage } from "../../ai/cli";
import { withLinkedAccount } from "../../ai/linked";

/**
 * Resources tab, "Remake folder with AI": redraws one existing texture with codex's built-in image
 * generation (linked Codex accounts from Settings → AI first, else the machine's own ChatGPT login).
 * Returns the full-size PNG; the browser fits it back to the original's size and transparency.
 * Dev server only, like the rest of the CLI integration.
 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const refused = guardRequest(request);
  if (refused) return refused;
  let body: { image?: unknown; prompt?: unknown; name?: unknown; width?: unknown; height?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const m = typeof body.image === "string" ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(body.image) : null;
  if (!m) return Response.json({ error: "Image must be a PNG data URL" }, { status: 400 });
  const image = Buffer.from(m[1], "base64");
  if (image.length > MAX_IMAGE_BYTES) return Response.json({ error: "Image is too large" }, { status: 400 });

  const instruction = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 600) : "";
  const name = typeof body.name === "string" ? body.name.replace(/[^\w .-]/g, " ").trim().slice(0, 80) : "";
  const width = Math.min(4096, Math.max(1, Math.round(Number(body.width) || 16)));
  const height = Math.min(4096, Math.max(1, Math.round(Number(body.height) || 16)));

  const full = [
    `redraw this Minecraft texture${name ? ` ("${name}")` : ""} as a new, higher-quality version.`,
    instruction ? `Change: ${instruction}.` : "",
    `Keep the same subject, silhouette, layout, framing and ${width}:${height} proportions, and keep empty/transparent areas empty.`,
    "Flat 2D Minecraft-style pixel art, crisp edges, no text, no perspective, no extra background.",
  ].filter(Boolean).join(" ");
  try {
    // Linked Codex accounts first (queue + failover at a limit); none = the server's own login.
    const [png] = await withLinkedAccount(request, "codex", (account) => runCodexImage(full, 1, image, account));
    if (!png) return Response.json({ error: "Codex returned no image" }, { status: 502 });
    return Response.json({ dataUrl: `data:image/png;base64,${png.toString("base64")}` });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
