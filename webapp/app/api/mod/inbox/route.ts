import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";

/**
 * The editor's "inbox" of structures uploaded by the companion mod. GET ?project=<key> lists the
 * ones not yet imported (for this project or for any); POST ?id= claims one (only one open editor
 * gets it) and returns its .nbt bytes.
 */
export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const project = new URL(request.url).searchParams.get("project") ?? "";
  const [rows] = await (await db()).execute<RowDataPacket[]>(
    `SELECT id, name, prompt FROM mmb_structures
     WHERE user_id = ? AND imported_at IS NULL AND nbt IS NOT NULL AND (project_key IS NULL OR project_key = ?) ORDER BY id LIMIT 20`,
    [user.id, project]);
  return Response.json({ items: rows.map((r) => ({ id: Number(r.id), name: String(r.name), prompt: r.prompt == null ? null : String(r.prompt) })) });
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Bad id" }, { status: 400 });
  const pool = await db();
  const [res] = await pool.execute<ResultSetHeader>(
    "UPDATE mmb_structures SET imported_at = ? WHERE id = ? AND user_id = ? AND imported_at IS NULL AND nbt IS NOT NULL", [Date.now(), id, user.id]);
  if (!res.affectedRows) return Response.json({ error: "Already imported" }, { status: 409 });
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT name, nbt FROM mmb_structures WHERE id = ?", [id]);
  return new Response(new Uint8Array(rows[0].nbt as Buffer), {
    headers: { "content-type": "application/octet-stream", "x-structure-name": String(rows[0].name), "cache-control": "no-store" },
  });
}
