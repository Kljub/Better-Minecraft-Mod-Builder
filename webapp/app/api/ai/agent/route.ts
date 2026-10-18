import { spawn, type ChildProcess } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { createServer } from "net";
import { tmpdir } from "os";
import { join } from "path";
import { childEnv, guardRequest } from "../cli";
import { registerAgentPort, unregisterAgentPort } from "@/lib/ai/bridgePorts";
import { currentUser } from "@/lib/server/auth";
import { finishAiRun, startAiRun } from "@/lib/server/modelDataset";
import { accountQueue, claudeQuota, isLimitError, markLimited, openAccount, recordQuota, type Quota, type RunAccount } from "@/lib/server/aiAccounts";

/**
 * Entity Model Generator backend: runs Claude Code or Codex headless as an agent that builds in
 * the open editor through the project's own MCP server (mcp/server.mjs). That server gets a free
 * port of its own (never 8790, which a user's interactive AI client may hold); the page connects
 * a second bridge to it for the run. Progress streams back as NDJSON lines:
 *   {type:"start",port} {type:"tool",name,detail} {type:"text",text} {type:"done",ok,text}
 * The agent can only use the mc-designer tools: claude gets `--tools ""` (no built-in tools),
 * codex runs in its read-only sandbox in an empty temp dir. The prompt goes in on stdin, never
 * through a shell.
 */
const MCP_SERVER = join(process.cwd(), "mcp", "server.mjs");
const TIMEOUT_MS = 15 * 60_000;
let running: ChildProcess | null = null;

const SYSTEM = [
  "You are building Minecraft mod content inside the MC Screen Designer web editor, which is open in the user's browser.",
  "Work ONLY through the mc-designer MCP tools. Call get_guide first and follow its conventions.",
  "For a creature/mob request: create a new entity model element (create_model with a fitting template), shape it from bones and cubes,",
  "pack the UVs, paint a texture that matches the description, add idle/walk/attack animations as appropriate, set its entity settings",
  "(health, speed, damage, hostile or not, spawning), then take a screenshot to check your work and fix what looks wrong.",
  "Every tool call is one undo step for the user. Finish with a short summary of what you built, in the user's language.",
].join(" ");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

const short = (v: unknown, n = 120) => {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

export async function POST(request: Request) {
  const refused = guardRequest(request);
  if (refused) return refused;
  let body: { provider?: unknown; model?: unknown; prompt?: unknown; context?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const provider = body.provider;
  if (provider !== "claude" && provider !== "codex") {
    return Response.json({ error: "Only Claude Code and Codex can drive the editor (they support MCP tools)." }, { status: 400 });
  }
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (model && !/^[\w.:/[\]][\w.:/\-[\]]{0,127}$/.test(model)) return Response.json({ error: "Invalid model name" }, { status: 400 });
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
  if (!prompt) return Response.json({ error: "Empty prompt" }, { status: 400 });
  if (running) return Response.json({ error: "A generator run is already in progress." }, { status: 409 });

  const ctx = (body.context ?? {}) as { activeElement?: { kind?: string; id?: string } | null };
  const active = ctx.activeElement?.kind && ctx.activeElement.id
    ? `\n(Currently open in the editor: ${ctx.activeElement.kind} "${ctx.activeElement.id}" — edit it only if the request refers to it.)`
    : "";
  const port = await freePort();
  const dir = await mkdtemp(join(tmpdir(), "mc-ui-agent-"));
  const mcpEnv = { MC_DESIGNER_MCP_PORT: String(port) };

  let args: string[];
  let stdin: string;
  if (provider === "claude") {
    const mcpConfig = JSON.stringify({ mcpServers: { "mc-designer": { command: "node", args: [MCP_SERVER], env: mcpEnv } } });
    args = [
      // No user/project settings: the user's own hooks, plugins and style instructions (e.g. a
      // terse "caveman" mode) must not leak into the product's agent. Login is unaffected.
      "-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence", "--setting-sources", "",
      "--mcp-config", mcpConfig, "--strict-mcp-config", "--allowedTools", "mcp__mc-designer", "--tools", "",
      "--append-system-prompt", SYSTEM,
    ];
    if (model) args.push("--model", model);
    stdin = prompt + active;
  } else {
    args = [
      // --ignore-user-config: same isolation for codex (its login still comes from CODEX_HOME).
      "exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--color", "never", "--ignore-user-config",
      "-c", 'mcp_servers.mc-designer.command="node"',
      "-c", `mcp_servers.mc-designer.args=[${JSON.stringify(MCP_SERVER)}]`,
      "-c", `mcp_servers.mc-designer.env={MC_DESIGNER_MCP_PORT="${port}"}`,
      // Only this server's tools are pre-approved (nobody can click "approve" in a headless run);
      // shell/file approvals and the read-only sandbox are unchanged.
      "-c", 'mcp_servers.mc-designer.default_tools_approval_mode="approve"',
      "-c", 'approval_policy="never"',
    ];
    if (model) args.push("-m", model);
    args.push("-");
    stdin = `${SYSTEM}\n\n---\n\n${prompt}${active}`;
  }

  // Linked accounts (Settings → AI): queue order, free quota first; empty = the host's own login.
  const user = await currentUser(request).catch(() => null);
  const queue = user ? await accountQueue(user.id, provider) : [];
  // Training data: prompt → the models this run builds (lib/server/modelDataset.ts).
  const runId = user ? await startAiRun(user.id, provider, prompt, queue[0]?.label ?? null).catch(() => null) : null;
  const toolLog: { name: string; input: unknown }[] = [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let aborted = false;
      const emit = (ev: Record<string, unknown>) => {
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      };
      const timer = setTimeout(() => { emit({ type: "text", text: "Time limit reached — stopping." }); running?.kill("SIGTERM"); }, TIMEOUT_MS);
      registerAgentPort(port);
      emit({ type: "start", port });

      const end = (ok: boolean, text: string) => {
        if (runId != null && user) void finishAiRun(runId, user.id, { ok, resultText: text, tools: toolLog }).catch(() => {});
        clearTimeout(timer);
        running = null;
        unregisterAgentPort(port);
        emit({ type: "done", ok, text });
        if (!closed) { closed = true; controller.close(); }
        rm(dir, { recursive: true, force: true }).catch(() => {});
      };

      /** One run with queue[index] (or the host login). Retries with the next account when this one
       * is out of quota before it did anything. */
      const attempt = async (index: number) => {
        const row = queue[index];
        let account: RunAccount | undefined;
        try {
          account = row && user ? await openAccount(user.id, row) : undefined;
        } catch (e) {
          end(false, `Couldn't open account "${row?.label}": ${(e as Error).message}`);
          return;
        }
        if (account) emit({ type: "info", text: `Using ${provider} account "${account.label}"` });
        const runArgs = account && provider === "codex" ? args.filter((a) => a !== "--ephemeral") : args;
        const child = spawn(provider, runArgs, { cwd: dir, env: { ...childEnv(), ...account?.env }, stdio: ["pipe", "pipe", "pipe"] });
        running = child;
        let finalText = "";
        let ok = false;
        let stderr = "";
        let buf = "";
        let toolCalls = 0;
        let quota: Quota | null = null;

        const onLine = (line: string) => {
          let d: Record<string, unknown>;
          try { d = JSON.parse(line); } catch { return; }
          if (provider === "claude") {
            const msg = d.message as { content?: { type: string; name?: string; input?: unknown; text?: string }[] } | undefined;
            if (d.type === "assistant") {
              for (const c of msg?.content ?? []) {
                if (c.type === "tool_use") { toolCalls++; toolLog.push({ name: String(c.name).replace(/^mcp__mc-designer__/, ""), input: c.input }); emit({ type: "tool", name: String(c.name).replace(/^mcp__mc-designer__/, ""), detail: short(c.input) }); }
                else if (c.type === "text" && c.text?.trim()) emit({ type: "text", text: c.text.trim() });
              }
            } else if (d.type === "result") {
              ok = d.subtype === "success" && !d.is_error;
              finalText = typeof d.result === "string" ? d.result : "";
            } else if (d.type === "rate_limit_event" && d.rate_limit_info) {
              quota = claudeQuota(d.rate_limit_info as Parameters<typeof claudeQuota>[0]);
            }
          } else {
            const item = d.item as { type?: string; tool?: string; arguments?: unknown; text?: string } | undefined;
            if (d.type === "item.started" && item?.type === "mcp_tool_call") { toolCalls++; toolLog.push({ name: String(item.tool), input: item.arguments }); emit({ type: "tool", name: item.tool, detail: short(item.arguments) }); }
            else if (d.type === "item.completed" && item?.type === "agent_message" && item.text) { finalText = item.text; emit({ type: "text", text: item.text }); }
            else if (d.type === "turn.completed") ok = true;
            else if (d.type === "turn.failed" || d.type === "error") { finalText = short(d.error ?? d.message ?? d, 300); emit({ type: "text", text: finalText }); }
          }
        };
        child.stdout!.on("data", (chunk) => {
          buf += chunk;
          let i;
          while ((i = buf.indexOf("\n")) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
        });
        child.stderr!.on("data", (c) => { stderr = (stderr + c).slice(-4000); });
        let settled = false;
        const settle = async (extra?: string) => {
          if (settled) return;
          settled = true;
          const text = finalText || extra || (ok ? "" : stderr.trim().split("\n").slice(-3).join("\n"));
          const q = quota as Quota | null;
          if (account) {
            if (q) await recordQuota(account.id, q).catch(() => {});
            const limited = !ok && ((q && q.status === "limited") || isLimitError(text));
            if (limited && !q) await markLimited(account.id).catch(() => {});
            await account.finish().catch(() => {});
            if (limited && !aborted && toolCalls === 0 && index + 1 < queue.length) {
              emit({ type: "info", text: `"${account.label}" is at its usage limit — switching to the next account.` });
              void attempt(index + 1);
              return;
            }
          }
          end(ok, text);
        };
        child.on("error", (e) => void settle(`Could not start ${provider}: ${e.message}`));
        child.on("close", () => void settle());
        child.stdin!.end(stdin);
      };

      // Browser pressed Stop or closed the tab → end the agent (and with it its MCP server).
      request.signal.addEventListener("abort", () => { aborted = true; closed = true; running?.kill("SIGTERM"); });
      void attempt(0);
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
