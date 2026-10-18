import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { recordProjectModels } from "@/lib/server/modelDataset";

/**
 * One project of the logged-in user, addressed by ?key=. GET returns { key, updatedAt, session },
 * PUT stores { updatedAt, session } (older writes than the stored one are ignored), DELETE leaves a
 * tombstone so other browsers drop their copy on the next sync.
 */
const KEY_RE = /^[\w.-]{1,128}$/;

function keyOf(request: Request): string | null {
  const key = new URL(request.url).searchParams.get("key");
  return key && KEY_RE.test(key) ? key : null;
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const key = keyOf(request);
  if (!key) return Response.json({ error: "Bad key" }, { status: 400 });
  const [rows] = await (await db()).execute<RowDataPacket[]>(
    "SELECT data, updated_at FROM mmb_projects WHERE user_id = ? AND project_key = ? AND deleted_at IS NULL", [user.id, key]);
  if (!rows[0]) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(`{"key":${JSON.stringify(key)},"updatedAt":${Number(rows[0].updated_at)},"session":${rows[0].data}}`, {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function PUT(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const key = keyOf(request);
  if (!key) return Response.json({ error: "Bad key" }, { status: 400 });
  let body: { updatedAt?: unknown; session?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updatedAt = typeof body.updatedAt === "number" && Number.isFinite(body.updatedAt) ? Math.round(body.updatedAt) : Date.now();
  if (!body.session || typeof body.session !== "object") return Response.json({ error: "Missing session" }, { status: 400 });
  await (await db()).execute(
    `INSERT INTO mmb_projects (user_id, project_key, data, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)
     ON DUPLICATE KEY UPDATE
       data = IF(VALUES(updated_at) >= updated_at, VALUES(data), data),
       deleted_at = IF(VALUES(updated_at) >= updated_at, NULL, deleted_at),
       updated_at = GREATEST(updated_at, VALUES(updated_at))`,
    [user.id, key, JSON.stringify(body.session), updatedAt]);
  // Training-data table; never let it fail a save.
  await recordProjectModels(user.id, key, body.session).catch((e) => console.error("model dataset:", e));
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const key = keyOf(request);
  if (!key) return Response.json({ error: "Bad key" }, { status: 400 });
  const now = Date.now();
  await (await db()).execute(
    "UPDATE mmb_projects SET data = NULL, deleted_at = ?, updated_at = ? WHERE user_id = ? AND project_key = ?", [now, now, user.id, key]);
  await (await db()).execute("UPDATE mmb_models SET deleted_at = ? WHERE user_id = ? AND project_key = ? AND deleted_at IS NULL", [now, user.id, key]);
  return Response.json({ ok: true });
}
