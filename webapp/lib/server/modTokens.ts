import { createHash, randomBytes } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { accountsEnabled, db } from "./db";
import type { SessionUser } from "./auth";

/**
 * API tokens for the Minecraft companion mod (companion-mod/): the mod sends
 * "Authorization: Bearer mmb_…" instead of a session cookie. Only the token's SHA-256 is stored;
 * the token itself is shown once when it's created.
 */
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const PREFIX = "mmb_";

export interface ModTokenView { id: number; label: string; createdAt: number; lastUsedAt: number | null }

export async function createModToken(userId: number, label: string): Promise<{ token: string; id: number }> {
  const token = PREFIX + randomBytes(32).toString("base64url");
  const [res] = await (await db()).execute<ResultSetHeader>(
    "INSERT INTO mmb_mod_tokens (user_id, token_hash, label, created_at) VALUES (?, ?, ?, ?)",
    [userId, sha256(token), label.slice(0, 100) || "Minecraft", Date.now()]);
  return { token, id: res.insertId };
}

export async function listModTokens(userId: number): Promise<ModTokenView[]> {
  const [rows] = await (await db()).execute<RowDataPacket[]>(
    "SELECT id, label, created_at, last_used_at FROM mmb_mod_tokens WHERE user_id = ? ORDER BY id", [userId]);
  return rows.map((r) => ({ id: Number(r.id), label: String(r.label), createdAt: Number(r.created_at), lastUsedAt: r.last_used_at == null ? null : Number(r.last_used_at) }));
}

export async function revokeModToken(userId: number, id: number): Promise<void> {
  await (await db()).execute("DELETE FROM mmb_mod_tokens WHERE user_id = ? AND id = ?", [userId, id]);
}

/** The user behind the request's bearer token, or the error response to send. */
export async function requireModUser(request: Request): Promise<SessionUser | Response> {
  if (!accountsEnabled()) return Response.json({ error: "Accounts are not configured on this server." }, { status: 404 });
  const m = /^Bearer\s+(mmb_[\w-]{20,100})$/.exec(request.headers.get("authorization") ?? "");
  if (!m) return Response.json({ error: "Missing or malformed token — create one in the web UI under Settings → AI → Minecraft mod." }, { status: 401 });
  const pool = await db();
  const hash = sha256(m[1]);
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT u.id, u.username FROM mmb_mod_tokens t JOIN mmb_users u ON u.id = t.user_id WHERE t.token_hash = ?", [hash]);
  if (!rows[0]) return Response.json({ error: "Unknown or revoked token" }, { status: 401 });
  await pool.execute("UPDATE mmb_mod_tokens SET last_used_at = ? WHERE token_hash = ?", [Date.now(), hash]);
  return { id: Number(rows[0].id), username: String(rows[0].username) };
}
