"use client";

import { useState } from "react";
import { PanelsTopLeft, Dices, Loader2, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TexturePickerModal from "@/components/TexturePickerModal";
import SkinBackendControl from "@/components/SkinBackendControl";
import GeneratedResults, { CHECKER, SeedField, Slider, useSeed, type GeneratedImage, type Target } from "@/components/GeneratedResults";
import { useTextures } from "@/lib/TextureContext";
import { fitImage, toPngDataUrl } from "@/lib/imageFit";

type Engine = "sd15" | "codex";
type Mode = "new" | "restyle";

const SIZES: { label: string; w: number; h: number }[] = [
  // the designer's default screen size (new projects / "New screen")
  { label: "Default 350×200", w: 350, h: 200 },
  { label: "Container 176×166", w: 176, h: 166 },
  { label: "Large chest 176×222", w: 176, h: 222 },
  { label: "Wide 248×166", w: 248, h: 166 },
  { label: "Dialog 200×120", w: 200, h: 120 },
  { label: "Square 256×256", w: 256, h: 256 },
];

const EXAMPLES = [
  "dark oak wood with iron rivets", "polished stone with gold trim", "nether brick with glowing magma cracks",
  "ice and frosted glass", "ancient sandstone with hieroglyphs", "sculk and deepslate",
];

// Session-wide, so leaving the tab and coming back keeps the last results.
let lastResults: GeneratedImage[] = [];

/**
 * Screen GUI Generator tab: GUI textures (container backgrounds, panels, dialogs) for the screen
 * designer — new from a style prompt at a chosen size, or restyling an existing GUI texture (e.g.
 * vanilla's furnace) while keeping its layout. Two engines: SD 1.5 on the local generator server,
 * or Codex's built-in image generation (gpt-image, ChatGPT login; higher quality, ~40 s per image).
 * Results can be saved to Resources and dropped into a screen as a background sprite.
 */
export default function ScreenGuiGeneratorPanel({ screens, onAddToScreen, onOpenScreen }: {
  screens: { id: string; width: number; height: number }[];
  onAddToScreen: (idx: number, textureKey: string, width: number, height: number) => void;
  onOpenScreen: (idx: number) => void;
}) {
  const { packTextures } = useTextures();
  // Codex first: in testing it restyled a GUI cleanly (slots kept, material convincing) where
  // SD 1.5's materials were hit-and-miss
  const [engine, setEngine] = useState<Engine>("codex");
  const [mode, setMode] = useState<Mode>("new");
  const [size, setSize] = useState({ w: 350, h: 200 });
  const [prompt, setPrompt] = useState(EXAMPLES[0]);
  const [count, setCount] = useState(2);
  const [steps, setSteps] = useState(30);
  const [guidance, setGuidance] = useState(7);
  const [strength, setStrength] = useState(0.85);
  const [pixelate, setPixelate] = useState(true);
  const seedState = useSeed();
  const [base, setBase] = useState<{ label: string; url: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResultsState] = useState<GeneratedImage[]>(lastResults);

  const setResults = (fn: (r: GeneratedImage[]) => GeneratedImage[]) =>
    setResultsState((r) => (lastResults = fn(r)));

  const maxCount = engine === "codex" ? 2 : 4;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      let baseImg: { dataUrl: string; width: number; height: number } | null = null;
      if (mode === "restyle") {
        if (!base) throw new Error("Pick or upload the GUI texture to restyle first.");
        baseImg = await toPngDataUrl(base.url);
      }
      const w = baseImg?.width ?? size.w;
      const h = baseImg?.height ?? size.h;
      const n = Math.min(count, maxCount);

      let images: { name: string; dataUrl: string }[];
      if (engine === "codex") {
        const res = await fetch("/api/gui/codex", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, count: n, width: w, height: h, image: baseImg?.dataUrl }),
        });
        const data = (await res.json()) as { images?: { name: string; dataUrl: string }[]; error?: string };
        if (!res.ok || !data.images) throw new Error(data.error ?? `HTTP ${res.status}`);
        // Codex returns ~1254px squares — fit them to the target and its transparency here
        images = await Promise.all(data.images.map(async (im) => ({
          name: im.name,
          dataUrl: await fitImage(im.dataUrl, w, h, { pixelate, alphaFrom: baseImg?.dataUrl }),
        })));
      } else {
        const res = await fetch("/api/skin/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            backend: "local", mode: "gui", prompt, count: n, steps, guidance, strength, seed: seedState.seed,
            width: w, height: h, pixelate, sketch: baseImg?.dataUrl,
          }),
        });
        const data = (await res.json()) as { images?: { name: string; dataUrl: string }[]; error?: string };
        if (!res.ok || !data.images) throw new Error(data.error ?? `HTTP ${res.status}`);
        images = data.images;
      }
      const batch = images.map((im, i): GeneratedImage => ({
        id: `${Date.now()}-${i}`, kind: "gui", size: w, height: h, name: im.name, dataUrl: im.dataUrl, prompt,
      }));
      setResults((r) => [...batch, ...r].slice(0, 48));
      if (batch.length === 0) setError("The generator returned no images — try again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const seg = "h-6 flex-1 whitespace-nowrap rounded-sm px-1.5 text-[11px]";
  const segState = (on: boolean) => (on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground");
  const targets: Target[] = screens.map((s) => ({ id: s.id, texture: "" }));

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--workspace)]" data-testid="gui-generator">
      <div className="relative flex h-10 shrink-0 items-center gap-2 border-b bg-sidebar px-3">
        <PanelsTopLeft className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Screen GUI Generator</span>
        <span className="truncate text-xs text-muted-foreground">{engine === "codex" ? "Codex image generation (gpt-image)" : "Stable Diffusion 1.5"}</span>
        {engine === "sd15" && <SkinBackendControl backend="local" onBackend={() => {}} localOnly />}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <form
          className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-r bg-sidebar p-3"
          onSubmit={(e) => { e.preventDefault(); if (!busy) void generate(); }}
        >
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-muted-foreground">Engine</span>
            <div className="flex gap-0.5 rounded-sm border p-0.5" role="group" aria-label="Engine">
              <button type="button" className={`${seg} ${segState(engine === "codex")}`} onClick={() => setEngine("codex")}>Codex (best)</button>
              <button type="button" className={`${seg} ${segState(engine === "sd15")}`} onClick={() => setEngine("sd15")}>SD 1.5 (local)</button>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {engine === "codex"
                ? "Codex's built-in image generation through this machine's Codex CLI login — best quality, ~40 s per image, counts against your ChatGPT plan."
                : "SD 1.5 on the local generator server (start it above) draws the material; the frame (new panel) or the original's slots and shading (restyle) are kept exactly. Fast and free."}
            </p>
          </div>

          <div className="flex gap-0.5 rounded-sm border p-0.5" role="group" aria-label="Mode">
            <button type="button" className={`${seg} ${segState(mode === "new")}`} onClick={() => setMode("new")}>New panel</button>
            <button type="button" className={`${seg} ${segState(mode === "restyle")}`} onClick={() => setMode("restyle")}>Restyle a GUI</button>
          </div>

          {mode === "new" ? (
            <div className="flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground">Size</span>
              <div className="flex flex-wrap gap-1">
                {SIZES.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setSize({ w: s.w, h: s.h })}
                    className={`rounded-sm border px-1.5 py-0.5 text-[10px] ${size.w === s.w && size.h === s.h ? "border-primary text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Input type="number" aria-label="Width" min={16} max={512} value={size.w} onChange={(e) => setSize((v) => ({ ...v, w: Math.max(16, Math.min(512, Number(e.target.value) || 16)) }))} className="h-7 text-xs" />
                ×
                <Input type="number" aria-label="Height" min={16} max={512} value={size.h} onChange={(e) => setSize((v) => ({ ...v, h: Math.max(16, Math.min(512, Number(e.target.value) || 16)) }))} className="h-7 text-xs" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">GUI texture to restyle (kept at its size and transparency)</span>
              <div className="flex items-center gap-2">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-sm border" style={{ background: CHECKER }}>
                  {base
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={base.url} alt="" className="max-h-14 max-w-14" style={{ imageRendering: "pixelated" }} />
                    : <ImagePlus className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[11px]" title={base?.label}>{base?.label ?? "none — e.g. gui/container/furnace.png"}</span>
                  <div className="flex gap-1">
                    <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setPickerOpen(true)}>Pick texture</Button>
                    <label className="inline-flex h-6 cursor-pointer items-center rounded-sm border px-2 text-[11px] hover:bg-accent">
                      Upload
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setBase({ label: f.name, url: URL.createObjectURL(f) }); e.target.value = ""; }} />
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

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Style (English)</span>
            <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={EXAMPLES[0]} className="h-7 text-xs" autoFocus />
            <div className="mt-1 flex flex-wrap gap-1">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setPrompt(ex)} className="rounded-sm border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground">
                  {ex}
                </button>
              ))}
            </div>
          </label>

          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={pixelate} onChange={(e) => setPixelate(e.target.checked)} className="accent-primary" />
            Pixel-art palette (flat shading, 24 colours)
          </label>

          <Slider label="Images" value={Math.min(count, maxCount)} onChange={setCount} min={1} max={maxCount} step={1} />
          {engine === "sd15" && (
            <>
              {mode === "restyle" && <Slider label="Strength (0 = original colours · 1 = new material)" value={strength} onChange={setStrength} min={0} max={1} step={0.05} />}
              <Slider label="Steps" value={steps} onChange={setSteps} min={10} max={50} step={1} />
              <Slider label="Guidance" value={guidance} onChange={setGuidance} min={1} max={15} step={0.5} />
              <SeedField {...seedState} randomIcon={Dices} />
            </>
          )}

          <Button type="submit" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy || !prompt.trim()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PanelsTopLeft className="h-3.5 w-3.5" />}
            {busy ? (engine === "codex" ? "Codex is drawing…" : "Generating…") : "Generate"}
          </Button>
          {error && <p className="rounded-sm border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive">{error}</p>}
        </form>

        <GeneratedResults
          results={results}
          setResults={setResults}
          emptyIcon={PanelsTopLeft}
          emptyText="Describe a GUI style and hit Generate."
          targetsFor={(kind) => (kind === "gui" ? targets : [])}
          onApply={(_, idx, key, img) => onAddToScreen(idx, key, img.size, img.height ?? img.size)}
          onOpen={(_, idx) => onOpenScreen(idx)}
        />
      </div>

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
