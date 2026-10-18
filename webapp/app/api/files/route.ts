import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";

/**
 * The user's binary files: kind "texture" (custom textures, key like "custom/foo.png") and
 * "structure" (.nbt files). ?kind=&key= ; GET returns the bytes, PUT stores the request body.
 */
const KINDS = new Set(["texture", "structure"]);
const MAX_BYTES = 64 * 1024 * 1024;

function target(request: Request): { kind: string; key: string } | null {
  const p = new URL(request.url).searchParams;
  const kind = p.get("kind") ?? "", key = p.get("key") ?? "";
  if (!KINDS.has(kind) || !key || key.length > 255 || key.includes("..")) return null;
  return { kind, key };
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const t = target(request);
  if (!t) return Response.json({ error: "Bad file" }, { status: 400 });
  const [rows] = await (await db()).execute<RowDataPacket[]>(
    "SELECT content_type, data FROM mmb_files WHERE user_id = ? AND kind = ? AND file_key = ?", [user.id, t.kind, t.key]);
  if (!rows[0]) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(new Uint8Array(rows[0].data as Buffer), { headers: { "content-type": String(rows[0].content_type), "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const t = target(request);
  if (!t) return Response.json({ error: "Bad file" }, { status: 400 });
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length > MAX_BYTES) return Response.json({ error: "File too large" }, { status: 413 });
  const type = (request.headers.get("content-type") || "application/octet-stream").slice(0, 100);
  await (await db()).execute(
    `INSERT INTO mmb_files (user_id, kind, file_key, content_type, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE content_type = VALUES(content_type), data = VALUES(data), updated_at = VALUES(updated_at)`,
    [user.id, t.kind, t.key, type, data, Date.now()]);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const t = target(request);
  if (!t) return Response.json({ error: "Bad file" }, { status: 400 });
  await (await db()).execute("DELETE FROM mmb_files WHERE user_id = ? AND kind = ? AND file_key = ?", [user.id, t.kind, t.key]);
  return Response.json({ ok: true });
}
