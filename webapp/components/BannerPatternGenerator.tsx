"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flag, Loader2, Wand2, Download, Dices } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHECKER, SeedField, Slider, useSeed } from "@/components/GeneratedResults";
import { useTextures } from "@/lib/TextureContext";
import type { SkinBackend } from "@/components/SkinBackendControl";

/**
 * Banner Pattern generator (a mode of the Item Skin Generator): the 16×16 item model draws an
 * emblem, which is turned into a real banner pattern texture — the layout vanilla's
 * entity/banner/*.png use (checked against the 26.2 jar): a 64×64 gray-on-transparent image
 * with the front face at (1,1) 20×40 and the back face mirrored at (22,1); shields get their own
 * 64×64 texture with the face at (2,2) 10×20. The game tints the gray with the dye color, so only
 * the shape (alpha) and a little shading (gray level) matter.
 */

const EXAMPLES = ["creeper face", "skull", "dragon head", "flame", "crown", "anchor", "wolf head", "lightning bolt"];

/** Vanilla dye colors (DyeColor#getTextureDiffuseColor) for the preview. */
const DYES: Record<string, string> = {
  white: "#f9fffe", orange: "#f9801d", magenta: "#c74ebd", light_blue: "#3ab3da", yellow: "#fed83d", lime: "#80c71f",
  pink: "#f38baa", gray: "#474f52", light_gray: "#9d9d97", cyan: "#169c9c", purple: "#8932b8", blue: "#3c44aa",
  brown: "#835432", green: "#5e7c16", red: "#b02e26", black: "#1d1d21",
};

interface Emblem {
  id: string;
  prompt: string;
  /** the model's 16×16 RGBA output */
  source: ImageData;
}

async function loadImageData(dataUrl: string): Promise<ImageData> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, 16, 16);
  return ctx.getImageData(0, 0, 16, 16);
}

/** Pattern pixel for a source pixel: shape from alpha, a little shading from luminance. */
function patternPixel(src: ImageData, x: number, y: number, shaded: boolean): [number, number] | null {
  const i = (y * src.width + x) * 4;
  if (src.data[i + 3] < 128) return null;
  const lum = (0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]) / 255;
  return [shaded ? Math.round(170 + 85 * lum) : 235, 255];
}

/** Draws `src` (nearest-neighbour) into a w×h box at (ox, oy), optionally mirrored. */
function blit(out: ImageData, src: ImageData, ox: number, oy: number, w: number, h: number, mirror: boolean, shaded: boolean) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.floor((x / w) * src.width);
      const sy = Math.floor((y / h) * src.height);
      const p = patternPixel(src, mirror ? src.width - 1 - sx : sx, sy, shaded);
      if (!p) continue;
      const o = ((oy + y) * out.width + ox + x) * 4;
      out.data[o] = out.data[o + 1] = out.data[o + 2] = p[0];
      out.data[o + 3] = p[1];
    }
  }
}

function toPng(data: ImageData): string {
  const c = document.createElement("canvas");
  c.width = data.width;
  c.height = data.height;
  c.getContext("2d")!.putImageData(data, 0, 0);
  return c.toDataURL("image/png");
}

/** Builds the banner + shield textures from a 16×16 emblem, sized `scale` (fraction of the face width). */
function buildTextures(src: ImageData, scale: number, shaded: boolean): { banner: string; shield: string } {
  const banner = new ImageData(64, 64);
  // Emblem square, centered horizontally, slightly above the face's middle like vanilla's creeper/skull.
  const size = Math.max(4, Math.round(20 * scale));
  const ox = 1 + Math.floor((20 - size) / 2);
  const oy = 1 + Math.max(0, Math.floor((40 - size) / 2) - 4);
  blit(banner, src, ox, oy, size, size, false, shaded);
  // back face: same emblem, mirrored, in the mirrored position
  blit(banner, src, 22 + (20 - ox - size + 1), oy, size, size, true, shaded);
  const shield = new ImageData(64, 64);
  const ss = Math.max(3, Math.round(10 * Math.min(1, scale + 0.1)));
  blit(shield, src, 2 + Math.floor((10 - ss) / 2), 2 + Math.floor((20 - ss) / 2) - 2, ss, ss, false, shaded);
  return { banner: toPng(banner), shield: toPng(shield) };
}

/** Banner front (or shield face) with base + pattern dye, scaled up, for the preview tiles. */
function DyedPreview({ texture, kind, base, dye }: { texture: string; kind: "banner" | "shield"; base: string; dye: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const [fx, fy, fw, fh] = kind === "banner" ? [1, 1, 20, 40] : [2, 2, 10, 20];
    const img = new Image();
    img.src = texture;
    img.decode().then(() => {
      const ctx = canvas.getContext("2d")!;
      canvas.width = fw;
      canvas.height = fh;
      ctx.fillStyle = DYES[base];
      ctx.fillRect(0, 0, fw, fh);
      // tint: draw the pattern, multiply by the dye color, keep its alpha
      const tmp = document.createElement("canvas");
      tmp.width = fw;
      tmp.height = fh;
      const t = tmp.getContext("2d")!;
      t.drawImage(img, fx, fy, fw, fh, 0, 0, fw, fh);
      t.globalCompositeOperation = "multiply";
      t.fillStyle = DYES[dye];
      t.fillRect(0, 0, fw, fh);
      t.globalCompositeOperation = "destination-in";
      t.drawImage(img, fx, fy, fw, fh, 0, 0, fw, fh);
      ctx.drawImage(tmp, 0, 0);
    }).catch(() => {});
  }, [texture, kind, base, dye]);
  return (
    <canvas
      ref={ref}
      className={kind === "banner" ? "h-40 w-20" : "h-20 w-10"}
      style={{ imageRendering: "pixelated" }}
    />
  );
}

export default function BannerPatternGenerator({ backend, onCreatePattern }: {
  backend: SkinBackend;
  /** creates a Banner Pattern element using the saved textures (and opens it) */
  onCreatePattern?: (name: string, bannerTexture: string, shieldTexture: string) => void;
}) {
  const { uploadCustomTexture } = useTextures();
  const [prompt, setPrompt] = useState("creeper face");
  const [count, setCount] = useState(4);
  const [steps, setSteps] = useState(30);
  const [guidance, setGuidance] = useState(9);
  const [scale, setScale] = useState(0.8);
  const [shaded, setShaded] = useState(true);
  const [baseDye, setBaseDye] = useState("white");
  const [patternDye, setPatternDye] = useState("black");
  const seedState = useSeed();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emblems, setEmblems] = useState<Emblem[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Textures follow the size/shading knobs live.
  const built = useMemo(
    () => emblems.map((e) => ({ ...e, ...buildTextures(e.source, scale, shaded), sourcePng: toPng(e.source) })),
    [emblems, scale, shaded],
  );

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/skin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // the item model draws best "objects"; a centered emblem on a clear background is what we need
        body: JSON.stringify({ backend, mode: "text", prompt: `${prompt.trim()} emblem`, count, steps, guidance, seed: seedState.seed }),
      });
      const data = (await res.json()) as { images?: { name: string; dataUrl: string }[]; error?: string };
      if (!res.ok || !data.images) throw new Error(data.error ?? `HTTP ${res.status}`);
      const batch = await Promise.all(data.images.map(async (im, i): Promise<Emblem> => {
        const source = await loadImageData(im.dataUrl);
        return { id: `${Date.now()}-${i}`, prompt: prompt.trim(), source };
      }));
      setEmblems((r) => [...batch, ...r].slice(0, 32));
      if (batch.length === 0) setError("The generator returned no images — try another seed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const fileOf = async (dataUrl: string, name: string) => new File([await (await fetch(dataUrl)).blob()], name, { type: "image/png" });
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "pattern";

  const save = async (e: (typeof built)[number]) => {
    setSavingId(e.id);
    try {
      const banner = await uploadCustomTexture(await fileOf(e.banner, `${slug(e.prompt)}_banner.png`));
      const shield = await uploadCustomTexture(await fileOf(e.shield, `${slug(e.prompt)}_shield.png`));
      if (onCreatePattern) onCreatePattern(e.prompt, banner, shield);
      else toast.success("Saved both textures to Resources.");
    } catch (err) {
      toast.error(`Could not save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingId(null);
    }
  };

  const download = (dataUrl: string, name: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = name;
    a.click();
  };

  const dyeSelect = (label: string, value: string, set: (v: string) => void) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select value={value} onChange={(ev) => set(ev.target.value)} aria-label={label} className="h-7 rounded-sm border border-input bg-background px-1.5 text-xs">
        {Object.keys(DYES).map((d) => <option key={d} value={d}>{d.replace("_", " ")}</option>)}
      </select>
    </label>
  );

  return (
    <div className="flex min-h-0 flex-1 gap-4" data-testid="banner-generator">
      <form
        className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto"
        onSubmit={(ev) => { ev.preventDefault(); if (!busy && prompt.trim()) generate(); }}
      >
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Emblem</span>
          <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="creeper face" className="h-7 text-xs" aria-label="Emblem" />
        </label>
        <div className="flex flex-wrap gap-1">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setPrompt(ex)} className="rounded-sm border border-input px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">{ex}</button>
          ))}
        </div>
        <Slider label="Images" value={count} onChange={setCount} min={1} max={8} step={1} />
        <Slider label="Emblem size on the banner" value={scale} onChange={setScale} min={0.4} max={1} step={0.05} />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={shaded} onChange={(e) => setShaded(e.target.checked)} />
          Keep shading (off = flat, like vanilla&apos;s simple patterns)
        </label>
        <Slider label="Steps" value={steps} onChange={setSteps} min={10} max={50} step={1} />
        <Slider label="Guidance" value={guidance} onChange={setGuidance} min={1} max={15} step={0.5} />
        <SeedField {...seedState} randomIcon={Dices} />
        <div className="grid grid-cols-2 gap-2">
          {dyeSelect("Preview banner color", baseDye, setBaseDye)}
          {dyeSelect("Preview pattern color", patternDye, setPatternDye)}
        </div>
        <Button type="submit" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy || !prompt.trim()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          {busy ? "Generating…" : "Generate patterns"}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-[11px] leading-snug text-muted-foreground">
          The item model draws an emblem; it becomes a gray-on-transparent pattern in vanilla&apos;s banner/shield texture layout.
          The game tints it with the dye you use in the loom — the colors here are only a preview.
        </p>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {emblems.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Flag className="h-8 w-8 opacity-50" />
            Describe an emblem and hit Generate.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
            {built.map((e) => (
              <div key={e.id} className="flex flex-col gap-2 rounded-sm border border-input bg-card p-2" data-testid="banner-result">
                <div className="flex items-end justify-center gap-3 rounded-sm p-2" style={{ background: CHECKER }}>
                  <DyedPreview texture={e.banner} kind="banner" base={baseDye} dye={patternDye} />
                  <DyedPreview texture={e.shield} kind="shield" base={baseDye} dye={patternDye} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.sourcePng} alt="" title="Model output" className="h-8 w-8" style={{ imageRendering: "pixelated" }} />
                </div>
                <div className="truncate text-xs">{e.prompt}</div>
                <div className="flex gap-1">
                  <Button size="sm" className="h-7 flex-1 gap-1 text-xs" disabled={savingId !== null} onClick={() => save(e)}>
                    {savingId === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flag className="h-3 w-3" />}
                    {onCreatePattern ? "Create banner pattern" : "Save to Resources"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Download banner texture" onClick={() => download(e.banner, `${slug(e.prompt)}_banner.png`)}>
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
