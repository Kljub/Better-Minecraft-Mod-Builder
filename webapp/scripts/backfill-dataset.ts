/**
 * Fills mmb_models from every stored project (projects saved before the table existed are only
 * picked up on their next save otherwise). Safe to re-run: unchanged models are skipped.
 *   npx tsx scripts/backfill-dataset.ts
 */
import fs from "node:fs";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";

const envFile = path.join(__dirname, "..", ".env.local");
for (const line of fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8").split("\n") : []) {
  const m = /^(\w+)=(.*)$/.exec(line.trim());
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

async function main() {
  const { db } = await import("../lib/server/db");
  const { recordProjectModels } = await import("../lib/server/modelDataset");
  const pool = await db();
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT user_id, project_key, data FROM mmb_projects WHERE deleted_at IS NULL AND data IS NOT NULL");
  for (const r of rows) await recordProjectModels(Number(r.user_id), String(r.project_key), JSON.parse(String(r.data)));
  const [[count]] = await pool.execute<RowDataPacket[]>("SELECT COUNT(*) AS n FROM mmb_models WHERE deleted_at IS NULL");
  console.log(`${rows.length} projects scanned, ${count.n} models in mmb_models`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
