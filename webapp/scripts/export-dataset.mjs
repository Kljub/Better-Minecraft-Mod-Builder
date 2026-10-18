#!/usr/bin/env node
/**
 * Exports every user's 3D models (mmb_models) as JSON Lines for training — the server owner's
 * counterpart to GET /api/dataset (which only returns your own). Reads the MMB_DB_* settings from
 * webapp/.env.local.
 *
 *   npm run dataset:export -- out.jsonl            # live models
 *   npm run dataset:export -- out.jsonl --deleted  # including removed ones
 *   npm run dataset:export -- out.jsonl --ai-only  # only models built from a prompt
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, "..", ".env.local");
const env = { ...process.env };
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = /^(\w+)=(.*)$/.exec(line.trim());
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
}
if (!env.MMB_DB_NAME) { console.error("MMB_DB_NAME is not set (webapp/.env.local)"); process.exit(1); }

const args = process.argv.slice(2);
const outPath = args.find((a) => !a.startsWith("--")) ?? "models.jsonl";
const where = ["1=1"];
if (!args.includes("--deleted")) where.push("m.deleted_at IS NULL");
if (args.includes("--ai-only")) where.push("m.prompt IS NOT NULL");

const conn = await mysql.createConnection({
  host: env.MMB_DB_HOST || "127.0.0.1", port: Number(env.MMB_DB_PORT || 3306),
  user: env.MMB_DB_USER, password: env.MMB_DB_PASSWORD, database: env.MMB_DB_NAME,
});
const [rows] = await conn.execute(
  `SELECT m.*, u.username, f.data AS texture_png FROM mmb_models m
   JOIN mmb_users u ON u.id = m.user_id
   LEFT JOIN mmb_files f ON f.user_id = m.user_id AND f.kind = 'texture' AND f.file_key = m.texture_key
   WHERE ${where.join(" AND ")} ORDER BY m.id`);
await conn.end();

const parse = (v) => { if (v == null) return null; try { return JSON.parse(String(v)); } catch { return null; } };
const out = fs.createWriteStream(outPath);
for (const r of rows) {
  out.write(JSON.stringify({
    id: Number(r.id), user: r.username, kind: r.kind, name: r.name, prompt: r.prompt ?? null, provider: r.ai_provider ?? null,
    mod_id: r.mod_id, mc_version: r.mc_version,
    stats: { bones: r.bone_count, cubes: r.cube_count, animations: r.animation_count, texture_width: r.texture_width, texture_height: r.texture_height },
    geo: parse(r.geo_json), animations: parse(r.animations_json), settings: parse(r.settings_json), model: parse(r.model_json),
    texture_png_base64: r.texture_png ? Buffer.from(r.texture_png).toString("base64") : null,
    created_at: Number(r.created_at), updated_at: Number(r.updated_at), deleted: r.deleted_at != null,
  }) + "\n");
}
out.end();
console.error(`${rows.length} models → ${outPath}`);
