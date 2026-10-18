import { guardRequest } from "../../ai/cli";
import { localStatus, startLocal, stopLocal } from "../backend";

/** Status of the local generator server (tools/skin-generator), and start/stop for it. Spawning
 * processes is dev-server only, same rule as the AI CLI integration. */
export async function GET(request: Request) {
  const refused = guardRequest(request);
  if (refused) return refused;
  return Response.json(await localStatus());
}

export async function POST(request: Request) {
  const refused = guardRequest(request);
  if (refused) return refused;
  let body: { action?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    if (body.action === "start") startLocal();
    else if (body.action === "stop") stopLocal();
    else return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  return Response.json(await localStatus());
}
