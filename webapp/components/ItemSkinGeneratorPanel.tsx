"use client";

import { useEffect, useRef, useState } from "react";
import { Wand2, Dices, ImagePlus, Loader2, X, ScanEye, ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TexturePickerModal from "@/components/TexturePickerModal";
import { useTextures } from "@/lib/TextureContext";
import SkinBackendControl, { loadSkinBackend, type SkinBackend } from "@/components/SkinBackendControl";
import BannerPatternGenerator from "@/components/BannerPatternGenerator";
import GeneratedResults, { CHECKER, SeedField, Slider, useSeed, type GeneratedImage, type Kind, type Target } from "@/components/GeneratedResults";
import { referenceImage } from "@/components/EntityModelGeneratorPanel";
import { aiClientLabel, aiGenerate, enabledAiClients, useAiSettings, type AiClientId } from "@/lib/aiSettings";
import type { SkinDescription, SkinQuality, SkinRating } from "@/lib/ai/skinVision";

type Mode = "text" | "sketch" | "set" | "player";

const MODES: { id: Mode; label: string; hint: string; localOnly?: boolean }[] = [
  { id: "text", label: "Item", hint: "A prompt in, 16×16 item textures out." },
  { id: "sketch", label: "From texture", hint: "You give the shape (an existing texture or a doodle), the model adds shading and material. Low strength keeps the base, high redraws it." },
  { id: "set", label: "Material set", hint: "One base design + a list of materials → a tier set with matching silhouettes (shared seed). Strength ≈ 0.5 keeps them aligned." },
  { id: "player", label: "Player skin", hint: "A character description in, a 64×64 player skin out (SDXL — the first run loads ~7 GB, then ~20 s per skin).", localOnly: true },
];

const EXAMPLES: Partial<Record<Mode, string[]>> = {
  text: ["copper sword", "glass hammer", "emerald key", "coffee cup", "glowing molten iron sword", "ruby pickaxe", "gold skull"],
  player: ["a knight in golden armor", "a wizard in a blue robe", "a robot with a red visor", "a pirate captain"],
};

/** per-mode defaults (the models' recommended settings) applied when switching modes */
const DEFAULTS: Record<Mode, { prompt?: string; count: number; steps: number; guidance: number; strength?: number }> = {
  text: { prompt: "copper sword", count: 4, steps: 30, guidance: 9 },
  sketch: { prompt: "steel wrench", count: 4, steps: 40, guidance: 9, strength: 0.6 },
  set: { count: 4, steps: 40, guidance: 9, strength: 0.5 },
  player: { prompt: "a knight in golden armor", count: 2, steps: 40, guidance: 7.5 },
};

const KIND_OF: Record<Mode, Kind> = { text: "item", sketch: "item", set: "item", player: "player" };
// Session-wide, so leaving the tab and coming back keeps the last results.
let lastResults: GeneratedImage[] = [];
/** AI quality ratings per result id (session-wide like the results) */
let lastRatings: Record<string, SkinRating & { best?: boolean }> = {};
/** /api/ai/generate takes up to 8 images: the reference picture + up to 7 candidates per check */
const CHECK_CHUNK = 7;

/** A result enlarged with nearest-neighbour scaling, so the AI sees every texture pixel. */
async function enlargedPng(dataUrl: string, size: number): Promise<string> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = dataUrl;
  await img.decode();
  const scale = Math.max(1, Math.floor(256 / Math.max(img.naturalWidth, img.naturalHeight, size)));
  const c = document.createElement("canvas");
  c.width = img.naturalWidth * scale;
  c.height = img.naturalHeight * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

/** Draws any image onto a 256×256 PNG with nearest-neighbour scaling — the Space folds it back to
 * 16×16, and this keeps non-PNG or odd-sized uploads from tripping its input handling. */
async function toSketchPng(url: string): Promise<string> {
  const img = new Image();
  img.crossOrigin = "anonymous"; // pack textures can be GitHub URLs — keeps the canvas exportable
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, 256, 256);
  return c.toDataURL("image/png");
}

const MODEL_OF: Record<Kind, string> = {
  item: "yuuki14202028/minecraft-item-16px",
  block: "",
  gui: "",
  player: "monadical-labs/minecraft-skin-generator-sdxl",
};

/**
 * Item Skin Generator tab: 16×16 item textures (yuuki14202028/minecraft-item-16px) and 64×64
 * player skins (monadical-labs/minecraft-skin-generator-sdxl) through app/api/skin/generate.
 * Results can be saved into the Resources library and applied straight to a project item.
 * Block textures have their own tab (BlockGeneratorPanel).
 */
export default function ItemSkinGeneratorPanel({ items, onApplyToItem, onOpenItem, onCreateBannerPattern }: {
  items: Target[];
  onApplyToItem: (idx: number, textureKey: string) => void;
  onOpenItem: (idx: number) => void;
  /** Banner pattern mode: create a Banner Pattern element from the saved textures */
  onCreateBannerPattern?: (name: string, bannerTexture: string, shieldTexture: string) => void;
}) {
  const { packTextures } = useTextures();
  const aiSettings = useAiSettings();
  const aiClients = enabledAiClients(aiSettings);
  const [aiChoice, setAiChoice] = useState<AiClientId | null>(null);
  /** Claude / Codex / Ollama for describing pictures and the quality check */
  const ai: AiClientId | undefined = aiChoice && aiClients.includes(aiChoice) ? aiChoice
    : aiSettings.preferred !== "all" && aiClients.includes(aiSettings.preferred) ? aiSettings.preferred : aiClients[0];
  const [picture, setPicture] = useState<{ name: string; dataUrl: string } | null>(null);
  const [note, setNote] = useState("");
  const [description, setDescription] = useState<SkinDescription | null>(null);
  const [describing, setDescribing] = useState(false);
  const [autoCheck, setAutoCheck] = useState(true);
  const [checking, setChecking] = useState(false);
  const [hideBad, setHideBad] = useState(false);
  const [ratings, setRatingsState] = useState(lastRatings);
  const setRatings = (fn: (r: typeof lastRatings) => typeof lastRatings) => setRatingsState((r) => (lastRatings = fn(r)));
  const [backend, setBackend] = useState<SkinBackend>(loadSkinBackend);
  const [mode, setMode] = useState<Mode>("text");
  const [bannerMode, setBannerMode] = useState(false);
  const [prompt, setPrompt] = useState("copper sword");
  const [noun, setNoun] = useState("sword");
  const [materials, setMaterials] = useState("wooden, stone, iron, golden, diamond, netherite");
  const [count, setCount] = useState(4);
  const [steps, setSteps] = useState(30);
  const [guidance, setGuidance] = useState(9);
  const [strength, setStrength] = useState(0.6);
  const seedState = useSeed();
  const { seed } = seedState;
  const [base, setBase] = useState<{ label: string; url: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResultsState] = useState<GeneratedImage[]>(lastResults);

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
    setGuidance(d.guidance);
    if (d.strength !== undefined) setStrength(d.strength);
  };

  /** One generator run for `label` (the prompt; the item name in set mode); returns the new results. */
  const generateOne = async (label: string): Promise<GeneratedImage[]> => {
    const sketch = needsBase && base ? await toSketchPng(base.url) : undefined;
    if (needsBase && !sketch) throw new Error("Pick a base texture or upload an image first.");
    {
      const res = await fetch("/api/skin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backend, mode, prompt: label, materials, count, steps, guidance, seed,
          strength, sketch,
        }),
      });
      const data = (await res.json()) as { images?: { name: string; dataUrl: string }[]; error?: string };
      if (!res.ok || !data.images) throw new Error(data.error ?? `HTTP ${res.status}`);
      const mats = materials.split(/[,\n]/).map((m) => m.trim()).filter(Boolean);
      const stamp = Date.now();
      const batch = data.images.map((im, i): GeneratedImage => ({
        id: `${stamp}-${Math.random().toString(36).slice(2, 6)}-${i}`,
        kind: KIND_OF[mode],
        size: mode === "player" ? 64 : 16,
        name: im.name,
        dataUrl: im.dataUrl,
        prompt: mode === "set" ? `${mats[i] ?? ""} ${noun}`.trim() : label,
      }));
      setResults((r) => [...batch, ...r].slice(0, 64));
      return batch;
    }
  };

  /** Generates for each label in turn, then (if on) lets the AI rate what came out. */
  const generate = async (labels: string[] = [mode === "set" ? noun : prompt]) => {
    setBusy(true);
    setError(null);
    const made: GeneratedImage[] = [];
    try {
      for (const label of labels) made.push(...await generateOne(label));
      if (made.length === 0) setError("The generator returned no images — try another seed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
    if (made.length && autoCheck && ai) await qualityCheck(made);
  };

  /** Claude / Codex describes the picture and writes prompts for the texture model. */
  const describe = async (pic = picture) => {
    if (!pic || !ai) return;
    setDescribing(true);
    setError(null);
    try {
      const d = await aiGenerate<SkinDescription>(ai, "skinDescribe", note.trim() || "-", { target: KIND_OF[mode] === "player" ? "player" : "item" },
        [{ data: pic.dataUrl, label: "Reference picture" }]);
      setDescription(d);
      if (mode !== "set") setPrompt(d.prompts[0]);
    } catch (e) {
      setError(`${aiClientLabel(ai)}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDescribing(false);
    }
  };

  const takePicture = (file: File | undefined) => {
    if (!file) return;
    void referenceImage(file)
      .then((dataUrl) => { const pic = { name: file.name || "pasted image", dataUrl }; setPicture(pic); setDescription(null); void describe(pic); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  // Ctrl+V anywhere in the tab: a pasted image becomes the picture (text pastes are left alone).
  const pasteRef = useRef<(f: File) => void>(() => {});
  useEffect(() => {
    pasteRef.current = (f) => { if (ai && mode !== "set" && !bannerMode) takePicture(f); };
  });
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      pasteRef.current(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  /** The AI rates results against their prompt (and the picture, if there is one). */
  const qualityCheck = async (imgs: GeneratedImage[]) => {
    if (!ai || !imgs.length) return;
    setChecking(true);
    try {
      for (let i = 0; i < imgs.length; i += CHECK_CHUNK) {
        const chunk = imgs.slice(i, i + CHECK_CHUNK);
        const target = chunk[0].kind === "player" ? "player" : "item";
        const request = [...new Set(chunk.map((c) => c.prompt))].join(" / ") + (description ? `\nThe picture shows: ${description.description}` : "");
        const images = [
          ...(picture ? [{ data: picture.dataUrl, label: "Reference picture" }] : []),
          ...await Promise.all(chunk.map(async (c, j) => ({ data: await enlargedPng(c.dataUrl, c.size), label: `Candidate ${j + 1}: ${c.prompt}` }))),
        ];
        const q = await aiGenerate<SkinQuality>(ai, "skinQuality", request, { target, hasReference: !!picture, count: chunk.length }, images);
        setRatings((r) => {
          const next = { ...r };
          for (const rating of q.ratings) next[chunk[rating.index - 1].id] = { ...rating, best: q.best === rating.index };
          return next;
        });
      }
    } catch (e) {
      setError(`Quality check (${aiClientLabel(ai)}): ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setChecking(false);
    }
  };

  const uploadBase = (file: File | undefined) => {
    if (!file) return;
    setBase({ label: file.name, url: URL.createObjectURL(file) });
    // An uploaded base is also the picture the AI describes and checks against.
    if (ai && mode === "sketch") takePicture(file);
  };

  const modeHint = MODES.find((m) => m.id === mode)!.hint;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--workspace)]" data-testid="item-skin-generator">
      <div className="relative flex h-10 shrink-0 items-center gap-2 border-b bg-sidebar px-3">
        <Wand2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Item Skin Generator</span>
        <span className="truncate text-xs text-muted-foreground">{MODEL_OF[KIND_OF[mode]]}</span>
        <SkinBackendControl backend={backend} onBackend={setBackend} />
      </div>

      <div className="flex shrink-0 gap-0.5 border-b bg-sidebar px-3 py-1.5">
        {([["textures", "Item textures"], ["banner", "Banner pattern"]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setBannerMode(id === "banner")}
            className={`h-6 rounded-sm px-2 text-[11px] ${(id === "banner") === bannerMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {bannerMode && (
        <div className="flex min-h-0 flex-1 overflow-hidden p-3">
          <BannerPatternGenerator backend={backend} onCreatePattern={onCreateBannerPattern} />
        </div>
      )}
      <div className={`${bannerMode ? "hidden" : "flex"} flex-1 overflow-hidden`}>
        <form
          className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-r bg-sidebar p-3"
          onSubmit={(e) => { e.preventDefault(); if (!busy && !checking) void generate(); }}
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

          {mode !== "set" && (
            <div className="flex flex-col gap-1.5 rounded-sm border p-2" data-testid="skin-picture-ai">
              <div className="flex items-center gap-1.5 text-xs">
                <ScanEye className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">From a picture (AI)</span>
                {aiClients.length > 1 && (
                  <select aria-label="AI for pictures" value={ai} onChange={(e) => setAiChoice(e.target.value as AiClientId)}
                    className="ml-auto h-5 rounded-sm border border-input bg-transparent px-1 text-[10px] [&>option]:bg-popover">
                    {aiClients.map((c) => <option key={c} value={c}>{aiClientLabel(c)}</option>)}
                  </select>
                )}
              </div>
              {!ai ? (
                <p className="text-[11px] leading-snug text-muted-foreground">Turn on Claude Code or Codex in <b>Settings → AI</b> to describe pictures, write prompts and check quality.</p>
              ) : (
                <>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Upload or paste (Ctrl+V) a picture — {aiClientLabel(ai)} describes it and writes the prompts{mode === "sketch" ? " (the uploaded base image counts too)" : ""}.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm border" style={{ background: CHECKER }}>
                      {picture
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={picture.dataUrl} alt="Reference picture" className="h-12 w-12 object-contain" />
                        : <ImagePlus className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-[11px]" title={picture?.name}>{picture?.name ?? "no picture"}</span>
                      <div className="flex gap-1">
                        <label className="inline-flex h-6 cursor-pointer items-center rounded-sm border px-2 text-[11px] hover:bg-accent">
                          Upload picture
                          <input type="file" accept="image/*" className="hidden" aria-label="Upload picture" onChange={(e) => { takePicture(e.target.files?.[0]); e.target.value = ""; }} />
                        </label>
                        {picture && (
                          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" title="Remove picture" onClick={() => { setPicture(null); setDescription(null); }}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the AI (optional), e.g. only the sword" aria-label="Note for the AI" className="h-7 text-[11px]" />
                  {picture && (
                    <Button type="button" variant="outline" size="sm" className="h-6 gap-1 text-[11px]" disabled={describing} onClick={() => void describe()}>
                      {describing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanEye className="h-3 w-3" />}
                      {describing ? `${aiClientLabel(ai)} is looking…` : description ? "Describe again" : "Describe picture"}
                    </Button>
                  )}
                  {description && (
                    <div className="flex flex-col gap-1.5" data-testid="skin-picture-description">
                      <p className="text-[11px] leading-snug">{description.description}</p>
                      {description.colors.length > 0 && (
                        <div className="flex gap-1">
                          {description.colors.map((c) => <span key={c} title={c} className="h-3.5 w-3.5 rounded-sm border" style={{ background: c }} />)}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {description.prompts.map((p) => (
                          <button key={p} type="button" onClick={() => setPrompt(p)} title="Use this prompt"
                            className={`rounded-sm border px-1.5 py-0.5 text-[10px] ${prompt === p ? "border-primary text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
                            {p}
                          </button>
                        ))}
                      </div>
                      {description.prompts.length > 1 && (
                        <Button type="button" variant="secondary" size="sm" className="h-6 gap-1 text-[11px]" disabled={busy || checking || (localOnly && backend !== "local")}
                          onClick={() => void generate(description.prompts)}>
                          <Wand2 className="h-3 w-3" /> Generate all {description.prompts.length} prompts
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
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
              <span className="text-muted-foreground">{mode === "player" ? "Character description (English)" : "Prompt (English, e.g. material + object)"}</span>
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

          {mode !== "set" && <Slider label="Images" value={count} onChange={setCount} min={1} max={mode === "player" ? 4 : 8} step={1} />}
          {needsBase && <Slider label="Strength (low = keep base · high = redraw)" value={strength} onChange={setStrength} min={0.3} max={0.95} step={0.05} />}
          <Slider label="Steps" value={steps} onChange={setSteps} min={10} max={mode === "player" ? 60 : 50} step={1} />
          <Slider label="Guidance (7–12 works, 3–5 goes mushy)" value={guidance} onChange={setGuidance} min={1} max={15} step={0.5} />
          <SeedField {...seedState} randomIcon={Dices} />
          {ai && (
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title={`${aiClientLabel(ai)} rates every new result against the prompt and the picture`}>
              <input type="checkbox" checked={autoCheck} onChange={(e) => setAutoCheck(e.target.checked)} className="accent-primary" />
              Quality check after generating ({aiClientLabel(ai)})
            </label>
          )}

          <Button type="submit" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy || checking || (localOnly && backend !== "local")}>
            {busy || checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {busy ? "Generating…" : checking ? "Checking quality…" : mode === "set" ? "Generate set" : "Generate"}
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

        <GeneratedResults
          results={hideBad ? results.filter((r) => ratings[r.id]?.verdict !== "bad") : results}
          setResults={setResults}
          emptyIcon={Wand2}
          emptyText="Describe an item or a character and hit Generate."
          targetsFor={(kind) => (kind === "item" ? items : [])}
          onApply={(_, idx, key) => onApplyToItem(idx, key)}
          onOpen={(_, idx) => onOpenItem(idx)}
          toolbar={ai && (
            <>
              <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[11px]" disabled={busy || checking}
                title={`${aiClientLabel(ai)} rates the results that have no rating yet`}
                onClick={() => void qualityCheck(results.filter((r) => !ratings[r.id]).slice(0, 21))}>
                {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />} Check quality
              </Button>
              <label className="flex items-center gap-1 text-[11px]">
                <input type="checkbox" checked={hideBad} onChange={(e) => setHideBad(e.target.checked)} className="accent-primary" /> Hide bad
              </label>
            </>
          )}
          badge={(img) => {
            const q = ratings[img.id];
            if (!q) return null;
            const tone = q.verdict === "good" ? "text-green-600 dark:text-green-400" : q.verdict === "ok" ? "text-amber-600 dark:text-amber-400" : "text-destructive";
            return (
              <span className={`-mt-1 flex items-center gap-1 truncate text-[10px] ${tone}`} title={q.issues} data-testid="skin-quality">
                {q.best && <Star className="h-3 w-3 shrink-0 fill-current" aria-label="Best" />}
                {q.score}/10 · {q.verdict}{q.issues ? ` — ${q.issues}` : ""}
              </span>
            );
          }}
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
