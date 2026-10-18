import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Server-side bridge to the local AI clients used by the Settings → AI integration. The CLIs run
 * non-interactively with their own login (no API key in the app) and are locked down so a prompt
 * can only produce text, never act on the machine:
 * - claude: `--tools ""` (no tools at all), custom system prompt, no session persistence, and
 *   `--setting-sources ""` so the user's own hooks/plugins/style rules don't leak in
 * - codex:  `--sandbox read-only`, ephemeral, `--ignore-user-config`, in an empty temp dir
 * - ollama: plain HTTP to the local Ollama server (OLLAMA_HOST, default 127.0.0.1:11434) — the
 *   URL is server config on purpose, never taken from the request.
 * All are given a JSON Schema so the answer comes back as structured output.
 */
export type CliProvider = "claude" | "codex" | "ollama";

const OLLAMA_URL = (() => {
  const h = process.env.OLLAMA_HOST || "127.0.0.1:11434";
  return (/^https?:\/\//.test(h) ? h : `http://${h}`).replace(/\/$/, "");
})();

const TIMEOUT_MS = 180_000;

/** Only reachable from the dev server, and only from the app's own pages — a random website
 * open in the same browser must not be able to spend the user's CLI subscription. */
export function guardRequest(request: Request): Response | null {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "AI integration only runs on the local dev server (npm run dev)." }, { status: 404 });
  }
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return Response.json({ error: "Cross-origin request refused" }, { status: 403 });
    } catch {
      return Response.json({ error: "Bad origin" }, { status: 403 });
    }
  }
  return null;
}

export function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // If the dev server itself was started from inside a Claude Code session, don't let the child
  // think it's nested in that session.
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}

function run(cmd: string, args: string[], opts: { stdin?: string; cwd?: string; timeoutMs?: number } = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: childEnv(), stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} timed out after ${Math.round((opts.timeoutMs ?? TIMEOUT_MS) / 1000)}s`));
    }, opts.timeoutMs ?? TIMEOUT_MS);
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    child.stdin.end(opts.stdin ?? "");
  });
}

async function ollamaJson<T>(path: string, init?: RequestInit, timeoutMs = 5_000): Promise<T> {
  const res = await fetch(`${OLLAMA_URL}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`ollama: ${body?.error ?? `HTTP ${res.status}`}`);
  return body as T;
}

/** Installed Ollama models, or null when the Ollama server isn't reachable. */
export async function ollamaModels(): Promise<string[] | null> {
  try {
    const { models } = await ollamaJson<{ models?: { name: string }[] }>("/api/tags");
    return (models ?? []).map((m) => m.name);
  } catch {
    return null;
  }
}

export async function cliVersion(provider: CliProvider): Promise<string | null> {
  if (provider === "ollama") {
    try { return `ollama ${(await ollamaJson<{ version: string }>("/api/version")).version}`; } catch { return null; }
  }
  try {
    const { code, stdout } = await run(provider, ["--version"], { timeoutMs: 15_000 });
    return code === 0 ? stdout.trim() : null;
  } catch {
    return null;
  }
}

function lastLines(s: string, n = 5) {
  return s.trim().split("\n").slice(-n).join("\n");
}

export async function runStructured(
  provider: CliProvider,
  model: string,
  system: string,
  prompt: string,
  schema: object,
): Promise<unknown> {
  if (provider === "ollama") {
    const name = model || (await ollamaModels())?.[0];
    if (!name) throw new Error(`No Ollama model installed (or Ollama not running at ${OLLAMA_URL}) — try \`ollama pull qwen3\`.`);
    const out = await ollamaJson<{ message?: { content?: string } }>("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: name,
        stream: false,
        format: schema,
        options: { temperature: 0.4 },
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      }),
    }, TIMEOUT_MS);
    try { return JSON.parse(out.message?.content ?? ""); }
    catch { throw new Error(`ollama (${name}) returned no valid JSON`); }
  }

  const dir = await mkdtemp(join(tmpdir(), "mc-ui-ai-"));
  try {
    if (provider === "claude") {
      const args = [
        "-p", "--output-format", "json", "--tools", "", "--no-session-persistence", "--setting-sources", "",
        "--system-prompt", system, "--json-schema", JSON.stringify(schema),
      ];
      if (model) args.push("--model", model);
      const { code, stdout, stderr } = await run("claude", args, { stdin: prompt, cwd: dir });
      let out: { is_error?: boolean; result?: string; structured_output?: unknown } | null = null;
      try { out = JSON.parse(stdout); } catch { /* handled below */ }
      if (code !== 0 || !out || out.is_error) {
        throw new Error(`claude failed: ${out?.result ?? lastLines(stderr || stdout)}`);
      }
      return out.structured_output ?? JSON.parse(out.result ?? "");
    }

    const schemaPath = join(dir, "schema.json");
    const outPath = join(dir, "out.json");
    await writeFile(schemaPath, JSON.stringify(schema));
    const args = [
      "exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--color", "never", "--ignore-user-config",
      "--output-schema", schemaPath, "-o", outPath,
    ];
    if (model) args.push("-m", model);
    args.push("-");
    // codex exec has no system-prompt flag — instructions go in front of the request.
    const { code, stdout, stderr } = await run("codex", args, { stdin: `${system}\n\n---\n\n${prompt}`, cwd: dir });
    if (code !== 0) throw new Error(`codex failed: ${lastLines(stderr || stdout)}`);
    return JSON.parse(await readFile(outPath, "utf-8"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
