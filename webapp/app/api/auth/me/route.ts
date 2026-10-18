import { accountsEnabled } from "@/lib/server/db";
import { currentUser } from "@/lib/server/auth";

/** { enabled, user } — enabled=false means local-only mode (no login screen). */
export async function GET(request: Request) {
  if (!accountsEnabled()) return Response.json({ enabled: false, user: null });
  try {
    return Response.json({ enabled: true, user: await currentUser(request) });
  } catch (e) {
    return Response.json({ enabled: true, user: null, error: `Database unavailable: ${(e as Error).message}` }, { status: 503 });
  }
}
