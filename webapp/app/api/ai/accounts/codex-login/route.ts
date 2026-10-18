import { spawn } from "child_process";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { requireUser } from "@/lib/server/auth";
import { addAccount, updateAccount } from "@/lib/server/aiAccounts";
import { childEnv, guardRequest } from "../../cli";

/**
 * Links a Codex account. Runs `codex login` with a throw-away CODEX_HOME and stores the resulting
 * auth.json encrypted; the temp dir is deleted in every case.
 * Body: { label?, apiKey?, replaceId? } — with apiKey: `codex login --with-api-key` (key on stdin);
 * without: device login, streamed as NDJSON:
 *   {type:"code", url, code}  → show to the user
 *   {type:"done", ok, id?, error?}
 */
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

export async function POST(request: Request) {
  const refused = guardRequest(request);
  if (refused) return refused;
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  let body: { label?: unknown; apiKey?: unknown; replaceId?: unknown } = {};
  try { body = await request.json(); } catch { /* empty body = device login */ }
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 100) : "Codex account";
  const replaceId = Number.isInteger(Number(body.replaceId)) && body.replaceId != null ? Number(body.replaceId) : null;
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (apiKey && !/^sk-[\w-]{20,}$/.test(apiKey)) return Response.json({ error: "That doesn't look like an OpenAI API key (sk-…)." }, { status: 400 });

  const home = await mkdtemp(join(tmpdir(), "mmb-codex-login-"));
  const save = async (): Promise<number> => {
    const auth = await readFile(join(home, "auth.json"), "utf8");
    if (replaceId != null) { await updateAccountSecret(user.id, replaceId, auth); return replaceId; }
    return addAccount(user.id, { provider: "codex", kind: "codex_auth", label, secret: auth });
  };

  if (apiKey) {
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        const child = spawn("codex", ["login", "--with-api-key"], { env: { ...childEnv(), CODEX_HOME: home }, stdio: ["pipe", "ignore", "ignore"] });
        child.on("error", reject);
        child.on("close", resolve);
        child.stdin.end(apiKey);
      });
      if (code !== 0) return Response.json({ error: "codex login failed" }, { status: 502 });
      return Response.json({ id: await save() });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const emit = (ev: Record<string, unknown>) => { if (!closed) controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n")); };
      const child = spawn("codex", ["login", "--device-auth"], { env: { ...childEnv(), CODEX_HOME: home }, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let sent = false;
      const onData = (d: Buffer) => {
        out = strip(out + d.toString()).slice(-8000);
        if (sent) return;
        const url = out.match(/https:\/\/\S+/)?.[0];
        const code = out.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\b/)?.[0];
        if (url && code) { sent = true; emit({ type: "code", url, code }); }
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      const timer = setTimeout(() => child.kill("SIGTERM"), 16 * 60_000); // device codes expire after 15 min
      child.on("close", async (code) => {
        clearTimeout(timer);
        try {
          if (code === 0) emit({ type: "done", ok: true, id: await save() });
          else emit({ type: "done", ok: false, error: out.trim().split("\n").slice(-2).join(" ") || `codex login exited ${code}` });
        } catch (e) {
          emit({ type: "done", ok: false, error: (e as Error).message });
        } finally {
          await rm(home, { recursive: true, force: true }).catch(() => {});
          if (!closed) { closed = true; controller.close(); }
        }
      });
      request.signal.addEventListener("abort", () => { closed = true; child.kill("SIGTERM"); });
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}

async function updateAccountSecret(userId: number, id: number, auth: string) {
  await updateAccount(userId, id, { secret: auth, kind: "codex_auth" });
}
