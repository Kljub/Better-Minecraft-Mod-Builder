import { createHash } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "./db";
import type { EntityModel } from "@/lib/model3d/types";
import { toBedrockGeo, sanitizeBoneNames } from "@/lib/model3d/codecs";
import { toBedrockAnimations } from "@/lib/model3d/animation";

/**
 * Training-data collection: every 3D model in every saved project (Entity Models and custom armor
 * models) is kept in mmb_models, one row per (user, project, kind, element) and refreshed when it
 * changes. Models built by the Entity Model Generator are linked to the run (mmb_ai_runs) that
 * built them, so a row reads "prompt → geometry + animations + texture". Export: /api/dataset
 * (own models) or `npm run dataset:export` (everything, for the server owner).
 */
export type ModelKind = "entity" | "armor";

interface FoundModel {
  kind: ModelKind;
  elementId: string;
  name: string;
  model: EntityModel;
  settings: Record<string, unknown> | null;
}

/** The models in a saved project session (its current history entry). */
export function modelsInSession(session: unknown): { models: FoundModel[]; modId: string; mcVersion: string } {
  const s = session as { history?: unknown[]; cursor?: number } | null;
  const entry = (s?.history?.[s.cursor ?? 0] ?? s?.history?.at(-1)) as {
    elements?: Record<string, unknown[]>; armors?: unknown[]; screens?: { modId?: string }[]; mcVersion?: string;
  } | undefined;
  const models: FoundModel[] = [];
  if (!entry) return { models, modId: "", mcVersion: "" };
  const isModel = (m: unknown): m is EntityModel =>
    !!m && typeof m === "object" && Array.isArray((m as EntityModel).bones) && Array.isArray((m as EntityModel).cubes);

  for (const raw of entry.elements?.entityModel ?? []) {
    const el = raw as EntityModel & { id?: string; entity?: Record<string, unknown> };
    if (!el?.id || !isModel(el)) continue;
    const { id, entity, ...model } = el as EntityModel & { id: string; entity?: Record<string, unknown>; folder?: unknown };
    delete (model as { folder?: unknown }).folder;
    const name = typeof entity?.displayName === "string" && entity.displayName.trim() ? entity.displayName.trim() : id;
    models.push({ kind: "entity", elementId: id, name, model: model as EntityModel, settings: entity ?? null });
  }
  for (const raw of entry.armors ?? []) {
    const a = raw as { id?: string; displayName?: string; model?: unknown };
    if (!a?.id || !isModel(a.model) || !a.model.cubes.length) continue;
    models.push({ kind: "armor", elementId: a.id, name: a.displayName?.trim() || a.id, model: a.model, settings: null });
  }
  return { models, modId: entry.screens?.find((x) => x?.modId)?.modId ?? "", mcVersion: entry.mcVersion ?? "" };
}

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

/** Upserts the project's models; ones that disappeared from it get deleted_at (rows are kept). */
export async function recordProjectModels(userId: number, projectKey: string, session: unknown) {
  const { models, modId, mcVersion } = modelsInSession(session);
  const pool = await db();
  const now = Date.now();
  const [existing] = await pool.execute<RowDataPacket[]>(
    "SELECT kind, element_id, content_hash, deleted_at FROM mmb_models WHERE user_id = ? AND project_key = ?", [userId, projectKey]);
  const known = new Map(existing.map((r) => [`${r.kind}:${r.element_id}`, r]));

  for (const m of models) {
    const contentHash = hash([m.model, m.settings, m.name]);
    const prev = known.get(`${m.kind}:${m.elementId}`);
    known.delete(`${m.kind}:${m.elementId}`);
    if (prev && prev.content_hash === contentHash && prev.deleted_at == null) continue;
    const clean = sanitizeBoneNames(m.model);
    const anims = m.model.animations ?? [];
    await pool.execute(
      `INSERT INTO mmb_models (user_id, project_key, kind, element_id, name, mod_id, mc_version, model_json, geo_json, animations_json,
         settings_json, texture_key, texture_width, texture_height, bone_count, cube_count, animation_count, content_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), mod_id = VALUES(mod_id), mc_version = VALUES(mc_version), model_json = VALUES(model_json),
         geo_json = VALUES(geo_json), animations_json = VALUES(animations_json), settings_json = VALUES(settings_json),
         texture_key = VALUES(texture_key), texture_width = VALUES(texture_width), texture_height = VALUES(texture_height),
         bone_count = VALUES(bone_count), cube_count = VALUES(cube_count), animation_count = VALUES(animation_count),
         content_hash = VALUES(content_hash), updated_at = VALUES(updated_at), deleted_at = NULL`,
      [
        userId, projectKey, m.kind, m.elementId.slice(0, 128), m.name.slice(0, 200), modId.slice(0, 64), mcVersion.slice(0, 16),
        JSON.stringify(m.model),
        JSON.stringify(toBedrockGeo(clean, { identifier: m.elementId })),
        anims.length ? JSON.stringify(toBedrockAnimations(clean, anims, m.elementId)) : null,
        m.settings ? JSON.stringify(m.settings) : null,
        m.model.texture || null, m.model.textureWidth, m.model.textureHeight,
        m.model.bones.length, m.model.cubes.length, anims.length, contentHash, now, now,
      ]);
    if (m.kind === "entity") await linkLatestRun(userId, m.elementId);
  }
  for (const r of known.values()) {
    if (r.deleted_at != null) continue;
    await pool.execute("UPDATE mmb_models SET deleted_at = ? WHERE user_id = ? AND project_key = ? AND kind = ? AND element_id = ?",
      [now, userId, projectKey, r.kind, r.element_id]);
  }
}

/** Attaches the newest generator run that touched this model id (if the row has none yet). */
async function linkLatestRun(userId: number, elementId: string) {
  const pool = await db();
  const [runs] = await pool.execute<RowDataPacket[]>(
    "SELECT id, prompt, provider FROM mmb_ai_runs WHERE user_id = ? AND JSON_CONTAINS(model_ids, JSON_QUOTE(?)) ORDER BY id DESC LIMIT 1",
    [userId, elementId]);
  if (!runs[0]) return;
  await pool.execute(
    "UPDATE mmb_models SET prompt = ?, ai_provider = ?, ai_run_id = ? WHERE user_id = ? AND kind = 'entity' AND element_id = ? AND (ai_run_id IS NULL OR ai_run_id < ?)",
    [runs[0].prompt, runs[0].provider, runs[0].id, userId, elementId, runs[0].id]);
}

// ---- generator runs -----------------------------------------------------------------------------

export async function startAiRun(userId: number, provider: string, prompt: string, accountLabel: string | null): Promise<number> {
  const [res] = await (await db()).execute<ResultSetHeader>(
    "INSERT INTO mmb_ai_runs (user_id, provider, account_label, prompt, model_ids, created_at) VALUES (?, ?, ?, ?, JSON_ARRAY(), ?)",
    [userId, provider, accountLabel, prompt, Date.now()]);
  return res.insertId;
}

/** Model ids a generator tool call refers to (create_model's `id`, every other tool's `model`). */
export function modelIdsFromToolCall(tool: string, input: unknown): string[] {
  const i = (input ?? {}) as Record<string, unknown>;
  const ids = [tool.endsWith("create_model") ? i.id : null, i.model].filter((v): v is string => typeof v === "string" && !!v);
  return [...new Set(ids)];
}

export async function finishAiRun(runId: number, userId: number, r: { ok: boolean; resultText: string; tools: { name: string; input: unknown }[] }) {
  const ids = [...new Set(r.tools.flatMap((t) => modelIdsFromToolCall(t.name, t.input)))];
  const pool = await db();
  await pool.execute(
    "UPDATE mmb_ai_runs SET ok = ?, result_text = ?, tools_json = ?, model_ids = ?, finished_at = ? WHERE id = ?",
    [r.ok ? 1 : 0, r.resultText.slice(0, 60_000), JSON.stringify(r.tools).slice(0, 4_000_000), JSON.stringify(ids), Date.now(), runId]);
  // Models the run touched that are already recorded get the prompt now; newer ones on their next save.
  for (const id of ids) await linkLatestRun(userId, id);
}
