/**
 * Texture Editor side chat ("layerPaint"): Claude / Codex / Ollama sees the texture (all visible
 * layers, plus the active layer on its own) and answers a request like "add a dragon head
 * silhouette" with pixels — a small palette and one string per row — that the editor paints onto
 * a new layer (or the active one). Runs as a structured task through app/api/ai/generate; the
 * answer is validated here, never trusted as-is.
 *
 * Textures bigger than 64 px are drawn on a coarser grid (each grid cell = f×f texels) so the
 * answer stays a manageable size.
 */

export const LAYER_PAINT_MAX_GRID = 64;
/** "." = leave this pixel as it is (transparent on a new layer) */
export const LAYER_PAINT_EMPTY = ".";

export interface LayerPaintContext {
  /** texture size in pixels */
  width: number;
  height: number;
  /** grid the answer is drawn on (= the texture size up to 64 px) */
  gridWidth: number;
  gridHeight: number;
  layerNames: string[];
  activeLayer: string;
  /** earlier turns of the chat, oldest first */
  history: { role: "user" | "assistant"; text: string }[];
}

export interface LayerPaintResult {
  /** a short answer for the chat */
  reply: string;
  target: "new_layer" | "active_layer";
  layerName: string;
  palette: { key: string; color: string }[];
  /** gridHeight strings of gridWidth characters */
  rows: string[];
}

/** Grid for a texture: its own size, or every f-th texel past 64 px. */
export function layerPaintGrid(width: number, height: number): { gridWidth: number; gridHeight: number; factor: number } {
  const factor = Math.max(1, Math.ceil(Math.max(width, height) / LAYER_PAINT_MAX_GRID));
  return { gridWidth: Math.ceil(width / factor), gridHeight: Math.ceil(height / factor), factor };
}

export const LAYER_PAINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "target", "layerName", "palette", "rows"],
  properties: {
    reply: { type: "string" },
    target: { type: "string", enum: ["new_layer", "active_layer"] },
    layerName: { type: "string" },
    palette: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["key", "color"],
        properties: { key: { type: "string" }, color: { type: "string" } },
      },
    },
    rows: { type: "array", items: { type: "string" } },
  },
} as const;

export function layerPaintSystem(c: LayerPaintContext): string {
  return [
    "You are a pixel artist working inside a Minecraft texture editor. The user asks you to add or change something on their texture.",
    `The texture is ${c.width}×${c.height} px; you draw on a ${c.gridWidth}×${c.gridHeight} grid${c.gridWidth !== c.width ? ` (each grid cell covers ${layerPaintGrid(c.width, c.height).factor}×${layerPaintGrid(c.width, c.height).factor} texture pixels)` : " (one cell = one pixel)"}.`,
    "Image 1 is the whole texture as it looks now (all visible layers, enlarged pixel-exact, transparency shown as a checkerboard).",
    "Image 2 is the active layer on its own. Grid cell (0,0) is the top-left corner.",
    "Answer with pixels: `palette` maps single characters to #rrggbb colours (at most 24 entries, never \".\"), and `rows` holds exactly",
    `${c.gridHeight} strings of exactly ${c.gridWidth} characters each, top row first — every character a palette key or "." for "leave this pixel alone".`,
    "Only draw what was asked for; leave everything else \".\" — your pixels go onto their own layer on top (target \"new_layer\", the default),",
    "or onto the active layer (target \"active_layer\") only when the user explicitly asks to change that layer.",
    "Fit the addition to what is already there: position it sensibly relative to the existing shapes, use the texture's style and palette",
    "(flat Minecraft pixel art, a darker outline where it helps readability), and keep silhouettes clean and recognisable at this size.",
    "`layerName`: a short name for the new layer (e.g. \"dragon head\"). `reply`: one or two sentences in the user's language about what you drew.",
  ].join("\n");
}

export function layerPaintPrompt(request: string, c: LayerPaintContext): string {
  const history = c.history.slice(-6).map((t) => `${t.role === "user" ? "User" : "You"}: ${t.text}`).join("\n");
  return [
    `Layers (bottom → top): ${c.layerNames.map((n) => `"${n}"`).join(", ")}. Active layer: "${c.activeLayer}".`,
    history && `Earlier in this chat:\n${history}`,
    `Request: ${request}`,
  ].filter(Boolean).join("\n\n");
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);

export function sanitizeLayerPaintContext(raw: unknown): LayerPaintContext {
  const r = (raw ?? {}) as Record<string, unknown>;
  const width = num(r.width, 1, 4096, 16), height = num(r.height, 1, 4096, 16);
  const grid = layerPaintGrid(width, height);
  const names = Array.isArray(r.layerNames) ? r.layerNames.filter((n): n is string => typeof n === "string").map((n) => n.slice(0, 40)).slice(0, 32) : [];
  const history = Array.isArray(r.history)
    ? r.history.flatMap((t) => {
      const x = (t ?? {}) as { role?: unknown; text?: unknown };
      return (x.role === "user" || x.role === "assistant") && typeof x.text === "string" ? [{ role: x.role as "user" | "assistant", text: x.text.slice(0, 300) }] : [];
    }).slice(-6)
    : [];
  return {
    width, height, ...grid, layerNames: names.length ? names : ["Layer 1"],
    activeLayer: typeof r.activeLayer === "string" ? r.activeLayer.slice(0, 40) : names[names.length - 1] ?? "Layer 1",
    history,
  };
}

/** Clean answer: known palette keys only, rows padded/cut to the grid. Throws when nothing usable came back. */
export function validateLayerPaint(raw: unknown, c: Pick<LayerPaintContext, "gridWidth" | "gridHeight">): LayerPaintResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const palette = (Array.isArray(r.palette) ? r.palette : [])
    .map((p) => (p ?? {}) as { key?: unknown; color?: unknown })
    .filter((p): p is { key: string; color: string } => typeof p.key === "string" && [...p.key].length === 1 && p.key !== LAYER_PAINT_EMPTY && typeof p.color === "string" && HEX.test(p.color))
    .slice(0, 32);
  const keys = new Set(palette.map((p) => p.key));
  const src = Array.isArray(r.rows) ? r.rows.filter((x): x is string => typeof x === "string") : [];
  const rows = Array.from({ length: c.gridHeight }, (_, y) => {
    const chars = [...(src[y] ?? "")].slice(0, c.gridWidth).map((ch) => (keys.has(ch) ? ch : LAYER_PAINT_EMPTY));
    return chars.join("").padEnd(c.gridWidth, LAYER_PAINT_EMPTY);
  });
  if (!rows.some((row) => [...row].some((ch) => ch !== LAYER_PAINT_EMPTY))) throw new Error("The AI didn't draw any pixels — try describing it differently.");
  return {
    reply: typeof r.reply === "string" ? r.reply.trim().slice(0, 500) : "",
    target: r.target === "active_layer" ? "active_layer" : "new_layer",
    layerName: (typeof r.layerName === "string" && r.layerName.trim() ? r.layerName.trim() : "AI").slice(0, 40),
    palette, rows,
  };
}

/** The answer as pixels at the texture's size (grid cells scaled up by `factor`). */
export function rasterizeLayerPaint(res: LayerPaintResult, width: number, height: number, factor: number): ImageData {
  const out = new ImageData(width, height);
  const color = new Map(res.palette.map((p) => [p.key, [parseInt(p.color.slice(1, 3), 16), parseInt(p.color.slice(3, 5), 16), parseInt(p.color.slice(5, 7), 16)]]));
  res.rows.forEach((row, gy) => [...row].forEach((ch, gx) => {
    const rgb = color.get(ch);
    if (!rgb) return;
    for (let y = gy * factor; y < Math.min(height, (gy + 1) * factor); y++) {
      for (let x = gx * factor; x < Math.min(width, (gx + 1) * factor); x++) {
        const i = (y * width + x) * 4;
        out.data[i] = rgb[0]; out.data[i + 1] = rgb[1]; out.data[i + 2] = rgb[2]; out.data[i + 3] = 255;
      }
    }
  }));
  return out;
}
