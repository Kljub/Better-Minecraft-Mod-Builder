import { BACKEND_URLS, backendHeaders, callGradio, type SkinBackend } from "../backend";

/**
 * Item Skin Generator: runs the yuuki14202028/minecraft-item-16px model (SD 1.5 fine-tune that
 * draws real 16×16 item textures) on the chosen backend — the local server (tools/skin-generator)
 * or the public demo Space. Both do the model's post-processing (fold 256px → 16×16, key out the
 * magenta background), so what comes back are ready-to-use 16×16 RGBA PNGs.
 *
 * Server-side on purpose: the generated files are fetched here and handed to the browser as data
 * URLs, and an optional HF_TOKEN (raises the Space's ZeroGPU quota) never reaches the client.
 */
const TIMEOUT_MS = 180_000;
/** local-only modes: their first call loads (and maybe downloads) another model — SDXL for player
 * skins, SD 1.5 for the block LoRA — and SDXL runs with CPU offload */
const LOCAL_ONLY_TIMEOUT_MS = 600_000;
/** a 256×256 RGBA PNG is well below this; the sketch is meant to be a small texture */
const MAX_SKETCH_BYTES = 2 * 1024 * 1024;

type Mode = "text" | "sketch" | "set" | "block" | "player" | "armor" | "gui";
const LOCAL_ONLY: Mode[] = ["block", "player", "armor", "gui"];
/** modes that run the SDXL skin model: fewer images, more steps */
const SDXL: Mode[] = ["player", "armor"];
const BLOCK_SIZES = [16, 32, 64, 128, 256];

/** Only the app's own pages may call this — a random website open in the same browser must not
 * be able to burn the user's GPU / HF quota through it. */
function refuseCrossOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return null;
  try {
    return new URL(origin).host === host ? null : Response.json({ error: "Cross-origin request refused" }, { status: 403 });
  } catch {
    return Response.json({ error: "Bad origin" }, { status: 403 });
  }
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
};

/** Uploads the sketch PNG to the backend and returns the Gradio file reference for it. */
async function uploadSketch(backend: SkinBackend, dataUrl: string, signal: AbortSignal) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error("Sketch must be a PNG data URL");
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length > MAX_SKETCH_BYTES) throw new Error("Sketch image is too large");
  const form = new FormData();
  form.append("files", new Blob([bytes], { type: "image/png" }), "sketch.png");
  const res = await fetch(`${BACKEND_URLS[backend]}/gradio_api/upload`, { method: "POST", body: form, headers: backendHeaders(backend), signal });
  if (!res.ok) throw new Error(`Sketch upload failed (${res.status})`);
  const [path] = (await res.json()) as string[];
  return { path, meta: { _type: "gradio.FileData" } };
}

/** an ImageEditor input's value for an uploaded file */
const editorValue = (file: unknown) => ({ background: file, layers: [], composite: file });

export async function POST(request: Request) {
  const refused = refuseCrossOrigin(request);
  if (refused) return refused;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const backend: SkinBackend = body.backend === "space" ? "space" : "local";
  const mode = body.mode as Mode;
  if (!["text", "sketch", "set", "block", "player", "armor", "gui"].includes(mode)) return Response.json({ error: "Unknown mode" }, { status: 400 });
  if (LOCAL_ONLY.includes(mode) && backend !== "local") return Response.json({ error: "This mode only runs on the local backend" }, { status: 400 });
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 300) : "";
  const sdxl = SDXL.includes(mode);
  const count = Math.round(clamp(body.count, 1, sdxl ? 4 : 8, sdxl ? 2 : 4));
  const steps = Math.round(clamp(body.steps, 10, sdxl ? 60 : 50, sdxl ? 40 : 30));
  const guidance = clamp(body.guidance, 1, 15, 9);
  const strength = clamp(body.strength, 0.3, 0.95, 0.6);
  // -1 (also the fallback for a missing/invalid seed) = a new random seed per run
  const seed = Math.round(clamp(body.seed, -1, 2 ** 31 - 1, -1));

  const timeoutMs = LOCAL_ONLY.includes(mode) ? LOCAL_ONLY_TIMEOUT_MS : TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let endpoint: string;
    let data: unknown[];
    if (mode === "text" || mode === "player" || mode === "armor") {
      if (!prompt) return Response.json({ error: "Enter a prompt" }, { status: 400 });
      endpoint = { text: "generate", player: "generate_player_skin", armor: "generate_armor" }[mode];
      data = [prompt, count, steps, guidance, seed];
    } else if (mode === "gui") {
      if (!prompt) return Response.json({ error: "Describe the style, e.g. \"dark oak wood with iron rivets\"" }, { status: 400 });
      // optional: an existing GUI texture to restyle (kept at its own size)
      const sketch = typeof body.sketch === "string" ? await uploadSketch(backend, body.sketch, ctrl.signal) : null;
      const width = Math.round(clamp(body.width, 16, 512, 176));
      const height = Math.round(clamp(body.height, 16, 512, 166));
      const strength = clamp(body.strength, 0, 1, 0.85);
      endpoint = "generate_gui";
      data = [sketch, prompt, Math.min(count, 4), strength, steps, guidance, seed, width, height, body.pixelate !== false];
    } else if (mode === "block") {
      if (!prompt) return Response.json({ error: "Enter a prompt, e.g. \"mossy stone bricks\"" }, { status: 400 });
      endpoint = "generate_block";
      const engine = body.engine === "lora" || body.engine === "lora119" || body.engine === "sd15" ? body.engine : "item";
      const size = BLOCK_SIZES.includes(body.size as number) ? (body.size as number) : 16;
      data = [prompt, count, steps, guidance, seed, engine, body.tileable !== false, size];
    } else {
      if (typeof body.sketch !== "string") return Response.json({ error: "Pick or draw a base image first" }, { status: 400 });
      if (mode === "sketch" && !prompt) return Response.json({ error: "Enter a prompt, e.g. \"steel wrench\"" }, { status: 400 });
      const materials = typeof body.materials === "string" ? body.materials.slice(0, 500) : "";
      if (mode === "set" && !materials.trim()) return Response.json({ error: "Enter at least one material" }, { status: 400 });
      const sketch = editorValue(await uploadSketch(backend, body.sketch, ctrl.signal));
      endpoint = mode === "sketch" ? "generate_from_sketch" : "generate_tier_set";
      data = mode === "sketch"
        ? [sketch, prompt, count, strength, steps, guidance, seed]
        : [sketch, materials, prompt, strength, steps, guidance, seed];
    }

    const out = await callGradio(backend, endpoint, data, ctrl.signal);
    // outputs: [gallery previews, files] — the files are the finished PNGs (16×16, 64×64 for skins)
    const base = BACKEND_URLS[backend];
    const files = (Array.isArray(out[1]) ? out[1] : []) as { url?: string; orig_name?: string }[];
    const images = await Promise.all(files.map(async (f) => {
      if (!f.url?.startsWith(`${base}/`)) throw new Error("Unexpected file URL from generator");
      const res = await fetch(f.url, { headers: backendHeaders(backend), signal: ctrl.signal });
      if (!res.ok) throw new Error(`Could not fetch generated image (${res.status})`);
      const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      return { name: (f.orig_name ?? "texture.png").replace(/[^\w.-]/g, "_"), dataUrl: `data:image/png;base64,${b64}` };
    }));
    return Response.json({ images });
  } catch (e) {
    const unreachable = e instanceof TypeError && backend === "local"; // fetch failed: connection refused
    const msg = ctrl.signal.aborted ? `Generator timed out after ${timeoutMs / 1000}s`
      : unreachable ? `Local generator not running at ${BACKEND_URLS.local} — start it first`
      : e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
