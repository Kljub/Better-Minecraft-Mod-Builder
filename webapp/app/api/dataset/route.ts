import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";

/**
 * The logged-in user's 3D models as training data (JSON Lines, one model per line):
 * { kind, name, prompt, provider, stats, geo, animations, settings, texture_png_base64, … }.
 * ?deleted=1 also includes models that were removed from their project.
 */
export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const withDeleted = new URL(request.url).searchParams.get("deleted") === "1";
  const pool = await db();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT m.*, f.data AS texture_png FROM mmb_models m
     LEFT JOIN mmb_files f ON f.user_id = m.user_id AND f.kind = 'texture' AND f.file_key = m.texture_key
     WHERE m.user_id = ?${withDeleted ? "" : " AND m.deleted_at IS NULL"} ORDER BY m.id`, [user.id]);
  const lines = rows.map((r) => JSON.stringify(datasetRecord(r)));
  return new Response(lines.join("\n") + (lines.length ? "\n" : ""), {
    headers: {
      "content-type": "application/x-ndjson",
      "content-disposition": `attachment; filename="models-${user.username}.jsonl"`,
      "cache-control": "no-store",
    },
  });
}

function parse(v: unknown) {
  if (v == null) return null;
  try { return JSON.parse(String(v)); } catch { return null; }
}

/** One dataset line — the same shape scripts/export-dataset.mjs writes. */
function datasetRecord(r: RowDataPacket) {
  return {
    id: Number(r.id),
    kind: r.kind,
    name: r.name,
    prompt: r.prompt ?? null,
    provider: r.ai_provider ?? null,
    mod_id: r.mod_id,
    mc_version: r.mc_version,
    stats: { bones: r.bone_count, cubes: r.cube_count, animations: r.animation_count, texture_width: r.texture_width, texture_height: r.texture_height },
    geo: parse(r.geo_json),
    animations: parse(r.animations_json),
    settings: parse(r.settings_json),
    model: parse(r.model_json),
    texture_png_base64: r.texture_png ? Buffer.from(r.texture_png as Buffer).toString("base64") : null,
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
    deleted: r.deleted_at != null,
  };
}
