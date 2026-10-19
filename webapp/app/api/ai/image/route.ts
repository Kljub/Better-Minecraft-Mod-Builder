import { guardRequest, runCodexImage } from "../cli";
import { withLinkedAccount } from "../linked";

/**
 * Codex Chat's `generate_image` tool: pictures from codex's built-in image generation (linked
 * Codex accounts from Settings → AI first, else the machine's own ChatGPT login). Returns PNG data
 * URLs; the chat shows them and only adds them to Resources when the user approves.
 * Dev server only, like the rest of the CLI integration.
 */
export async function POST(request: Request) {
  const refused = guardRequest(request);
  if (refused) return refused;
  let body: { prompt?: unknown; count?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 1000) : "";
  if (!prompt) return Response.json({ error: "Describe the image" }, { status: 400 });
  const count = Math.min(2, Math.max(1, Math.round(Number(body.count) || 1)));
  try {
    const pngs = await withLinkedAccount(request, "codex", (account) => runCodexImage(prompt, count, undefined, account));
    return Response.json({ images: pngs.map((b) => `data:image/png;base64,${b.toString("base64")}`) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
