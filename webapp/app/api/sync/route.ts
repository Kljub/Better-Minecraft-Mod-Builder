import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";

/** What the logged-in user has stored: project keys (with tombstones), files and settings, with timestamps. */
export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const pool = await db();
  const [projects] = await pool.execute<RowDataPacket[]>("SELECT project_key, updated_at, deleted_at FROM mmb_projects WHERE user_id = ?", [user.id]);
  const [files] = await pool.execute<RowDataPacket[]>("SELECT kind, file_key, updated_at FROM mmb_files WHERE user_id = ?", [user.id]);
  const [kv] = await pool.execute<RowDataPacket[]>("SELECT k, updated_at FROM mmb_kv WHERE user_id = ?", [user.id]);
  return Response.json({
    projects: projects.map((r) => ({ key: String(r.project_key), updatedAt: Number(r.updated_at), deletedAt: r.deleted_at == null ? null : Number(r.deleted_at) })),
    files: files.map((r) => ({ kind: String(r.kind), key: String(r.file_key), updatedAt: Number(r.updated_at) })),
    kv: kv.map((r) => ({ key: String(r.k), updatedAt: Number(r.updated_at) })),
  });
}
