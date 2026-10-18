import { spawn } from "child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import { homedir, tmpdir } from "os";
import { join } from "path";
import type { Quota, RunAccount } from "@/lib/server/aiAccounts";
import { claudeQuota } from "@/lib/server/aiAccounts";

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
 *
 * runCodexImage is the one exception: codex's built-in image_gen tool (gpt-image, on the ChatGPT
 * login), same read-only sandbox. Codex saves what it generates under
 * $CODEX_HOME/generated_images/<thread id>/ — read from there and deleted afterwards.
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

function run(cmd: string, args: string[], opts: { stdin?: string; cwd?: string; timeoutMs?: number; env?: Record<string, string> } = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...childEnv(), ...opts.env }, stdio: ["pipe", "pipe", "pipe"] });
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

export interface StructuredImage { mediaType: string; data: string; label?: string }

export async function runStructured(
  provider: CliProvider,
  model: string,
  system: string,
  prompt: string,
  schema: object,
  /** a linked account (Settings → AI) instead of the host's own CLI login */
  account?: RunAccount,
  onQuota?: (q: Quota) => void,
  /** reference images (base64 without data: prefix), e.g. renders of a 3D model to rig */
  images: StructuredImage[] = [],
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
        messages: [{ role: "system", content: system }, { role: "user", content: prompt, ...(images.length ? { images: images.map((i) => i.data) } : {}) }],
      }),
    }, TIMEOUT_MS);
    try { return JSON.parse(out.message?.content ?? ""); }
    catch { throw new Error(`ollama (${name}) returned no valid JSON`); }
  }

  const dir = await mkdtemp(join(tmpdir(), "mc-ui-ai-"));
  try {
    if (provider === "claude") {
      // stream-json: same result event as "json", plus rate_limit_event with the account's quota.
      const args = [
        "-p", "--output-format", "stream-json", "--verbose", "--tools", "", "--no-session-persistence", "--setting-sources", "",
        "--system-prompt", system, "--json-schema", JSON.stringify(schema),
      ];
      if (model) args.push("--model", model);
      let stdin = prompt;
      if (images.length) {
        // Images go in as content blocks of one stream-json user message, each after its label.
        args.push("--input-format", "stream-json");
        stdin = JSON.stringify({ type: "user", message: { role: "user", content: [
          ...images.flatMap((img) => [
            ...(img.label ? [{ type: "text", text: `${img.label}:` }] : []),
            { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } },
          ]),
          { type: "text", text: prompt },
        ] } }) + "\n";
      }
      const { code, stdout, stderr } = await run("claude", args, { stdin, cwd: dir, env: account?.env });
      type ResultEvent = { is_error?: boolean; result?: string; structured_output?: unknown };
      let out: ResultEvent | null = null;
      for (const line of stdout.split("\n")) {
        let ev: ResultEvent & { type?: string; rate_limit_info?: Parameters<typeof claudeQuota>[0] };
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev?.type === "result") out = ev;
        else if (ev?.type === "rate_limit_event" && ev.rate_limit_info) onQuota?.(claudeQuota(ev.rate_limit_info));
      }
      if (code !== 0 || !out || out.is_error) {
        throw new Error(`claude failed: ${out?.result ?? lastLines(stderr || stdout)}`);
      }
      return out.structured_output ?? JSON.parse(out.result ?? "");
    }

    const schemaPath = join(dir, "schema.json");
    const outPath = join(dir, "out.json");
    await writeFile(schemaPath, JSON.stringify(schema));
    const args = [
      "exec", "--sandbox", "read-only", "--skip-git-repo-check", "--color", "never", "--ignore-user-config",
      "--output-schema", schemaPath, "-o", outPath,
    ];
    // With a linked account the session goes to its private CODEX_HOME (read for rate limits,
    // then deleted); with the host login, keep nothing.
    if (!account) args.push("--ephemeral");
    if (model) args.push("-m", model);
    for (const [i, img] of images.entries()) {
      const file = join(dir, `image-${i + 1}.${img.mediaType === "image/jpeg" ? "jpg" : img.mediaType.split("/")[1]}`);
      await writeFile(file, Buffer.from(img.data, "base64"));
      args.push("-i", file);
    }
    args.push("-");
    const imageList = images.length ? `\n\nAttached images, in order:\n${images.map((img, i) => `${i + 1}. ${img.label || "image"}`).join("\n")}` : "";
    // codex exec has no system-prompt flag — instructions go in front of the request.
    const { code, stdout, stderr } = await run("codex", args, { stdin: `${system}\n\n---\n\n${prompt}${imageList}`, cwd: dir, env: account?.env });
    if (code !== 0) throw new Error(`codex failed: ${lastLines(stderr || stdout)}`);
    return JSON.parse(await readFile(outPath, "utf-8"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const IMAGE_TIMEOUT_MS = 420_000;

/** Generates `count` images with codex's image_gen tool — or edits `image` (PNG) when given — and
 * returns the PNGs. Takes ~40 s per image. */
/** With a linked account (Settings → AI) the run uses its private CODEX_HOME — images and the
 * session with its rate limits land there (finish() reads the quota, then deletes it). */
export async function runCodexImage(prompt: string, count: number, image?: Buffer, account?: RunAccount): Promise<Buffer[]> {
  const dir = await mkdtemp(join(tmpdir(), "mc-ui-img-"));
  let threadDir: string | null = null;
  try {
    const args = ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--color", "never", "--ignore-user-config", "--json"];
    if (!account) args.push("--ephemeral");
    if (image) {
      await writeFile(join(dir, "input.png"), image);
      args.push("-i", join(dir, "input.png"));
    }
    args.push("-");
    const task = image
      ? `Use the image_gen tool ${count === 1 ? "once" : `exactly ${count} times (independent variations)`} to edit the attached image: ${prompt}`
      : `Use the image_gen tool ${count === 1 ? "once" : `exactly ${count} times (independent variations)`} to generate: ${prompt}`;
    const { code, stdout, stderr } = await run("codex", args, {
      stdin: `${task}\n\nDo not write or modify any files. When done, reply with OK.`,
      cwd: dir,
      timeoutMs: IMAGE_TIMEOUT_MS,
      env: account?.env,
    });
    let threadId: string | null = null;
    for (const line of stdout.split("\n")) {
      try {
        const ev = JSON.parse(line) as { type?: string; thread_id?: string };
        if (ev.type === "thread.started" && ev.thread_id) threadId = ev.thread_id;
      } catch { /* not JSON */ }
    }
    if (code !== 0 || !threadId) throw new Error(`codex failed: ${lastLines(stderr || stdout)}`);
    // the thread id comes from codex's own output; still keep it to a safe charset for the path
    if (!/^[\w-]+$/.test(threadId)) throw new Error("codex returned an unexpected thread id");
    threadDir = join(account?.codexHome || process.env.CODEX_HOME || join(homedir(), ".codex"), "generated_images", threadId);
    let files: string[] = [];
    try { files = (await readdir(threadDir)).filter((f) => f.endsWith(".png")).sort(); } catch { /* none */ }
    if (files.length === 0) throw new Error("codex finished without generating an image (image generation may be unavailable for this login)");
    return Promise.all(files.map((f) => readFile(join(threadDir!, f))));
  } finally {
    await rm(dir, { recursive: true, force: true });
    if (threadDir) await rm(threadDir, { recursive: true, force: true });
  }
}
