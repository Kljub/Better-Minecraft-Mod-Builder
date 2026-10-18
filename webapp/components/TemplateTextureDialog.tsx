"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dices, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  GENERATORS, TEMPLATE_NAMES, generate, mergeLayers, renderLayers, templateUrl,
  type Generator, type Rotation, type TemplateLayer,
} from "@/lib/textureTemplates";

/**
 * "From template" (like MCreator's image editor): four template layers — layer 1 as is, layers 2–4
 * tinted (optionally locking saturation/brightness) and rotated — with generator presets and
 * Randomize. "Create" adds them as separate layers, "Create and merge" as one.
 */
export default function TemplateTextureDialog({ open, onOpenChange, width, height, onCreate }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  height: number;
  onCreate: (layers: { name: string; image: ImageData }[]) => void;
}) {
  const [gen, setGen] = useState<Generator>("Random");
  const [layers, setLayers] = useState<TemplateLayer[]>(() => generate("Random"));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<number | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);

  // Live preview of the stacked layers.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    renderLayers(layers, width, height)
      .then((imgs) => {
        if (cancelled || !preview.current) return;
        const merged = mergeLayers(imgs, width, height);
        const c = preview.current;
        c.width = width;
        c.height = height;
        c.getContext("2d")!.putImageData(merged, 0, 0);
        setError(null);
      })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [layers, width, height, open]);

  const set = (i: number, patch: Partial<TemplateLayer>) => setLayers((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const create = async (merge: boolean) => {
    setBusy(true);
    try {
      const imgs = await renderLayers(layers, width, height);
      const named = layers.map((l, i) => ({ name: l.template ?? "", image: imgs[i] })).filter((x): x is { name: string; image: ImageData } => !!x.image);
      if (!named.length) { setError("All layers are empty."); return; }
      onCreate(merge ? [{ name: "Template (merged)", image: mergeLayers(imgs, width, height) }] : named);
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const row = (i: number) => {
    const l = layers[i];
    return (
      <div key={i} className="flex flex-wrap items-center gap-2 text-xs" data-testid={`template-layer-${i + 1}`}>
        <span className="w-14 shrink-0 text-muted-foreground">Layer {i + 1}:</span>
        <select aria-label={`Layer ${i + 1} template`} value={l.template ?? ""} onChange={(e) => set(i, { template: e.target.value || null })}
          className="h-7 w-48 rounded-sm border border-input bg-background px-1.5 text-xs">
          <option value="">(no image)</option>
          {TEMPLATE_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2" title="Browse templates" onClick={() => setPicker(i)}>…</Button>
        {i > 0 && (
          <>
            <input type="color" aria-label={`Layer ${i + 1} colour`} value={l.color} onChange={(e) => set(i, { color: e.target.value })}
              className="h-7 w-16 cursor-pointer rounded-sm border border-input bg-transparent" />
            <span className="w-16 font-mono text-[11px] text-muted-foreground">{l.color.toUpperCase()}</span>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={l.lock} onChange={(e) => set(i, { lock: e.target.checked })} className="accent-primary" />
              Lock saturation and brightness
            </label>
            <label className="flex items-center gap-1.5">
              Rotation:
              <select aria-label={`Layer ${i + 1} rotation`} value={l.rotation} onChange={(e) => set(i, { rotation: Number(e.target.value) as Rotation })}
                className="h-7 rounded-sm border border-input bg-background px-1 text-xs">
                {[0, 90, 180, 270].map((r) => <option key={r} value={r}>{r}°</option>)}
              </select>
            </label>
          </>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" data-testid="template-dialog">
        <DialogHeader><DialogTitle>From template</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Generator template:</span>
          <select aria-label="Generator template" value={gen} onChange={(e) => { const g = e.target.value as Generator; setGen(g); setLayers(generate(g)); }}
            className="h-7 w-52 rounded-sm border border-input bg-background px-1.5 text-xs">
            {GENERATORS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <Button type="button" variant="secondary" size="sm" className="h-7 gap-1.5" onClick={() => setLayers(generate(gen))}>
            <Dices className="h-3.5 w-3.5" /> Randomize
          </Button>
        </div>
        <div className="flex justify-center py-2">
          <canvas ref={preview} data-testid="template-preview" className="h-64 w-64 rounded-sm"
            style={{ imageRendering: "pixelated", background: "repeating-conic-gradient(#3a3a3a 0 25%, #2a2a2a 0 50%) 0 0 / 16px 16px" }} />
        </div>
        <div className="flex flex-col gap-1.5">{[0, 1, 2, 3].map(row)}</div>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        <p className="text-[10px] text-muted-foreground">
          Layer templates from <a className="underline" href="https://github.com/MCreator/MCreator" target="_blank" rel="noreferrer">MCreator</a> (GPL-3.0), loaded from GitHub.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void create(true)}>Create and merge</Button>
          <Button type="button" disabled={busy} onClick={() => void create(false)}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Create</Button>
        </div>
        {picker !== null && (
          <TemplatePicker
            onPick={(name) => { set(picker, { template: name }); setPicker(null); }}
            onClose={() => setPicker(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Thumbnail grid of all templates, searchable. */
function TemplatePicker({ onPick, onClose }: { onPick: (name: string | null) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => TEMPLATE_NAMES.filter((n) => n.toLowerCase().includes(q.trim().toLowerCase())), [q]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-2 rounded-md border bg-popover p-3" onClick={(e) => e.stopPropagation()} data-testid="template-picker">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${TEMPLATE_NAMES.length} templates…`} className="h-8 pl-7 text-xs" />
        </div>
        <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1.5 overflow-y-auto">
          <button type="button" onClick={() => onPick(null)} className="flex flex-col items-center gap-1 rounded-sm border border-transparent p-1 text-[10px] hover:border-input hover:bg-accent">
            <div className="h-12 w-12 rounded-sm border border-dashed" />(no image)
          </button>
          {shown.map((n) => (
            <button key={n} type="button" title={n} onClick={() => onPick(n)} className="flex flex-col items-center gap-1 rounded-sm border border-transparent p-1 text-[10px] hover:border-input hover:bg-accent">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={templateUrl(n)} alt="" loading="lazy" className="h-12 w-12 object-contain" style={{ imageRendering: "pixelated", background: "#2a2a2a" }} />
              <span className="w-full truncate">{n}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
