import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";

/** Small per-user settings (e.g. resource folders), ?key= ; GET → { value }, PUT { value }. */
const KEYS = new Set(["resource-folders"]);

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!KEYS.has(key)) return Response.json({ error: "Bad key" }, { status: 400 });
  const [rows] = await (await db()).execute<RowDataPacket[]>("SELECT v FROM mmb_kv WHERE user_id = ? AND k = ?", [user.id, key]);
  if (!rows[0]) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(`{"value":${rows[0].v}}`, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!KEYS.has(key)) return Response.json({ error: "Bad key" }, { status: 400 });
  let body: { value?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const v = JSON.stringify(body.value ?? null);
  if (v.length > 1_000_000) return Response.json({ error: "Too large" }, { status: 413 });
  await (await db()).execute(
    "INSERT INTO mmb_kv (user_id, k, v, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_at = VALUES(updated_at)",
    [user.id, key, v, Date.now()]);
  return Response.json({ ok: true });
}
