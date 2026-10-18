"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Save, Download, Check, ChevronLeft, ChevronRight, Grid3x3, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import PlayerSkinViewer3D from "@/components/PlayerSkinViewer3D";
import { useTextures } from "@/lib/TextureContext";
import { downloadBlob } from "@/lib/exportBundle";

/** what a result is: decides its preview (tiled for blocks, 3D for skins) and where it can be applied */
export type Kind = "item" | "block" | "player";

export interface GeneratedImage {
  id: string;
  kind: Kind;
  name: string;
  dataUrl: string;
  prompt: string;
  /** edge length in pixels (16 … 256; 64 for player skins) */
  size: number;
  /** "custom/…" key once saved to Resources */
  savedKey?: string;
}

export type Target = { id: string; displayName?: string; texture: string };

export const CHECKER = "repeating-conic-gradient(var(--muted) 0% 25%, transparent 0% 50%) 0 0 / 12px 12px";

const stemOf = (prompt: string) => prompt.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "texture";

/** Labelled range slider used by the generator forms. */
export function Slider({ label, value, onChange, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="flex justify-between text-muted-foreground">{label}<span className="font-mono text-foreground">{value}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-primary" />
    </label>
  );
}

/** Seed as typed text, so "-" (on the way to "-1") is a valid intermediate state; anything that
 * isn't a whole number means -1 = random. */
export function useSeed() {
  const [seedText, setSeedText] = useState("-1");
  const seed = /^-?\d+$/.test(seedText.trim()) ? Math.max(-1, Math.min(2 ** 31 - 1, Number(seedText.trim()))) : -1;
  return { seed, seedText, setSeedText };
}

export function SeedField({ seed, seedText, setSeedText, randomIcon: Icon }: ReturnType<typeof useSeed> & { randomIcon: LucideIcon }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">Seed (-1 = random)</span>
      <div className="flex gap-1">
        <Input
          inputMode="numeric"
          aria-label="Seed"
          value={seedText}
          placeholder="-1"
          onChange={(e) => { if (/^-?\d*$/.test(e.target.value.trim())) setSeedText(e.target.value.trim()); }}
          onBlur={() => setSeedText(String(seed))}
          className="h-7 text-xs"
        />
        <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0" title="Pick a fixed random seed (to reproduce a result)" onClick={() => setSeedText(String(Math.floor(Math.random() * 1_000_000)))}>
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </label>
  );
}

/**
 * Result grid + lightbox shared by the generator tabs: enlarge (blocks tiled, player skins in 3D),
 * save to Resources, download, and apply to a project item/block.
 */
export default function GeneratedResults({ results, setResults, emptyIcon: EmptyIcon, emptyText, targetsFor, onApply, onOpen }: {
  results: GeneratedImage[];
  setResults: (fn: (r: GeneratedImage[]) => GeneratedImage[]) => void;
  emptyIcon: LucideIcon;
  emptyText: string;
  /** project elements a result of this kind can be applied to (none for player skins) */
  targetsFor: (kind: Kind) => Target[];
  onApply: (kind: Kind, idx: number, textureKey: string) => void;
  onOpen: (kind: Kind, idx: number) => void;
}) {
  const { packTextures, uploadCustomTexture } = useTextures();
  const [applyTarget, setApplyTarget] = useState<string | null>(null);
  /** result shown enlarged in the lightbox */
  const [zoomId, setZoomId] = useState<string | null>(null);
  const [pixelGrid, setPixelGrid] = useState(true);
  /** blocks in the lightbox: show 3×3 copies to judge the seams */
  const [tiledView, setTiledView] = useState(true);

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

  const apply = async (img: GeneratedImage, idx: number) => {
    setApplyTarget(null);
    try {
      const key = await save(img);
      onApply(img.kind, idx, key);
      const it = targetsFor(img.kind)[idx];
      toast.success(`Applied to ${it.displayName || it.id}`, { action: { label: "Open", onClick: () => onOpen(img.kind, idx) } });
    } catch (e) {
      toast.error(String(e));
    }
  };

  const download = async (img: GeneratedImage) => downloadBlob(await (await fetch(img.dataUrl)).blob(), `${stemOf(img.prompt)}.png`);

  const zoomIdx = results.findIndex((r) => r.id === zoomId);
  const zoomed = zoomIdx >= 0 ? results[zoomIdx] : null;
  const step = (d: number) => {
    if (zoomIdx < 0) return;
    setZoomId(results[(zoomIdx + d + results.length) % results.length].id);
  };

  const sizeLabel = (img: GeneratedImage) => (img.kind === "player" ? "64×64 skin" : `${img.size}×${img.size}`);
  const article = (kind: Kind) => (kind === "item" ? "an item" : "a block");

  const targetButton = (img: GeneratedImage, it: Target, i: number, compact: boolean) => (
    <button
      key={`${it.id}:${i}`}
      type="button"
      onClick={() => void apply(img, i)}
      className={compact
        ? "flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-[11px] hover:bg-accent"
        : "flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] hover:bg-accent"}
    >
      {packTextures[it.texture]
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={packTextures[it.texture]} alt="" className={compact ? "h-4 w-4" : "h-3.5 w-3.5"} style={{ imageRendering: "pixelated" }} />
        : compact ? <span className="h-4 w-4" /> : null}
      <span className="truncate">{it.displayName || it.id}</span>
    </button>
  );

  return (
    <div className="flex-1 overflow-y-auto p-3">
      {results.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
          <EmptyIcon className="h-8 w-8 opacity-50" />
          {emptyText}
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            {results.length} result{results.length === 1 ? "" : "s"}
            <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-[11px]" onClick={() => setResults(() => [])}>Clear</Button>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2">
            {results.map((img) => {
              const targets = targetsFor(img.kind);
              return (
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
                  <span className="-mt-1 truncate text-[10px] text-muted-foreground" title={img.savedKey}>{sizeLabel(img)}{img.savedKey ? ` · ${img.savedKey}` : ""}</span>
                  <div className="flex gap-1">
                    {img.kind === "player" ? (
                      <span className="flex-1" />
                    ) : (
                      <Button variant="outline" size="sm" className="h-6 flex-1 gap-1 px-1 text-[11px]" onClick={() => setApplyTarget(applyTarget === img.id ? null : img.id)} disabled={targets.length === 0} title={targets.length === 0 ? `Add ${article(img.kind)} first` : `Use as ${article(img.kind)}'s texture`}>
                        Apply to {img.kind}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title={img.savedKey ? "Saved to Resources" : "Save to Resources"} onClick={() => void saveAndToast(img)}>
                      {img.savedKey ? <Check className="h-3.5 w-3.5 text-primary" /> : <Save className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title={`Download ${img.size}×${img.size} PNG`} onClick={() => void download(img)}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {applyTarget === img.id && (
                    <div className="absolute inset-x-1 bottom-9 z-10 max-h-48 overflow-y-auto rounded-sm border bg-popover p-1 shadow-md">
                      {targets.map((it, i) => targetButton(img, it, i, true))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

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
                const texels = zoomed.size * (zoomed.kind === "block" && tiledView ? 3 : 1);
                const cell = `${100 / texels}% ${100 / texels}%`;
                const side = zoomed.kind === "player" ? "h-[400px] w-[400px]" : "h-[512px] w-[512px]";
                return (
                  <div
                    className={`relative ${side} max-w-[calc(100vw-4rem)] max-h-[calc(100vw-4rem)] rounded-sm`}
                    style={{ background: `repeating-conic-gradient(var(--muted) 0% 25%, transparent 0% 50%) 0 0 / ${texels > 128 ? "16px 16px" : cell}` }}
                  >
                    {zoomed.kind === "block" && tiledView ? (
                      <div role="img" aria-label={zoomed.prompt} className="absolute inset-0" style={{ backgroundImage: `url(${zoomed.dataUrl})`, backgroundSize: "33.3334% 33.3334%", imageRendering: "pixelated" }} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={zoomed.dataUrl} alt={zoomed.prompt} className="absolute inset-0 h-full w-full" style={{ imageRendering: "pixelated" }} />
                    )}
                    {/* the grid only helps while a texel is still several screen pixels wide */}
                    {pixelGrid && texels <= 128 && (
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
              <span className="text-muted-foreground">{zoomIdx + 1} / {results.length} · {sizeLabel(zoomed)}</span>
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
            {targetsFor(zoomed.kind).length > 0 && (
              <div className="flex flex-wrap items-center gap-1 text-xs">
                <span className="mr-1 text-muted-foreground">Apply to {zoomed.kind}:</span>
                {targetsFor(zoomed.kind).map((it, i) => targetButton(zoomed, it, i, false))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
