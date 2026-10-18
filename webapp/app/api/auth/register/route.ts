import type { ResultSetHeader } from "mysql2/promise";
import { accountsEnabled, db } from "@/lib/server/db";
import { createSession, hashPassword, sameOrigin } from "@/lib/server/auth";
import { readCredentials, USERNAME_RE } from "../credentials";

export async function POST(request: Request) {
  if (!accountsEnabled()) return Response.json({ error: "Accounts are not configured on this server." }, { status: 404 });
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin request refused" }, { status: 403 });
  const creds = await readCredentials(request);
  if (creds instanceof Response) return creds;
  if (!USERNAME_RE.test(creds.username)) return Response.json({ error: "Username: 3–32 characters, letters, digits, _ . -" }, { status: 400 });
  if (creds.password.length < 8) return Response.json({ error: "Password: at least 8 characters." }, { status: 400 });
  const pool = await db();
  let id: number;
  try {
    const [res] = await pool.execute<ResultSetHeader>("INSERT INTO mmb_users (username, password_hash, created_at) VALUES (?, ?, ?)",
      [creds.username, await hashPassword(creds.password), Date.now()]);
    id = res.insertId;
  } catch (e) {
    if ((e as { code?: string }).code === "ER_DUP_ENTRY") return Response.json({ error: "That username is taken." }, { status: 409 });
    throw e;
  }
  const cookie = await createSession(request, id);
  return Response.json({ user: { id, username: creds.username } }, { headers: { "set-cookie": cookie } });
}
