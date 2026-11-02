"use client";

import { useRef, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTextures } from "@/lib/TextureContext";
import { fitImage, toPngDataUrl } from "@/lib/imageFit";
import { cleanFolderName, createFolder, moveToFolder, useResourceFolders } from "@/lib/resourceFolders";

const fileStem = (key: string) => (key.split("/").pop() ?? key).replace(/\.[^.]+$/, "");

/** Nearest-neighbour upscale of a small texture so Codex actually sees its pixels (a 16px input is a smudge to it). */
async function upscaleForAi(dataUrl: string, width: number, height: number): Promise<string> {
  const factor = Math.max(1, Math.floor(512 / Math.max(width, height)));
  if (factor === 1) return dataUrl;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = width * factor;
  c.height = height * factor;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

/**
 * Resources tab, "Remake with AI": redraws every image of a folder with Codex's image generation
 * (app/api/resources/codex), one after another, and saves each as "<name>_ai" into the folder
 * "<folder>_ai". The originals stay untouched.
 */
export default function AiRemakeFolderDialog({ folder, keys, open, onOpenChange }: {
  folder: string;
  keys: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { packTextures, uploadCustomTexture } = useTextures();
  const { folders } = useResourceFolders();
  const [prompt, setPrompt] = useState("");
  const [pixelate, setPixelate] = useState(true);
  const [keepAlpha, setKeepAlpha] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; current: string; failed: string[]; lastError?: string } | null>(null);
  const cancelRef = useRef(false);

  const target = cleanFolderName(`${folder}_ai`);

  const run = async () => {
    cancelRef.current = false;
    setBusy(true);
    if (!folders.includes(target)) createFolder(target);
    const failed: string[] = [];
    let made = 0;
    let lastError: string | undefined;
    // Snapshot every source first: each saved result reloads the texture store, which revokes the
    // blob URLs in `packTextures` — reading them lazily made every image after the first fail.
    const sources = await Promise.all(keys.map((k) => toPngDataUrl(packTextures[k]).catch((e: unknown) => e as Error)));
    for (let i = 0; i < keys.length; i++) {
      if (cancelRef.current) break;
      const key = keys[i];
      const stem = fileStem(key);
      setProgress({ done: i, current: stem, failed: [...failed], lastError });
      try {
        const base = sources[i];
        if (base instanceof Error) throw new Error(`could not read the image (${base.message})`);
        const res = await fetch("/api/resources/codex", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: await upscaleForAi(base.dataUrl, base.width, base.height),
            prompt, name: stem.replace(/_/g, " "), width: base.width, height: base.height,
          }),
        });
        const data = (await res.json()) as { dataUrl?: string; error?: string };
        if (!res.ok || !data.dataUrl) throw new Error(data.error ?? `HTTP ${res.status}`);
        // Codex returns ~1254px squares — back to the original's size (and its transparency)
        const fitted = await fitImage(data.dataUrl, base.width, base.height, { pixelate, alphaFrom: keepAlpha ? base.dataUrl : undefined });
        const blob = await (await fetch(fitted)).blob();
        const newKey = await uploadCustomTexture(new File([blob], `${stem}_ai.png`, { type: "image/png" }));
        moveToFolder([newKey], target);
        made++;
      } catch (e) {
        failed.push(stem);
        lastError = `${stem}: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    setProgress({ done: made + failed.length, current: "", failed, lastError });
    setBusy(false);
    if (made) toast.success(`Remade ${made} image${made === 1 ? "" : "s"} into “${target}”.`);
    if (failed.length) toast.error(`${failed.length} image${failed.length === 1 ? "" : "s"} failed — see the dialog.`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) setProgress(null); } }}>
      <DialogContent className="sm:max-w-md" data-testid="ai-remake-dialog">
        <DialogHeader>
          <DialogTitle>Remake “{folder}” with AI</DialogTitle>
          <DialogDescription>
            Codex redraws all {keys.length} image{keys.length === 1 ? "" : "s"} one by one (~40 s each, counts against your
            ChatGPT plan). Results are saved as <span className="font-mono">name_ai</span> in the folder <span className="font-mono">{target}</span>;
            the originals stay as they are.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-3 text-xs" onSubmit={(e) => { e.preventDefault(); if (!busy && keys.length) void run(); }}>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">What to change (optional, English)</span>
            <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. icy blue frost theme, more detail" className="h-7 text-xs" disabled={busy} autoFocus />
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={pixelate} onChange={(e) => setPixelate(e.target.checked)} className="accent-primary" disabled={busy} />
            Pixel-art palette (flat shading, 24 colours)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={keepAlpha} onChange={(e) => setKeepAlpha(e.target.checked)} className="accent-primary" disabled={busy} />
            Keep the original&apos;s transparency (outline)
          </label>

          {progress && (
            <div className="space-y-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / Math.max(1, keys.length)) * 100}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {progress.done} / {keys.length}{progress.current ? ` — drawing ${progress.current}…` : " — done"}
                {progress.failed.length > 0 && ` · ${progress.failed.length} failed`}
              </p>
              {progress.lastError && (
                <p className="max-h-20 overflow-y-auto rounded-sm border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive">
                  Last error — {progress.lastError}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            {busy ? (
              <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={() => { cancelRef.current = true; }}>
                Stop after this image
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { onOpenChange(false); setProgress(null); }}>
                Close
              </Button>
            )}
            <Button type="submit" size="sm" className="h-7 gap-1.5 text-xs" disabled={busy || !keys.length}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {busy ? "Codex is drawing…" : `Remake ${keys.length}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
