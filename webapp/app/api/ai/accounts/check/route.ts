import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";
import { requireUser } from "@/lib/server/auth";
import { claudeQuota, isLimitError, listAccounts, markLimited, openAccount, recordQuota, type Quota } from "@/lib/server/aiAccounts";
import { accountQueue } from "@/lib/server/aiAccounts";
import { childEnv, guardRequest } from "../../cli";

/**
 * POST ?id= — checks one linked account with a minimal run ("reply ok") and stores its quota.
 * Claude reports its windows in the run's rate_limit_event; Codex writes rate_limits into the
 * session that openAccount's CODEX_HOME collects (read in finish()).
 */
function runCli(cmd: string, args: string[], env: Record<string, string>, stdin: string, cwd: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...childEnv(), ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr = (stderr + d).slice(-4000); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    child.stdin.end(stdin);
  });
}

export async function POST(request: Request) {
  const refused = guardRequest(request);
  if (refused) return refused;
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const id = Number(new URL(request.url).searchParams.get("id"));
  const row = (await accountQueue(user.id, "claude")).concat(await accountQueue(user.id, "codex")).find((r) => r.id === id);
  if (!row) return Response.json({ error: "Account not found or disabled" }, { status: 404 });

  const account = await openAccount(user.id, row);
  const dir = await mkdtemp(join(tmpdir(), "mmb-check-"));
  let error: string | null = null;
  try {
    if (row.provider === "claude") {
      const { code, stdout, stderr } = await runCli("claude",
        ["-p", "--output-format", "stream-json", "--verbose", "--tools", "", "--no-session-persistence", "--setting-sources", "", "--model", "haiku"],
        account.env, "Reply with the single word ok.", dir);
      let quota: Quota | null = null;
      let result: { is_error?: boolean; result?: string } | null = null;
      for (const line of stdout.split("\n")) {
        try {
          const ev = JSON.parse(line);
          if (ev.type === "rate_limit_event" && ev.rate_limit_info) quota = claudeQuota(ev.rate_limit_info);
          if (ev.type === "result") result = ev;
        } catch { /* not json */ }
      }
      if (quota) await recordQuota(row.id, quota);
      if (code !== 0 || !result || result.is_error) error = result?.result || stderr.trim().split("\n").slice(-2).join(" ") || `exit ${code}`;
    } else {
      const { code, stdout, stderr } = await runCli("codex",
        ["exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check", "--color", "never", "--ignore-user-config", "-"],
        account.env, "Reply with the single word ok.", dir);
      if (code !== 0 || !stdout.includes("turn.completed")) error = stderr.trim().split("\n").slice(-2).join(" ") || `exit ${code}`;
    }
    if (error && isLimitError(error)) await markLimited(row.id);
  } finally {
    await account.finish().catch(() => {});
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  const updated = (await listAccounts(user.id)).find((a) => a.id === id);
  return Response.json({ ok: !error, error, account: updated });
}
