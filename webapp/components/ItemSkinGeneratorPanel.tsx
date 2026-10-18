"use client";

import { useState } from "react";
import { Wand2, Dices, ImagePlus, Save, Download, Check, Loader2, X, ChevronLeft, ChevronRight, Grid3x3, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TexturePickerModal from "@/components/TexturePickerModal";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTextures } from "@/lib/TextureContext";
import { downloadBlob } from "@/lib/exportBundle";
import SkinBackendControl, { loadSkinBackend, type SkinBackend } from "@/components/SkinBackendControl";
import PlayerSkinViewer3D from "@/components/PlayerSkinViewer3D";

type Mode = "text" | "sketch" | "set" | "block" | "player";
type BlockEngine = "item" | "lora";
/** what a result is: decides its preview (tiled for blocks, 3D for skins) and where it can be applied */
type Kind = "item" | "block" | "player";

interface GeneratedImage {
  id: string;
  kind: Kind;
  name: string;
  dataUrl: string;
  prompt: string;
  /** "custom/…" key once saved to Resources */
  savedKey?: string;
}

const MODES: { id: Mode; label: string; hint: string; localOnly?: boolean }[] = [
  { id: "text", label: "Item", hint: "A prompt in, 16×16 item textures out." },
  { id: "sketch", label: "From texture", hint: "You give the shape (an existing texture or a doodle), the model adds shading and material. Low strength keeps the base, high redraws it." },
  { id: "set", label: "Material set", hint: "One base design + a list of materials → a tier set with matching silhouettes (shared seed). Strength ≈ 0.5 keeps them aligned." },
  { id: "block", label: "Block", hint: "Full 16×16 block textures. Name a material (\"mossy stone bricks\", \"oak planks\"). Seamless wraps the edges so the texture tiles.", localOnly: true },
  { id: "player", label: "Player skin", hint: "A character description in, a 64×64 player skin out (SDXL — the first run loads ~7 GB, then ~20 s per skin).", localOnly: true },
];

const ENGINES: { id: BlockEngine; label: string; hint: string }[] = [
  { id: "item", label: "Item model", hint: "Pixel-exact 16px grid, tiles seamlessly. Best results in testing." },
  { id: "lora", label: "MC 1.12 LoRA", hint: "SD 1.5 + a LoRA trained on vanilla 1.12 blocks — closer to the vanilla look, downscaled from 256px, edges not fully seamless." },
];

const EXAMPLES: Partial<Record<Mode, string[]>> = {
  text: ["copper sword", "glass hammer", "emerald key", "coffee cup", "glowing molten iron sword", "ruby pickaxe", "gold skull"],
  block: ["mossy stone bricks", "oak planks", "copper block", "diamond ore", "sandstone", "purple wool"],
  player: ["a knight in golden armor", "a wizard in a blue robe", "a robot with a red visor", "a pirate captain"],
};

/** per-mode defaults (the models' recommended settings) applied when switching modes */
const DEFAULTS: Record<Mode, { prompt?: string; count: number; steps: number; guidance: number; strength?: number }> = {
  text: { prompt: "copper sword", count: 4, steps: 30, guidance: 9 },
  sketch: { prompt: "steel wrench", count: 4, steps: 40, guidance: 9, strength: 0.6 },
  set: { count: 4, steps: 40, guidance: 9, strength: 0.5 },
  block: { prompt: "mossy stone bricks", count: 4, steps: 30, guidance: 9 },
  player: { prompt: "a knight in golden armor", count: 2, steps: 40, guidance: 7.5 },
};

const KIND_OF: Record<Mode, Kind> = { text: "item", sketch: "item", set: "item", block: "block", player: "player" };
const MODEL_OF: Record<Kind, string> = {
  item: "yuuki14202028/minecraft-item-16px",
  block: "yuuki14202028/minecraft-item-16px",
  player: "monadical-labs/minecraft-skin-generator-sdxl",
};

const CHECKER = "repeating-conic-gradient(var(--muted) 0% 25%, transparent 0% 50%) 0 0 / 12px 12px";

// Session-wide, so leaving the tab and coming back keeps the last results.
let lastResults: GeneratedImage[] = [];

/** Draws any image onto a 256×256 PNG with nearest-neighbour scaling — the Space folds it back to
 * 16×16, and this keeps non-PNG or odd-sized uploads from tripping its input handling. */
async function toSketchPng(url: string): Promise<string> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, 256, 256);
  return c.toDataURL("image/png");
}

const stemOf = (prompt: string) => prompt.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "texture";

/**
 * Item Skin Generator tab: text → real 16×16 Minecraft item textures via the
 * yuuki14202028/minecraft-item-16px model (through app/api/skin/generate). Results can be saved
 * into the Resources library and applied straight to a project item.
 */
type Target = { id: string; displayName?: string; texture: string };

export default function ItemSkinGeneratorPanel({ items, blocks, onApplyToItem, onOpenItem, onApplyToBlock, onOpenBlock }: {
  items: Target[];
  blocks: Target[];
  onApplyToItem: (idx: number, textureKey: string) => void;
  onOpenItem: (idx: number) => void;
  onApplyToBlock: (idx: number, textureKey: string) => void;
  onOpenBlock: (idx: number) => void;
}) {
  const { packTextures, uploadCustomTexture } = useTextures();
  const [backend, setBackend] = useState<SkinBackend>(loadSkinBackend);
  const [mode, setMode] = useState<Mode>("text");
  const [prompt, setPrompt] = useState("copper sword");
  const [noun, setNoun] = useState("sword");
  const [materials, setMaterials] = useState("wooden, stone, iron, golden, diamond, netherite");
  const [count, setCount] = useState(4);
  const [steps, setSteps] = useState(30);
  const [guidance, setGuidance] = useState(9);
  const [strength, setStrength] = useState(0.6);
  const [seed, setSeed] = useState(0);
  const [engine, setEngine] = useState<BlockEngine>("item");
  const [tileable, setTileable] = useState(true);
  const [base, setBase] = useState<{ label: string; url: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResultsState] = useState<GeneratedImage[]>(lastResults);
  const [applyTarget, setApplyTarget] = useState<string | null>(null);
  /** result shown enlarged in the lightbox */
  const [zoomId, setZoomId] = useState<string | null>(null);
  const [pixelGrid, setPixelGrid] = useState(true);
  /** blocks in the lightbox: show 3×3 copies to judge the seams */
  const [tiledView, setTiledView] = useState(true);

  const setResults = (fn: (r: GeneratedImage[]) => GeneratedImage[]) =>
    setResultsState((r) => (lastResults = fn(r)));

  const needsBase = mode === "sketch" || mode === "set";
  const localOnly = !!MODES.find((m) => m.id === mode)!.localOnly;

  const switchMode = (m: Mode) => {
    const d = DEFAULTS[m];
    setMode(m);
    if (d.prompt && KIND_OF[m] !== KIND_OF[mode]) setPrompt(d.prompt);
    setCount(d.count);
    setSteps(d.steps);
    setGuidance(m === "block" && engine === "lora" ? 7 : d.guidance);
    if (d.strength !== undefined) setStrength(d.strength);
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const sketch = needsBase && base ? await toSketchPng(base.url) : undefined;
      if (needsBase && !sketch) throw new Error("Pick a base texture or upload an image first.");
      const label = mode === "set" ? noun : prompt;
      const res = await fetch("/api/skin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backend, mode, prompt: label, materials, count, steps, guidance, seed,
          strength, sketch, engine, tileable,
        }),
      });
      const data = (await res.json()) as { images?: { name: string; dataUrl: string }[]; error?: string };
      if (!res.ok || !data.images) throw new Error(data.error ?? `HTTP ${res.status}`);
      const mats = materials.split(/[,\n]/).map((m) => m.trim()).filter(Boolean);
      const batch = data.images.map((im, i): GeneratedImage => ({
        id: `${Date.now()}-${i}`,
        kind: KIND_OF[mode],
        name: im.name,
        dataUrl: im.dataUrl,
        prompt: mode === "set" ? `${mats[i] ?? ""} ${noun}`.trim() : label,
      }));
      setResults((r) => [...batch, ...r].slice(0, 64));
      if (batch.length === 0) setError("The generator returned no images — try another seed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async (img: GeneratedImage): Promise<string> => {
    if (img.savedKey && packTextures[img.savedKey]) return img.savedKey;
    const blob = await (await fetch(img.dataUrl)).blob();
    const key = await uploadCustomTexture(new File([blob], `${stemOf(img.prompt)}.png`, { type: "image/png" }));
    setResults((r) => r.map((x) => (x.id === img.id ? { ...x, savedKey: key } : x)));
    return key;
  };

  const saveAndToast = async (img: GeneratedImage) => {
    try { toast.success(`Saved to Resources as ${await save(img)}`); } catch (e) { toast.error(String(e)); }
  };

  /** where a result can be applied: items take item textures, blocks block textures, skins nothing */
  const targetsFor = (img: GeneratedImage): Target[] => (img.kind === "item" ? items : img.kind === "block" ? blocks : []);

  const apply = async (img: GeneratedImage, idx: number) => {
    setApplyTarget(null);
    try {
      const key = await save(img);
      const [onApply, onOpen] = img.kind === "block" ? [onApplyToBlock, onOpenBlock] : [onApplyToItem, onOpenItem];
      onApply(idx, key);
      const it = targetsFor(img)[idx];
      toast.success(`Applied to ${it.displayName || it.id}`, { action: { label: "Open", onClick: () => onOpen(idx) } });
    } catch (e) {
      toast.error(String(e));
    }
  };

  const zoomIdx = results.findIndex((r) => r.id === zoomId);
  const zoomed = zoomIdx >= 0 ? results[zoomIdx] : null;
  const step = (d: number) => {
    if (zoomIdx < 0) return;
    setZoomId(results[(zoomIdx + d + results.length) % results.length].id);
  };

  const download = async (img: GeneratedImage) => downloadBlob(await (await fetch(img.dataUrl)).blob(), `${stemOf(img.prompt)}.png`);

  const uploadBase = (file: File | undefined) => {
    if (!file) return;
    setBase({ label: file.name, url: URL.createObjectURL(file) });
  };

  const slider = (label: string, value: number, set: (v: number) => void, min: number, max: number, step: number) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="flex justify-between text-muted-foreground">{label}<span className="font-mono text-foreground">{value}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="accent-primary" />
    </label>
  );

  const modeHint = MODES.find((m) => m.id === mode)!.hint;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--workspace)]" data-testid="item-skin-generator">
      <div className="relative flex h-10 shrink-0 items-center gap-2 border-b bg-sidebar px-3">
        <Wand2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Item Skin Generator</span>
        <span className="truncate text-xs text-muted-foreground">{mode === "block" && engine === "lora" ? "SD 1.5 + Minecraft Block Texture 1.12 LoRA" : MODEL_OF[KIND_OF[mode]]}</span>
        <SkinBackendControl backend={backend} onBackend={setBackend} />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <form
          className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-r bg-sidebar p-3"
          onSubmit={(e) => { e.preventDefault(); if (!busy) void generate(); }}
        >
          <div className="flex flex-wrap gap-0.5 rounded-sm border p-0.5">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => switchMode(m.id)}
                className={`h-6 flex-1 whitespace-nowrap rounded-sm px-1.5 text-[11px] ${mode === m.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">{modeHint}</p>

          {localOnly && backend !== "local" && (
            <p className="rounded-sm border border-amber-500/50 bg-amber-500/10 p-2 text-[11px]">This mode only runs on the local backend — switch to &quot;Local GPU&quot; above.</p>
          )}

          {mode === "block" && (
            <div className="flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground">Engine</span>
              <div className="flex gap-0.5 rounded-sm border p-0.5">
                {ENGINES.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    title={e.hint}
                    onClick={() => { setEngine(e.id); setGuidance(e.id === "lora" ? 7 : 9); }}
                    className={`h-6 flex-1 rounded-sm text-[11px] ${engine === e.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">{ENGINES.find((e) => e.id === engine)!.hint}</p>
              {engine === "lora" && (
                <p className="text-[10px] leading-snug text-muted-foreground">
                  LoRA: <a href="https://civitai.com/models/55824" target="_blank" rel="noreferrer" className="underline">Minecraft Block Texture 1.12</a> by pymess508 (credit required when you publish results).
                </p>
              )}
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={tileable} onChange={(e) => setTileable(e.target.checked)} className="accent-primary" />
                Seamless (tiles without visible edges)
              </label>
            </div>
          )}

          {needsBase && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Base image</span>
              <div className="flex items-center gap-2">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-sm border" style={{ background: CHECKER }}>
                  {base
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={base.url} alt="" className="h-14 w-14" style={{ imageRendering: "pixelated" }} />
                    : <ImagePlus className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[11px]" title={base?.label}>{base?.label ?? "none"}</span>
                  <div className="flex gap-1">
                    <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setPickerOpen(true)}>Pick texture</Button>
                    <label className="inline-flex h-6 cursor-pointer items-center rounded-sm border px-2 text-[11px] hover:bg-accent">
                      Upload
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { uploadBase(e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                    {base && (
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" title="Clear" onClick={() => setBase(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === "set" ? (
            <>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Item name</span>
                <Input value={noun} onChange={(e) => setNoun(e.target.value)} placeholder="sword" className="h-7 text-xs" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Materials (comma-separated, up to 12)</span>
                <textarea
                  value={materials}
                  onChange={(e) => setMaterials(e.target.value)}
                  rows={3}
                  className="rounded-sm border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:border-ring"
                />
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{mode === "player" ? "Character description (English)" : mode === "block" ? "Block (English, e.g. material + pattern)" : "Prompt (English, e.g. material + object)"}</span>
              <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="copper sword" className="h-7 text-xs" autoFocus />
              {EXAMPLES[mode] && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {EXAMPLES[mode]!.map((ex) => (
                    <button key={ex} type="button" onClick={() => setPrompt(ex)} className="rounded-sm border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground">
                      {ex}
                    </button>
                  ))}
                </div>
              )}
            </label>
          )}

          {mode !== "set" && slider("Images", count, setCount, 1, mode === "player" ? 4 : 8, 1)}
          {needsBase && slider("Strength (low = keep base · high = redraw)", strength, setStrength, 0.3, 0.95, 0.05)}
          {slider("Steps", steps, setSteps, 10, 50, 1)}
          {slider("Guidance (7–12 works, 3–5 goes mushy)", guidance, setGuidance, 1, 15, 0.5)}
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Seed (-1 = random)</span>
            <div className="flex gap-1">
              <Input type="number" value={seed} onChange={(e) => setSeed(Math.trunc(Number(e.target.value) || 0))} className="h-7 text-xs" />
              <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0" title="Random seed" onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}>
                <Dices className="h-3.5 w-3.5" />
              </Button>
            </div>
          </label>

          <Button type="submit" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy || (localOnly && backend !== "local")}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {busy ? "Generating…" : mode === "set" ? "Generate set" : "Generate"}
          </Button>
          {error && <p className="rounded-sm border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive">{error}</p>}

          <p className="mt-auto text-[10px] leading-snug text-muted-foreground">
            Seed variance is large — generate several and pick. &quot;Local GPU&quot; runs the model on this machine
            (tools/skin-generator); &quot;HF Space&quot; uses the public{" "}
            <a href="https://huggingface.co/spaces/yuuki14202028/minecraft-item-16px-demo" target="_blank" rel="noreferrer" className="underline">demo Space</a>{" "}
            with a shared GPU quota. Training data contains mod textures under mixed licences — check originality before
            redistributing.
          </p>
        </form>

        <div className="flex-1 overflow-y-auto p-3">
          {results.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
              <Wand2 className="h-8 w-8 opacity-50" />
              Describe an item, block or character and hit Generate.
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                {results.length} result{results.length === 1 ? "" : "s"}
                <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-[11px]" onClick={() => setResults(() => [])}>Clear</Button>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2">
                {results.map((img) => (
                  <div key={img.id} className="group relative flex flex-col gap-1.5 rounded-sm border bg-card p-2">
                    <button
                      type="button"
                      title="Enlarge"
                      onClick={() => setZoomId(img.id)}
                      className="flex aspect-square cursor-zoom-in items-center justify-center rounded-sm outline-none ring-primary hover:ring-1 focus-visible:ring-2"
                      style={{ background: CHECKER }}
                    >
                      {img.kind === "block" ? (
                        // 2×2 so a seam would show right away
                        <div role="img" aria-label={img.prompt} className="h-full w-full rounded-sm" style={{ backgroundImage: `url(${img.dataUrl})`, backgroundSize: "50% 50%", imageRendering: "pixelated" }} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img.dataUrl} alt={img.prompt} className="h-[85%] w-[85%]" style={{ imageRendering: "pixelated" }} />
                      )}
                    </button>
                    <span className="truncate text-xs" title={img.prompt}>{img.prompt}</span>
                    {img.savedKey && <span className="-mt-1 truncate text-[10px] text-muted-foreground" title={img.savedKey}>{img.savedKey}</span>}
                    <div className="flex gap-1">
                      {img.kind === "player" ? (
                        <span className="flex-1 self-center text-[10px] text-muted-foreground">64×64 skin</span>
                      ) : (
                        <Button variant="outline" size="sm" className="h-6 flex-1 gap-1 px-1 text-[11px]" onClick={() => setApplyTarget(applyTarget === img.id ? null : img.id)} disabled={targetsFor(img).length === 0} title={targetsFor(img).length === 0 ? `Add a${img.kind === "item" ? "n item" : " block"} first` : `Use as a${img.kind === "item" ? "n item" : " block"}'s texture`}>
                          Apply to {img.kind}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title={img.savedKey ? "Saved to Resources" : "Save to Resources"} onClick={() => void saveAndToast(img)}>
                        {img.savedKey ? <Check className="h-3.5 w-3.5 text-primary" /> : <Save className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title={`Download ${img.kind === "player" ? "64×64" : "16×16"} PNG`} onClick={() => void download(img)}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {applyTarget === img.id && (
                      <div className="absolute inset-x-1 bottom-9 z-10 max-h-48 overflow-y-auto rounded-sm border bg-popover p-1 shadow-md">
                        {targetsFor(img).map((it, i) => (
                          <button
                            key={`${it.id}:${i}`}
                            type="button"
                            onClick={() => void apply(img, i)}
                            className="flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-[11px] hover:bg-accent"
                          >
                            {packTextures[it.texture]
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={packTextures[it.texture]} alt="" className="h-4 w-4" style={{ imageRendering: "pixelated" }} />
                              : <span className="h-4 w-4" />}
                            <span className="truncate">{it.displayName || it.id}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {zoomed && (
        <Dialog open onOpenChange={(open) => { if (!open) setZoomId(null); }}>
          <DialogContent
            className={`flex flex-col gap-3 ${zoomed.kind === "player" ? "sm:max-w-[720px]" : "sm:max-w-[600px]"}`}
            data-testid="skin-zoom"
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
              if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
            }}
          >
            <DialogTitle className="truncate pr-8">{zoomed.prompt}</DialogTitle>
            <div className="relative mx-auto flex gap-3">
              {zoomed.kind === "player" && (
                <PlayerSkinViewer3D key={zoomed.id} skinUrl={zoomed.dataUrl} className="h-[400px] w-[260px] shrink-0 cursor-grab rounded-sm bg-[var(--rail)]" />
              )}
              {(() => {
                // one checker / grid cell per texture pixel; a tiled block shows 3×3 copies
                const texels = (zoomed.kind === "player" ? 64 : 16) * (zoomed.kind === "block" && tiledView ? 3 : 1);
                const cell = `${100 / texels}% ${100 / texels}%`;
                const side = zoomed.kind === "player" ? "h-[400px] w-[400px]" : "h-[512px] w-[512px]";
                return (
                  <div
                    className={`relative ${side} max-w-[calc(100vw-4rem)] max-h-[calc(100vw-4rem)] rounded-sm`}
                    style={{ background: `repeating-conic-gradient(var(--muted) 0% 25%, transparent 0% 50%) 0 0 / ${cell}` }}
                  >
                    {zoomed.kind === "block" && tiledView ? (
                      <div role="img" aria-label={zoomed.prompt} className="absolute inset-0" style={{ backgroundImage: `url(${zoomed.dataUrl})`, backgroundSize: "33.3334% 33.3334%", imageRendering: "pixelated" }} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={zoomed.dataUrl} alt={zoomed.prompt} className="absolute inset-0 h-full w-full" style={{ imageRendering: "pixelated" }} />
                    )}
                    {pixelGrid && (
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{ backgroundImage: "linear-gradient(to right, rgb(127 127 127 / 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgb(127 127 127 / 0.35) 1px, transparent 1px)", backgroundSize: cell }}
                      />
                    )}
                  </div>
                );
              })()}
              {results.length > 1 && (
                <>
                  <Button variant="secondary" size="sm" className="absolute left-1 top-1/2 h-8 w-8 -translate-y-1/2 p-0 opacity-80" title="Previous (←)" onClick={() => step(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" size="sm" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 p-0 opacity-80" title="Next (→)" onClick={() => step(1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{zoomIdx + 1} / {results.length} · {zoomed.kind === "player" ? "64×64 skin" : "16×16"}</span>
              {zoomed.savedKey && <span className="truncate text-muted-foreground" title={zoomed.savedKey}>· {zoomed.savedKey}</span>}
              <div className="ml-auto flex gap-1">
                {zoomed.kind === "block" && (
                  <Button variant={tiledView ? "secondary" : "ghost"} size="sm" className="h-7 w-7 p-0" title="Tiled 3×3" onClick={() => setTiledView((v) => !v)}>
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant={pixelGrid ? "secondary" : "ghost"} size="sm" className="h-7 w-7 p-0" title="Pixel grid" onClick={() => setPixelGrid((v) => !v)}>
                  <Grid3x3 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => void saveAndToast(zoomed)}>
                  {zoomed.savedKey ? <Check className="h-3.5 w-3.5 text-primary" /> : <Save className="h-3.5 w-3.5" />} Save
                </Button>
                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => void download(zoomed)}>
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </div>
            </div>
            {targetsFor(zoomed).length > 0 && (
              <div className="flex flex-wrap items-center gap-1 text-xs">
                <span className="mr-1 text-muted-foreground">Apply to {zoomed.kind}:</span>
                {targetsFor(zoomed).map((it, i) => (
                  <button
                    key={`${it.id}:${i}`}
                    type="button"
                    onClick={() => void apply(zoomed, i)}
                    className="flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] hover:bg-accent"
                  >
                    {packTextures[it.texture]
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={packTextures[it.texture]} alt="" className="h-3.5 w-3.5" style={{ imageRendering: "pixelated" }} />
                      : null}
                    {it.displayName || it.id}
                  </button>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      <TexturePickerModal
        open={pickerOpen}
        packTextures={packTextures}
        current=""
        onSelect={(k) => { setBase({ label: k, url: packTextures[k] }); setPickerOpen(false); }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
