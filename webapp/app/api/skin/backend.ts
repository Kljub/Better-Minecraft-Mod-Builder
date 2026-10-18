import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

/**
 * The two places the Item Skin Generator can run, both speaking the same Gradio API:
 * - "local": tools/skin-generator/server.py on this machine's GPU, started/stopped from the app
 * - "space": the public demo Space on Hugging Face (shared ZeroGPU quota)
 * URLs are server config on purpose, never taken from the request.
 */
export type SkinBackend = "local" | "space";

export const BACKEND_URLS: Record<SkinBackend, string> = {
  local: (process.env.SKIN_GENERATOR_LOCAL_URL || "http://127.0.0.1:7860").replace(/\/$/, ""),
  space: (process.env.SKIN_GENERATOR_SPACE_URL || "https://yuuki14202028-minecraft-item-16px-demo.hf.space").replace(/\/$/, ""),
};

/** Only the HF Space gets the token — the local server needs none. */
export function backendHeaders(backend: SkinBackend): Record<string, string> {
  const token = process.env.HF_TOKEN?.trim();
  return backend === "space" && token ? { Authorization: `Bearer ${token}` } : {};
}

const TOOL_DIR = process.env.SKIN_GENERATOR_DIR || join(process.cwd(), "..", "tools", "skin-generator");
const PYTHON = join(TOOL_DIR, ".venv", "bin", "python");
const MAX_LOG_LINES = 300;

interface LocalProcess {
  proc: ChildProcess | null;
  logs: string[];
  exitCode: number | null;
  device: { device: string; model: string; dtype: string } | null;
}

// Survives dev-server module reloads, so a running server isn't orphaned by an edit.
const g = globalThis as typeof globalThis & { __skinLocal?: LocalProcess };
const state: LocalProcess = (g.__skinLocal ??= { proc: null, logs: [], exitCode: null, device: null });

function log(chunk: Buffer) {
  // tqdm-style progress lines end in \r — keep only the last state of each
  for (const line of chunk.toString().split(/\r?\n/)) {
    const last = line.split("\r").pop()!.trimEnd();
    if (last) state.logs.push(last);
  }
  if (state.logs.length > MAX_LOG_LINES) state.logs.splice(0, state.logs.length - MAX_LOG_LINES);
}

export function isInstalled(): boolean {
  return existsSync(join(TOOL_DIR, "server.py")) && existsSync(PYTHON);
}

export function isRunning(): boolean {
  return state.proc !== null && state.proc.exitCode === null && state.proc.signalCode === null;
}

export function startLocal(): void {
  if (isRunning()) return;
  if (!isInstalled()) throw new Error(`Local backend not installed — see tools/skin-generator/README.md (expected ${PYTHON})`);
  const port = new URL(BACKEND_URLS.local).port || "7860";
  state.logs = [];
  state.exitCode = null;
  state.device = null;
  const proc = spawn(PYTHON, ["-u", "server.py"], {
    cwd: TOOL_DIR,
    env: { ...process.env, SKIN_GENERATOR_PORT: port, GRADIO_ANALYTICS_ENABLED: "False" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout!.on("data", log);
  proc.stderr!.on("data", log);
  proc.on("exit", (code, signal) => {
    state.exitCode = code;
    state.logs.push(`[process exited: ${signal ?? `code ${code}`}]`);
  });
  proc.on("error", (e) => state.logs.push(`[spawn failed: ${e.message}]`));
  state.proc = proc;
}

export function stopLocal(): void {
  const proc = state.proc;
  if (!proc || !isRunning()) return;
  proc.kill("SIGTERM");
  setTimeout(() => { if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL"); }, 5000).unref();
}

/** Reachable = the Gradio API answers; also true for a server started by hand outside the app. */
export async function localStatus() {
  let reachable = false;
  try {
    const res = await fetch(`${BACKEND_URLS.local}/gradio_api/info`, { signal: AbortSignal.timeout(1500) });
    reachable = res.ok;
  } catch { /* not up (yet) */ }
  if (reachable && !state.device) {
    try {
      const [out] = await callGradio("local", "status", [], AbortSignal.timeout(5000));
      state.device = (out as LocalProcess["device"]) ?? null;
    } catch { /* older server without /status — fine */ }
  }
  return {
    installed: isInstalled(),
    running: isRunning(),
    reachable,
    device: reachable ? state.device : null,
    exitCode: isRunning() ? null : state.exitCode,
    logs: state.logs.slice(-80),
    url: BACKEND_URLS.local,
  };
}

/** Gradio's two-step call API: POST queues the job, GET streams SSE until "complete" or "error". */
export async function callGradio(backend: SkinBackend, endpoint: string, data: unknown[], signal: AbortSignal): Promise<unknown[]> {
  const base = BACKEND_URLS[backend];
  const queued = await fetch(`${base}/gradio_api/call/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...backendHeaders(backend) },
    body: JSON.stringify({ data }),
    signal,
  });
  if (!queued.ok) throw new Error(`Generator rejected the request (${queued.status})`);
  const { event_id } = (await queued.json()) as { event_id?: string };
  if (!event_id) throw new Error("Generator returned no job id");

  const stream = await fetch(`${base}/gradio_api/call/${endpoint}/${event_id}`, { headers: backendHeaders(backend), signal });
  if (!stream.ok) throw new Error(`Generator stream failed (${stream.status})`);
  const text = await stream.text();
  let event = "";
  for (const line of text.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) {
      const payload = line.slice(5).trim();
      if (event === "complete") return JSON.parse(payload) as unknown[];
      if (event === "error") {
        // gr.Error messages arrive here; the Space hides other errors (and ZeroGPU quota) behind null.
        const msg = payload && payload !== "null" ? String(JSON.parse(payload)) : "";
        throw new Error(msg || (backend === "space"
          ? "Generation failed on the Space (GPU quota exhausted or Space busy — try again later, set HF_TOKEN, or use the local backend)"
          : "Generation failed on the local server — see its log"));
      }
    }
  }
  throw new Error("Generator stream ended without a result");
}
