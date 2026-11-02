import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/server/db";
import { requireModUser } from "@/lib/server/modTokens";
import { guardRequest, runStructured } from "@/app/api/ai/cli";
import { withUserAccount } from "@/app/api/ai/linked";
import {
  STRUCTURE_EDIT_SYSTEM, STRUCTURE_SCHEMA, expandStructure, structureEditPrompt, validateAiStructure, type StructureOp,
} from "@/lib/structureAi";

/**
 * Companion mod: "/mmb edit <prompt>" on a generated structure's plot — the AI gets the structure's
 * build ops so far (the generation plus earlier edits) and answers with only the changing ops,
 * which go back to the mod compiled like a generation (same size). Stored as an "ai_edit" row whose
 * parent is the generation, so the next edit sees this one too.
 */
const TIMEOUT_MS = 600_000;

export async function POST(request: Request) {
  const refused = guardRequest(request);
  if (refused) return refused;
  const user = await requireModUser(request);
  if (user instanceof Response) return user;

  let body: { parent?: unknown; prompt?: unknown; provider?: unknown; model?: unknown; project?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 2000) : "";
  if (!prompt) return Response.json({ error: "Empty prompt" }, { status: 400 });
  const parent = Number(body.parent);
  if (!Number.isInteger(parent) || parent <= 0) return Response.json({ error: "No structure to edit" }, { status: 400 });
  const provider = body.provider ?? "auto";
  if (provider !== "claude" && provider !== "codex" && provider !== "auto") return Response.json({ error: "provider must be claude, codex or auto" }, { status: 400 });
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (model && !/^[\w.:\/\[\]][\w.:\/\-\[\]]{0,127}$/.test(model)) return Response.json({ error: "Invalid model name" }, { status: 400 });
  const project = typeof body.project === "string" && body.project.trim() ? body.project.trim().slice(0, 128) : null;

  const pool = await db();
  const [bases] = await pool.execute<RowDataPacket[]>(
    "SELECT id, name, ai_json, size_x, size_y, size_z FROM mmb_structures WHERE id = ? AND user_id = ? AND source = 'ai'", [parent, user.id]);
  const base = bases[0];
  if (!base) return Response.json({ error: "That structure isn't an AI generation of yours" }, { status: 404 });
  const [edits] = await pool.execute<RowDataPacket[]>(
    "SELECT ai_json FROM mmb_structures WHERE parent_id = ? AND user_id = ? AND source = 'ai_edit' ORDER BY id", [parent, user.id]);
  const opsOf = (raw: unknown): StructureOp[] => {
    try { return validateAiStructure(typeof raw === "string" ? JSON.parse(raw) : raw).ops; } catch { return []; }
  };
  const ops = [...opsOf(base.ai_json), ...edits.flatMap((e) => opsOf(e.ai_json))];
  const size: [number, number, number] = [Number(base.size_x), Number(base.size_y), Number(base.size_z)];
  const name = String(base.name);

  const started = Date.now();
  const errors: string[] = [];
  const providers: ("claude" | "codex")[] = provider === "auto" ? ["claude", "codex"] : [provider];
  for (const p of providers) {
    try {
      let accountLabel: string | null = null;
      const raw = await withUserAccount(user.id, p, (account, onQuota) => {
        accountLabel = account?.label ?? null;
        return runStructured(p, model, STRUCTURE_EDIT_SYSTEM, structureEditPrompt(prompt, { name, size, ops }), STRUCTURE_SCHEMA, account, onQuota, [], TIMEOUT_MS);
      });
      const ai = validateAiStructure(raw);
      // Same coordinates as the structure: its size, however the AI answered.
      const s = expandStructure({ ...ai, name, size }, Math.max(size[0], size[2]), size[1]);
      if (!s.ops.length) throw new Error("The AI's edit changed nothing");
      const [res] = await pool.execute<ResultSetHeader>(
        `INSERT INTO mmb_structures (user_id, project_key, name, source, parent_id, prompt, provider, model, account_label, ai_json, palette_json, blocks_json,
           size_x, size_y, size_z, block_count, duration_ms, created_at)
         VALUES (?, ?, ?, 'ai_edit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, project, name, parent, prompt, p, model || null, accountLabel, JSON.stringify(raw), JSON.stringify(s.palette),
          s.blocks.length ? JSON.stringify(s.blocks) : null, size[0], size[1], size[2], s.blockCount, Date.now() - started, Date.now()]);
      return Response.json({ id: res.insertId, parent, provider: p, ...s, blocks: undefined });
    } catch (e) {
      errors.push(`${p}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return Response.json({ error: errors.join("\n") }, { status: 502 });
}
