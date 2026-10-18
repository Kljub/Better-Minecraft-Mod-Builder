import { accountsEnabled } from "@/lib/server/db";
import { destroySession, sameOrigin } from "@/lib/server/auth";

export async function POST(request: Request) {
  if (!accountsEnabled()) return Response.json({ ok: true });
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin request refused" }, { status: 403 });
  return Response.json({ ok: true }, { headers: { "set-cookie": await destroySession(request) } });
}
