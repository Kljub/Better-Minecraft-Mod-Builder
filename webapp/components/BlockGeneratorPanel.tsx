"use client";

import { useState } from "react";
import { Blocks, Dices, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SkinBackendControl from "@/components/SkinBackendControl";
import { fitImage } from "@/lib/imageFit";
import GeneratedResults, { BatchFields, SeedField, Slider, useSeed, type GeneratedImage, type Target } from "@/components/GeneratedResults";

type Engine = "item" | "lora" | "lora119" | "sd15" | "pixai" | "codex";

const SIZES = [16, 32, 64, 128, 256] as const;
/** Pixel AI: drawn at 512, box-downscaled below that, nearest-upscaled above */
const PIXAI_SIZES = [...SIZES, 512, 1024, 2048, 4096] as const;

const ENGINES: { id: Engine; label: string; hint: string; sizes: readonly number[]; seamless: boolean; guidance: number }[] = [
  {
    id: "item", label: "Pixel (16px)", sizes: [16], seamless: true, guidance: 9,
    hint: "yuuki14202028/minecraft-item-16px — exact 16px grid, tiles seamlessly. Best vanilla-sized results.",
  },
  {
    id: "lora", label: "MC 1.12 LoRA", sizes: SIZES, seamless: false, guidance: 7,
    hint: "SD 1.5 + a LoRA trained on vanilla 1.12 blocks. Vanilla pixel look (drawn on a ~16-texel grid, so bigger sizes stay pixel art). Can't be made seamless.",
  },
  {
    id: "lora119", label: "MC 1.19 LoRA", sizes: SIZES, seamless: false, guidance: 7,
    hint: "SD 1.5 + a LoRA trained on 1.19 block textures and item icons — the newer vanilla look (deepslate, copper, mud …). Can't be made seamless.",
  },
  {
    id: "sd15", label: "SD 1.5 (HD)", sizes: SIZES, seamless: true, guidance: 7,
    hint: "Plain Stable Diffusion 1.5 — detailed, painted textures for HD packs (64–256). Seamless.",
  },
  {
    id: "pixai", label: "Pixel AI", sizes: PIXAI_SIZES, seamless: true, guidance: 7,
    hint: "SD 1.5 + the \"pixel ai style\" LoRA — pixel-art look at any power-of-two size: 16–256 downscaled, 1024–4096 upscaled pixel-exact. Seamless.",
  },
  {
    id: "codex", label: "Codex", sizes: SIZES, seamless: true, guidance: 7,
    hint: "Codex's built-in image generation (gpt-image) through this machine's Codex CLI login — best at following the prompt, ~40 s per image, counts against your ChatGPT plan. Seamless is asked for in the prompt, not guaranteed.",
  },
];

const EXAMPLES = ["mossy stone bricks", "oak planks", "cobblestone", "diamond ore", "sandstone", "purple wool", "cracked deepslate tiles"];

// Session-wide, so leaving the tab and coming back keeps the last results.
let lastResults: GeneratedImage[] = [];

/**
 * Block Generator tab: block textures from 16×16 up to 256×256 on the local SD 1.5 server
 * (tools/skin-generator, /generate_block). Results tile 2×2 / 3×3 in the preview, can be saved into
 * Resources and applied straight to a project block. The "Codex" engine uses Codex's image
 * generation instead (app/api/block/codex) and is downscaled to the size in the browser.
 */
export default function BlockGeneratorPanel({ blocks, onApplyToBlock, onOpenBlock }: {
  blocks: Target[];
  onApplyToBlock: (idx: number, textureKey: string) => void;
  onOpenBlock: (idx: number) => void;
}) {
  const [engine, setEngine] = useState<Engine>("item");
  const [size, setSize] = useState(16);
  const [tileable, setTileable] = useState(true);
  const [prompt, setPrompt] = useState("mossy stone bricks");
  /** images per run (batch size; Codex: images in total) */
  const [count, setCount] = useState(4);
  /** runs one after another (local engines) */
  const [batchCount, setBatchCount] = useState(1);
  const [steps, setSteps] = useState(30);
  const [guidance, setGuidance] = useState(9);
  const seedState = useSeed();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResultsState] = useState<GeneratedImage[]>(lastResults);

  const setResults = (fn: (r: GeneratedImage[]) => GeneratedImage[]) =>
    setResultsState((r) => (lastResults = fn(r)));

  const def = ENGINES.find((e) => e.id === engine)!;
  const isCodex = engine === "codex";
  const maxCount = isCodex ? 2 : 8;

  const pickEngine = (e: (typeof ENGINES)[number]) => {
    setEngine(e.id);
    setGuidance(e.guidance);
    if (!e.sizes.includes(size)) setSize(e.sizes[0]);
  };

  const pickSize = (s: number) => {
    setSize(s);
    // the pixel engine only does 16 — anything bigger needs an SD 1.5 engine
    if (!def.sizes.includes(s)) pickEngine(ENGINES.find((e) => e.id === (s > 256 ? "pixai" : "sd15"))!);
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const n = Math.min(count, maxCount);
      const res = isCodex
        ? await fetch("/api/block/codex", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, count: n, size, tileable }),
        })
        : await fetch("/api/skin/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            backend: "local", mode: "block", engine, size, tileable: def.seamless && tileable,
            prompt, count: count * batchCount, batchSize: count, steps, guidance, seed: seedState.seed,
          }),
        });
      const data = (await res.json()) as { images?: { name: string; dataUrl: string }[]; error?: string };
      if (!res.ok || !data.images) throw new Error(data.error ?? `HTTP ${res.status}`);
      // Codex returns ~1254px squares — downscale them to the block size (palette-reduced at pixel sizes)
      const images = isCodex
        ? await Promise.all(data.images.map(async (im) => ({ name: im.name, dataUrl: await fitImage(im.dataUrl, size, size, { pixelate: size <= 64 }) })))
        : data.images;
      const batch = images.map((im, i): GeneratedImage => ({
        id: `${Date.now()}-${i}`, kind: "block", size, name: im.name, dataUrl: im.dataUrl, prompt,
      }));
      setResults((r) => [...batch, ...r].slice(0, 64));
      if (batch.length === 0) setError("The generator returned no images — try another seed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const seg = "h-6 flex-1 whitespace-nowrap rounded-sm px-1.5 text-[11px]";
  const segState = (on: boolean) => (on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground");

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--workspace)]" data-testid="block-generator">
      <div className="relative flex h-10 shrink-0 items-center gap-2 border-b bg-sidebar px-3">
        <Blocks className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Block Generator</span>
        <span className="truncate text-xs text-muted-foreground">{isCodex ? "Codex image generation (gpt-image)" : "Stable Diffusion 1.5"} · 16–256 px</span>
        {!isCodex && <SkinBackendControl backend="local" onBackend={() => {}} localOnly />}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <form
          className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-r bg-sidebar p-3"
          onSubmit={(e) => { e.preventDefault(); if (!busy) void generate(); }}
        >
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-muted-foreground">Size</span>
            <div className="flex flex-wrap gap-0.5 rounded-sm border p-0.5" role="group" aria-label="Size">
              {PIXAI_SIZES.map((s) => (
                <button key={s} type="button" onClick={() => pickSize(s)} className={`${seg} ${segState(size === s)}`}>{s}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-muted-foreground">Engine</span>
            <div className="flex flex-wrap gap-0.5 rounded-sm border p-0.5" role="group" aria-label="Engine">
              {ENGINES.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  title={e.hint}
                  disabled={!e.sizes.includes(size)}
                  onClick={() => pickEngine(e)}
                  className={`${seg} ${segState(engine === e.id)} disabled:opacity-40`}
                >
                  {e.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">{def.hint}</p>
            {engine === "lora" && (
              <p className="text-[10px] leading-snug text-muted-foreground">
                LoRA: <a href="https://civitai.com/models/55824" target="_blank" rel="noreferrer" className="underline">Minecraft Block Texture 1.12</a> by pymess508 (credit required when you publish results).
              </p>
            )}
            {engine === "pixai" && (
              <p className="text-[10px] leading-snug text-muted-foreground">
                LoRA: <a href="https://civitai.com/models/84382" target="_blank" rel="noreferrer" className="underline">pixel ai style</a> by busy_men — no commercial use of the images. Downloads (144 MB) on first use.
              </p>
            )}
            {engine === "lora119" && (
              <p className="text-[10px] leading-snug text-muted-foreground">
                LoRA: <a href="https://civitai.com/models/60379" target="_blank" rel="noreferrer" className="underline">Minecraft 1.19 Block+Item</a> by pymess508 (credit required when you publish results). Downloads (36 MB) on first use.
              </p>
            )}
            <label className={`flex items-center gap-1.5 ${def.seamless ? "" : "opacity-50"}`} title={def.seamless ? undefined : "This engine can't make seamless textures"}>
              <input type="checkbox" checked={def.seamless && tileable} disabled={!def.seamless} onChange={(e) => setTileable(e.target.checked)} className="accent-primary" />
              Seamless (tiles without visible edges)
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Block (English, e.g. material + pattern)</span>
            <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="mossy stone bricks" className="h-7 text-xs" autoFocus />
            <div className="mt-1 flex flex-wrap gap-1">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setPrompt(ex)} className="rounded-sm border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground">
                  {ex}
                </button>
              ))}
            </div>
          </label>

          {isCodex
            ? <Slider label="Images" value={Math.min(count, maxCount)} onChange={setCount} min={1} max={maxCount} step={1} />
            : <BatchFields count={batchCount} size={Math.min(count, maxCount)} onCount={setBatchCount} onSize={setCount} />}
          {!isCodex && (
            <>
              <Slider label="Steps" value={steps} onChange={setSteps} min={10} max={50} step={1} />
              <Slider label="Guidance" value={guidance} onChange={setGuidance} min={1} max={15} step={0.5} />
              <SeedField {...seedState} randomIcon={Dices} />
            </>
          )}

          <Button type="submit" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy || !prompt.trim()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Blocks className="h-3.5 w-3.5" />}
            {busy ? (isCodex ? "Codex is drawing…" : "Generating…") : `Generate ${size}×${size}`}
          </Button>
          {error && <p className="rounded-sm border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive">{error}</p>}

          <p className="mt-auto text-[10px] leading-snug text-muted-foreground">
            {isCodex
              ? "Runs through the Codex CLI (linked accounts from Settings → AI, else this machine's login). Images come back at ~1254 px and are downscaled to the chosen size in the browser."
              : "Runs on the local generator server (tools/skin-generator) — start it above. SD 1.5 engines render at 512 px and are downscaled to the chosen size; the first SD 1.5 run loads the base model (~2 GB)."}
          </p>
        </form>

        <GeneratedResults
          results={results}
          setResults={setResults}
          emptyIcon={Blocks}
          emptyText="Name a block material, pick a size and hit Generate."
          targetsFor={(kind) => (kind === "block" ? blocks : [])}
          onApply={(_, idx, key) => onApplyToBlock(idx, key)}
          onOpen={(_, idx) => onOpenBlock(idx)}
        />
      </div>
    </div>
  );
}
