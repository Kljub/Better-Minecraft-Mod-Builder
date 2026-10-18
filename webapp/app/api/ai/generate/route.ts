import { guardRequest, runStructured, type CliProvider, type StructuredImage } from "../cli";
import { buildPrompt, buildTask } from "../tasks";
import { withLinkedAccount } from "../linked";

export async function POST(request: Request) {
  const refused = guardRequest(request);
  if (refused) return refused;

  let body: { provider?: unknown; model?: unknown; task?: unknown; prompt?: unknown; context?: unknown; images?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const provider = body.provider;
  if (provider !== "claude" && provider !== "codex" && provider !== "ollama") return Response.json({ error: "Unknown provider" }, { status: 400 });
  const model = typeof body.model === "string" ? body.model.trim() : "";
  // Model names go straight onto the CLI's argv (no shell) — still keep them to a sane charset,
  // and never starting with "-" so one can't be read as an extra flag.
  if (model && !/^[\w.:\/\[\]][\w.:\/\-\[\]]{0,127}$/.test(model)) return Response.json({ error: "Invalid model name" }, { status: 400 });
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 2000) : "";
  if (!prompt) return Response.json({ error: "Empty prompt" }, { status: 400 });
  const task = buildTask(body.task, body.context);
  if (!task) return Response.json({ error: "Unknown task" }, { status: 400 });
  // Optional labelled images (e.g. renders of a mesh to rig): PNG/JPEG/WebP, ≤ 8, ≤ 5 MB each.
  const images: StructuredImage[] = [];
  if (body.images != null) {
    if (!Array.isArray(body.images) || body.images.length > 8) return Response.json({ error: "At most 8 images" }, { status: 400 });
    for (const raw of body.images) {
      const r = (raw ?? {}) as { data?: unknown; label?: unknown };
      const m = typeof r.data === "string" ? /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(r.data) : null;
      if (!m || m[2].length > 7_000_000) return Response.json({ error: "Images must be PNG, JPEG or WebP data URLs up to 5 MB" }, { status: 400 });
      const label = typeof r.label === "string" ? r.label.replace(/[^\w ()/+.,:-]/g, "").slice(0, 120) : "";
      images.push({ mediaType: m[1], data: m[2], label });
    }
  }

  try {
    const fullPrompt = buildPrompt(String(body.task), prompt, body.context);
    const raw = provider === "ollama"
      ? await runStructured(provider, model, task.system, fullPrompt, task.schema, undefined, undefined, images)
      : await withLinkedAccount(request, provider, (account, onQuota) =>
        runStructured(provider as CliProvider, model, task.system, fullPrompt, task.schema, account, onQuota, images));
    return Response.json(task.validate(raw));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
