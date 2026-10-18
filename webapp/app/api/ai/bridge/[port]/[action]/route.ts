import { guardRequest } from "../../../cli";
import { isBridgePort } from "@/lib/ai/bridgePorts";

/**
 * Same-origin proxy from the browser to an MCP bridge on this machine (webapp/mcp/server.mjs on
 * 127.0.0.1:<port>). The MCP server only listens on the server's loopback, so a browser on another
 * computer can't reach it directly — it goes through the dev server instead. Only the bridge's
 * three endpoints and known bridge ports are forwarded.
 */
const ACTIONS = new Set(["ping", "poll", "result"]);

async function forward(request: Request, params: Promise<{ port: string; action: string }>) {
  const refused = guardRequest(request);
  if (refused) return refused;
  const { port: portStr, action } = await params;
  const port = Number(portStr);
  if (!ACTIONS.has(action) || !Number.isInteger(port) || !isBridgePort(port)) {
    return Response.json({ error: "Unknown bridge endpoint" }, { status: 404 });
  }
  const url = new URL(request.url);
  const target = `http://127.0.0.1:${port}/${action}${action === "poll" ? url.search : ""}`;
  try {
    const res = await fetch(target, {
      method: request.method,
      headers: request.method === "POST" ? { "content-type": "application/json" } : undefined,
      body: request.method === "POST" ? await request.text() : undefined,
      signal: request.signal,
      cache: "no-store",
    });
    return new Response(res.status === 204 ? null : await res.text(), {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: "MCP bridge not reachable" }, { status: 502 });
  }
}

export function GET(request: Request, ctx: { params: Promise<{ port: string; action: string }> }) {
  return forward(request, ctx.params);
}

export function POST(request: Request, ctx: { params: Promise<{ port: string; action: string }> }) {
  return forward(request, ctx.params);
}
