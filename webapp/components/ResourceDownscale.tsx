"use client";

import { useEffect, useState } from "react";
import { Loader2, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTextures } from "@/lib/TextureContext";
import { downscaleImage } from "@/lib/imageFit";
import { folderOfKey, moveToFolder } from "@/lib/resourceFolders";

const TARGETS = [8, 16, 32, 64, 128, 256, 512, 1024, 2048];

const fileStem = (key: string) => (key.split("/").pop() ?? key).replace(/\.[^.]+$/, "");

/**
 * Resources tab, details sidebar: downscales the selected images so their longest side is the chosen
 * power of two (aspect ratio kept; images already that small are skipped) — either as copies
 * "<name>_<size>" next to the originals, or in place (same key, so items/blocks follow).
 */
export default function ResourceDownscale({ keys, onDone }: { keys: string[]; onDone: (keys: string[]) => void }) {
  const { packTextures, uploadCustomTexture, replaceCustomTexture } = useTextures();
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>({});
  const [target, setTarget] = useState(16);
  const [method, setMethod] = useState<"pixel" | "smooth">("pixel");
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [busy, setBusy] = useState(false);

  const urls = keys.map((k) => packTextures[k]).join("|");
  useEffect(() => {
    let alive = true;
    void Promise.all(keys.map((k) => new Promise<[string, { w: number; h: number }] | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve([k, { w: img.naturalWidth, h: img.naturalHeight }]);
      img.onerror = () => resolve(null);
      img.src = packTextures[k];
    }))).then((entries) => { if (alive) setDims(Object.fromEntries(entries.filter((e) => e !== null))); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls]);

  const largest = Math.max(0, ...keys.map((k) => (dims[k] ? Math.max(dims[k].w, dims[k].h) : 0)));
  const options = TARGETS.filter((t) => t < largest);
  const chosen = options.includes(target) ? target : options[options.length - 1];
  const shrinkable = keys.filter((k) => dims[k] && Math.max(dims[k].w, dims[k].h) > chosen);

  if (!options.length) return null;

  const run = async () => {
    setBusy(true);
    const done: string[] = [];
    try {
      // Scale everything before saving anything: each save reloads the texture store, which revokes
      // the blob URLs in `packTextures` that the later images would still be read from.
      const scaled = await Promise.all(shrinkable.map(async (k) => {
        const d = dims[k];
        const scale = chosen / Math.max(d.w, d.h);
        return [k, await downscaleImage(packTextures[k], Math.max(1, Math.round(d.w * scale)), Math.max(1, Math.round(d.h * scale)), method)] as const;
      }));
      for (const [k, blob] of scaled) {
        if (keepOriginal) {
          const copy = await uploadCustomTexture(new File([blob], `${fileStem(k)}_${chosen}.png`, { type: "image/png" }));
          const folder = folderOfKey(k);
          if (folder) moveToFolder([copy], folder);
          done.push(copy);
        } else {
          await replaceCustomTexture(k, blob);
          done.push(k);
        }
      }
      toast.success(`Downscaled ${done.length} image${done.length === 1 ? "" : "s"} to ${chosen}px${keepOriginal ? " (copies)" : ""}.`);
      onDone(done);
    } catch (e) {
      toast.error(`Could not downscale: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const seg = "h-6 flex-1 rounded-sm px-1 text-[11px]";
  const segState = (on: boolean) => (on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground");

  return (
    <div className="flex flex-col gap-1.5 rounded-sm border p-2" data-testid="resource-downscale">
      <span className="text-muted-foreground">Downscale — longest side</span>
      <div className="flex flex-wrap gap-0.5 rounded-sm border p-0.5" role="group" aria-label="Downscale size">
        {options.map((t) => (
          <button key={t} type="button" className={`${seg} ${segState(chosen === t)}`} onClick={() => setTarget(t)}>{t}</button>
        ))}
      </div>
      <div className="flex gap-0.5 rounded-sm border p-0.5" role="group" aria-label="Downscale method">
        <button type="button" className={`${seg} ${segState(method === "pixel")}`} title="Nearest neighbour — keeps hard pixel edges and exact colours" onClick={() => setMethod("pixel")}>Pixel</button>
        <button type="button" className={`${seg} ${segState(method === "smooth")}`} title="Averages pixels — for photos and painted textures" onClick={() => setMethod("smooth")}>Smooth</button>
      </div>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={keepOriginal} onChange={(e) => setKeepOriginal(e.target.checked)} className="accent-primary" />
        Keep original (save as <span className="font-mono">name_{chosen}</span>)
      </label>
      <Button variant="secondary" size="sm" className="h-7 justify-start gap-2 text-xs" disabled={busy || !shrinkable.length} onClick={() => void run()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Minimize2 className="h-3.5 w-3.5" />}
        Downscale {shrinkable.length > 1 ? `${shrinkable.length} images` : ""} to {chosen}px
      </Button>
      {keys.length > 1 && shrinkable.length < keys.length && (
        <span className="text-[10px] text-muted-foreground">{keys.length - shrinkable.length} already {chosen}px or smaller — skipped.</span>
      )}
    </div>
  );
}
