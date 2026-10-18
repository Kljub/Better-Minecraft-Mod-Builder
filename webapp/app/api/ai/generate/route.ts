import { guardRequest, runStructured, type CliProvider } from "../cli";
import { buildPrompt, buildTask } from "../tasks";

export async function POST(request: Request) {
  const refused = guardRequest(request);
  if (refused) return refused;

  let body: { provider?: unknown; model?: unknown; task?: unknown; prompt?: unknown; context?: unknown };
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

  try {
    const raw = await runStructured(provider as CliProvider, model, task.system, buildPrompt(String(body.task), prompt, body.context), task.schema);
    return Response.json(task.validate(raw));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
