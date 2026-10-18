"use client";

import { useState } from "react";
import { ShieldPlus, Dices, Loader2, Save, Check, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import SkinBackendControl from "@/components/SkinBackendControl";
import PlayerSkinViewer3D from "@/components/PlayerSkinViewer3D";
import { CHECKER, SeedField, Slider, useSeed } from "@/components/GeneratedResults";
import { useTextures } from "@/lib/TextureContext";
import { downloadBlob } from "@/lib/exportBundle";
import type { ArmorSpec } from "@/lib/types";

const PARTS = ["layer1", "layer2", "helmet", "chestplate", "leggings", "boots"] as const;
type Part = (typeof PARTS)[number];

const PART_LABELS: Record<Part, string> = {
  layer1: "Body layer 1 (helmet, chestplate, boots)", layer2: "Body layer 2 (leggings)",
  helmet: "Helmet icon", chestplate: "Chestplate icon", leggings: "Leggings icon", boots: "Boots icon",
};

/** which ArmorSpec field each generated part fills */
const FIELD_OF: Record<Part, keyof ArmorSpec> = {
  layer1: "equipmentTexture", layer2: "equipmentLeggingsTexture",
  helmet: "iconHelmet", chestplate: "iconChestplate", leggings: "iconLeggings", boots: "iconBoots",
};

const EXAMPLES = ["ruby", "emerald", "obsidian", "copper", "amethyst", "gold and black", "bone"];

interface ArmorSet {
  id: string;
  material: string;
  parts: Record<Part, string>;
  /** "custom/…" keys once saved to Resources */
  saved?: Partial<Record<Part, string>>;
}

// Session-wide, so leaving the tab and coming back keeps the last results.
let lastResults: ArmorSet[] = [];

const stemOf = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "armor";

/**
 * Armor Generator tab: a material in, a whole armor set out — the worn body layers (vanilla's
 * 64×32 layer 1 + layer 2, cut from a generated player skin) and the four 16×16 inventory icons —
 * previewed on a 3D player and applied to a project armor set in one go. Local server only
 * (tools/skin-generator, /generate_armor).
 */
export default function ArmorGeneratorPanel({ armors, onApplyToArmor, onOpenArmor }: {
  armors: ArmorSpec[];
  onApplyToArmor: (idx: number, patch: Partial<ArmorSpec>) => void;
  onOpenArmor: (idx: number) => void;
}) {
  const { packTextures, uploadCustomTexture } = useTextures();
  const [material, setMaterial] = useState("ruby");
  const [count, setCount] = useState(2);
  const [steps, setSteps] = useState(40);
  const [guidance, setGuidance] = useState(7.5);
  const seedState = useSeed();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResultsState] = useState<ArmorSet[]>(lastResults);
  const [openId, setOpenId] = useState<string | null>(null);

  const setResults = (fn: (r: ArmorSet[]) => ArmorSet[]) =>
    setResultsState((r) => (lastResults = fn(r)));

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/skin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backend: "local", mode: "armor", prompt: material, count, steps, guidance, seed: seedState.seed }),
      });
      const data = (await res.json()) as { images?: { name: string; dataUrl: string }[]; error?: string };
      if (!res.ok || !data.images) throw new Error(data.error ?? `HTTP ${res.status}`);
      // files come back as <material>_<set>_<part>.png, six per set
      const bySet = new Map<string, Partial<Record<Part, string>>>();
      for (const im of data.images) {
        const m = /_(\d+)_(layer1|layer2|helmet|chestplate|leggings|boots)\.png$/.exec(im.name);
        if (!m) continue;
        bySet.set(m[1], { ...bySet.get(m[1]), [m[2]]: im.dataUrl });
      }
      const batch: ArmorSet[] = [...bySet.entries()]
        .filter(([, p]) => PARTS.every((k) => p[k]))
        .map(([i, p]) => ({ id: `${Date.now()}-${i}`, material, parts: p as Record<Part, string> }));
      setResults((r) => [...batch, ...r].slice(0, 24));
      if (batch.length === 0) setError("The generator returned no complete sets — try another seed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** saves every part of a set into Resources (once) and returns their keys */
  const saveSet = async (set: ArmorSet): Promise<Record<Part, string>> => {
    const keys = {} as Record<Part, string>;
    for (const part of PARTS) {
      const have = set.saved?.[part];
      if (have && packTextures[have]) { keys[part] = have; continue; }
      const blob = await (await fetch(set.parts[part])).blob();
      keys[part] = await uploadCustomTexture(new File([blob], `${stemOf(set.material)}_${part}.png`, { type: "image/png" }));
    }
    setResults((r) => r.map((x) => (x.id === set.id ? { ...x, saved: keys } : x)));
    return keys;
  };

  const saveAndToast = async (set: ArmorSet) => {
    try { await saveSet(set); toast.success("Saved the set's 6 textures to Resources"); } catch (e) { toast.error(String(e)); }
  };

  const apply = async (set: ArmorSet, idx: number) => {
    try {
      const keys = await saveSet(set);
      const patch: Partial<ArmorSpec> = {};
      for (const part of PARTS) (patch as Record<string, string>)[FIELD_OF[part]] = keys[part];
      onApplyToArmor(idx, patch);
      const a = armors[idx];
      toast.success(`Applied to ${a.displayName || a.id}`, { action: { label: "Open", onClick: () => onOpenArmor(idx) } });
    } catch (e) {
      toast.error(String(e));
    }
  };

  const downloadSet = async (set: ArmorSet) => {
    for (const part of PARTS) downloadBlob(await (await fetch(set.parts[part])).blob(), `${stemOf(set.material)}_${part}.png`);
  };

  const opened = results.find((r) => r.id === openId) ?? null;

  const flat = (url: string, w: number, h: number, scale: number, alt: string) => (
    <div key={alt} className="shrink-0 rounded-sm" style={{ background: CHECKER, width: w * scale, height: h * scale }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="h-full w-full" style={{ imageRendering: "pixelated" }} />
    </div>
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--workspace)]" data-testid="armor-generator">
      <div className="relative flex h-10 shrink-0 items-center gap-2 border-b bg-sidebar px-3">
        <ShieldPlus className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Armor Generator</span>
        <span className="truncate text-xs text-muted-foreground">body layers: minecraft-skin-generator-sdxl · icons: minecraft-item-16px</span>
        <SkinBackendControl backend="local" onBackend={() => {}} localOnly />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <form
          className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-r bg-sidebar p-3"
          onSubmit={(e) => { e.preventDefault(); if (!busy) void generate(); }}
        >
          <p className="text-[11px] leading-snug text-muted-foreground">
            A material in, a full armor set out: both worn body layers (64×32, vanilla layout) and the four inventory icons.
            The body comes from a generated player skin in full armor, so expect to pick from several sets.
          </p>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Material (English)</span>
            <Input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="ruby" className="h-7 text-xs" autoFocus />
            <div className="mt-1 flex flex-wrap gap-1">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setMaterial(ex)} className="rounded-sm border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground">
                  {ex}
                </button>
              ))}
            </div>
          </label>
          <Slider label="Sets" value={count} onChange={setCount} min={1} max={4} step={1} />
          <Slider label="Steps" value={steps} onChange={setSteps} min={10} max={60} step={1} />
          <Slider label="Guidance" value={guidance} onChange={setGuidance} min={1} max={15} step={0.5} />
          <SeedField {...seedState} randomIcon={Dices} />

          <Button type="submit" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy || !material.trim()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldPlus className="h-3.5 w-3.5" />}
            {busy ? "Generating…" : "Generate armor"}
          </Button>
          {error && <p className="rounded-sm border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive">{error}</p>}

          <p className="mt-auto text-[10px] leading-snug text-muted-foreground">
            Runs on the local generator server (tools/skin-generator) — start it above. The first run loads the SDXL skin
            model (~7 GB); after that a set takes ~25 s.
          </p>
        </form>

        <div className="flex-1 overflow-y-auto p-3">
          {results.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
              <ShieldPlus className="h-8 w-8 opacity-50" />
              Name a material and hit Generate.
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                {results.length} set{results.length === 1 ? "" : "s"}
                <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-[11px]" onClick={() => setResults(() => [])}>Clear</Button>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
                {results.map((set) => (
                  <button
                    key={set.id}
                    type="button"
                    title="Open in 3D"
                    data-armor-set={set.material}
                    onClick={() => setOpenId(set.id)}
                    className="flex flex-col gap-2 rounded-sm border bg-card p-2 text-left hover:border-input hover:bg-accent"
                  >
                    <div className="flex gap-1.5">
                      {flat(set.parts.layer1, 64, 32, 2, `${set.material} layer 1`)}
                      {flat(set.parts.layer2, 64, 32, 2, `${set.material} layer 2`)}
                    </div>
                    <div className="flex gap-1.5">
                      {(["helmet", "chestplate", "leggings", "boots"] as const).map((p) => flat(set.parts[p], 16, 16, 3, `${set.material} ${p}`))}
                    </div>
                    <span className="truncate text-xs">{set.material} armor{set.saved ? " · saved" : ""}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {opened && (
        <Dialog open onOpenChange={(open) => { if (!open) setOpenId(null); }}>
          <DialogContent className="flex flex-col gap-3 sm:max-w-[760px]" data-testid="armor-zoom">
            <DialogTitle className="pr-8">{opened.material} armor</DialogTitle>
            <div className="flex gap-4">
              <PlayerSkinViewer3D
                key={opened.id}
                armor={{ layer1: opened.parts.layer1, layer2: opened.parts.layer2 }}
                className="h-[400px] w-[280px] shrink-0 cursor-grab rounded-sm bg-[var(--rail)]"
              />
              <div className="flex min-w-0 flex-col gap-2 text-xs">
                {PARTS.map((p) => (
                  <div key={p} className="flex items-center gap-2">
                    {p.startsWith("layer") ? flat(opened.parts[p], 64, 32, 3, p) : flat(opened.parts[p], 16, 16, 3, p)}
                    <span className="text-muted-foreground">{PART_LABELS[p]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => void saveAndToast(opened)}>
                {opened.saved ? <Check className="h-3.5 w-3.5 text-primary" /> : <Save className="h-3.5 w-3.5" />} Save set
              </Button>
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => void downloadSet(opened)}>
                <Download className="h-3.5 w-3.5" /> Download 6 PNGs
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="mr-1 text-muted-foreground">{armors.length ? "Apply to armor set:" : "Add an armor set (Armor tab) to apply this to it."}</span>
              {armors.map((a, i) => (
                <button
                  key={`${a.id}:${i}`}
                  type="button"
                  onClick={() => void apply(opened, i)}
                  className="rounded-sm border px-1.5 py-0.5 text-[11px] hover:bg-accent"
                >
                  {a.displayName || a.id}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
