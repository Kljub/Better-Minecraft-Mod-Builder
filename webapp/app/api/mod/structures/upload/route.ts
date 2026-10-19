import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/server/db";
import { requireModUser } from "@/lib/server/modTokens";
import { readStructure } from "@/lib/nbt";
import { structureId } from "@/lib/structureAi";

/**
 * Companion mod: uploads a structure template (.nbt, gzip) saved in-game. ?name= ; ?parent=<id> when
 * it's the placed result of "/mmb generate" (fills that generation's row, or — when the generation
 * already has its file — stores a new "edited" row pointing at it); ?project=<key> to send it to one
 * project only. The open editor picks it up through /api/mod/inbox.
 */
const MAX_BYTES = 32 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await requireModUser(request);
  if (user instanceof Response) return user;
  const q = new URL(request.url).searchParams;
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length > MAX_BYTES) return Response.json({ error: "File too large" }, { status: 413 });
  if (data[0] !== 0x1f || data[1] !== 0x8b) return Response.json({ error: "Not a gzip-compressed .nbt file" }, { status: 400 });
  let info;
  try { info = await readStructure(data); } catch (e) {
    return Response.json({ error: `Not a structure template: ${e instanceof Error ? e.message : String(e)}` }, { status: 400 });
  }
  const name = structureId(q.get("name") ?? "structure");
  const project = q.get("project")?.trim().slice(0, 128) || null;
  const parent = Number(q.get("parent"));
  const pool = await db();
  const now = Date.now();
  const [sx, sy, sz] = info.size;

  if (Number.isInteger(parent) && parent > 0) {
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT id, nbt IS NULL AS no_file FROM mmb_structures WHERE id = ? AND user_id = ?", [parent, user.id]);
    if (!rows[0]) return Response.json({ error: "Unknown parent structure" }, { status: 404 });
    if (rows[0].no_file) {
      await pool.execute(
        "UPDATE mmb_structures SET nbt = ?, name = ?, size_x = ?, size_y = ?, size_z = ?, block_count = ?, uploaded_at = ?, project_key = COALESCE(?, project_key) WHERE id = ?",
        [data, name, sx, sy, sz, info.solidCount, now, project, parent]);
      return Response.json({ id: parent, name, size: info.size, blocks: info.solidCount });
    }
  }
  const [res] = await pool.execute<ResultSetHeader>(
    `INSERT INTO mmb_structures (user_id, project_key, name, source, parent_id, nbt, size_x, size_y, size_z, block_count, created_at, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.id, project, name, parent > 0 ? "edited" : "upload", parent > 0 ? parent : null, data, sx, sy, sz, info.solidCount, now, now]);
  return Response.json({ id: res.insertId, name, size: info.size, blocks: info.solidCount });
}
