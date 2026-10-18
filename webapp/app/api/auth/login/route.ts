import type { RowDataPacket } from "mysql2/promise";
import { accountsEnabled, db } from "@/lib/server/db";
import { clientKey, createSession, recordFailure, sameOrigin, tooManyFailures, verifyPassword } from "@/lib/server/auth";
import { readCredentials } from "../credentials";

export async function POST(request: Request) {
  if (!accountsEnabled()) return Response.json({ error: "Accounts are not configured on this server." }, { status: 404 });
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin request refused" }, { status: 403 });
  const creds = await readCredentials(request);
  if (creds instanceof Response) return creds;
  const key = clientKey(request, creds.username);
  if (tooManyFailures(key)) return Response.json({ error: "Too many failed attempts — try again in 15 minutes." }, { status: 429 });
  const [rows] = await (await db()).execute<RowDataPacket[]>("SELECT id, username, password_hash FROM mmb_users WHERE username = ?", [creds.username]);
  const row = rows[0];
  if (!row || !(await verifyPassword(creds.password, String(row.password_hash)))) {
    recordFailure(key);
    return Response.json({ error: "Wrong username or password." }, { status: 401 });
  }
  const cookie = await createSession(request, Number(row.id));
  return Response.json({ user: { id: Number(row.id), username: String(row.username) } }, { headers: { "set-cookie": cookie } });
}
