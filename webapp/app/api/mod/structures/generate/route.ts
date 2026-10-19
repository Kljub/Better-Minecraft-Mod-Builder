import type { ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/server/db";
import { requireModUser } from "@/lib/server/modTokens";
import { guardRequest, runStructured } from "@/app/api/ai/cli";
import { withUserAccount } from "@/app/api/ai/linked";
import {
  MAX_SIZE, STRUCTURE_SCHEMA, STRUCTURE_SYSTEM, expandStructure, structurePrompt, validateAiStructure,
} from "@/lib/structureAi";

/**
 * Companion mod: "/mmb generate <prompt>" — Claude or Codex (the user's linked accounts, see
 * Settings → AI) designs a structure; the expanded block list goes back to the mod, which places it
 * and uploads the resulting .nbt (…/upload?parent=<id>). Prompt, raw AI answer and blocks are kept in
 * mmb_structures as training data.
 */
const TIMEOUT_MS = 600_000;

export async function POST(request: Request) {
  const refused = guardRequest(request);
  if (refused) return refused;
  const user = await requireModUser(request);
  if (user instanceof Response) return user;

  let body: { prompt?: unknown; provider?: unknown; model?: unknown; maxSize?: unknown; project?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 2000) : "";
  if (!prompt) return Response.json({ error: "Empty prompt" }, { status: 400 });
  const provider = body.provider ?? "auto";
  if (provider !== "claude" && provider !== "codex" && provider !== "auto") return Response.json({ error: "provider must be claude, codex or auto" }, { status: 400 });
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (model && !/^[\w.:\/\[\]][\w.:\/\-\[\]]{0,127}$/.test(model)) return Response.json({ error: "Invalid model name" }, { status: 400 });
  const maxSize = typeof body.maxSize === "number" && Number.isFinite(body.maxSize) ? Math.min(MAX_SIZE, Math.max(4, Math.round(body.maxSize))) : MAX_SIZE;
  const project = typeof body.project === "string" && body.project.trim() ? body.project.trim().slice(0, 128) : null;

  const started = Date.now();
  const errors: string[] = [];
  const providers: ("claude" | "codex")[] = provider === "auto" ? ["claude", "codex"] : [provider];
  for (const p of providers) {
    try {
      let accountLabel: string | null = null;
      const raw = await withUserAccount(user.id, p, (account, onQuota) => {
        accountLabel = account?.label ?? null;
        return runStructured(p, model, STRUCTURE_SYSTEM, structurePrompt(prompt, maxSize), STRUCTURE_SCHEMA, account, onQuota, [], TIMEOUT_MS);
      });
      const ai = validateAiStructure(raw);
      const s = expandStructure(ai, maxSize);
      if (!s.blocks.length) throw new Error("The AI's structure came out empty");
      const [res] = await (await db()).execute<ResultSetHeader>(
        `INSERT INTO mmb_structures (user_id, project_key, name, source, prompt, provider, model, account_label, ai_json, palette_json, blocks_json,
           size_x, size_y, size_z, block_count, duration_ms, created_at)
         VALUES (?, ?, ?, 'ai', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, project, s.name, prompt, p, model || null, accountLabel, JSON.stringify(raw), JSON.stringify(s.palette), JSON.stringify(s.blocks),
          s.size[0], s.size[1], s.size[2], s.blocks.length / 4, Date.now() - started, Date.now()]);
      return Response.json({ id: res.insertId, provider: p, ...s });
    } catch (e) {
      errors.push(`${p}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return Response.json({ error: errors.join("\n") }, { status: 502 });
}
