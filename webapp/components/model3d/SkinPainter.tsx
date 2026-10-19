"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Eraser, PaintBucket, Pipette, Undo2, Redo2, Wand2, Upload, FilePlus2, Grid3x3, Move } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import ModelViewport, { type ModelViewportHandle, type ViewPreset } from "./ModelViewport";
import { useTextures } from "@/lib/TextureContext";
import { saveTexture } from "@/lib/textureStore";
import { boxUvRects, cubeSize, effectiveFaceUvs } from "@/lib/model3d/geometry";
import { FACE_KEYS, type EntityModel, type FaceKey } from "@/lib/model3d/types";
import { hitTestUv, moveUv, toPerFaceUv, toBoxUv, shareFaceOnAllSides, targetRects, type UvTarget } from "@/lib/model3d/uvEdit";
import { paintCubes, paintFace } from "@/lib/ai/texturePaint";
import { findCube } from "@/lib/model3d/aiOps";
import { clipOps, type AiSkin } from "@/lib/model3d/aiSkin";
import SkinAiBar from "./SkinAiBar";

type Tool = "pencil" | "eraser" | "fill" | "picker" | "uv";

/** Minecraft-ish starter palette. */
const PALETTE = [
  "#000000", "#3f3f3f", "#7f7f7f", "#bfbfbf", "#ffffff", "#7a4a2a", "#a0703f", "#d9b27c",
  "#3b6b2b", "#5fa040", "#9bd06a", "#2b4a8a", "#4f86d9", "#9cc8ff", "#8a2b2b", "#d94f4f",
  "#ff9c9c", "#d9a02b", "#ffd75f", "#6b3f8a", "#a96fd9", "#2b8a7f", "#5fd9c8", "#f5b301",
];
const HISTORY = 60;

const hexToRgba = (hex: string): [number, number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;

/**
 * Skin tab: paint the mob's texture directly on the 3D model (left-drag; orbit with right/middle
 * drag) or on the flat texture with the UV layout overlaid. Strokes save into the model's own
 * custom texture (created on the first stroke if the model has none / uses a pack texture).
 */
export default function SkinPainter({ modelId, model, onChange }: {
  modelId: string;
  model: EntityModel;
  onChange: (next: EntityModel) => void;
}) {
  const { packTextures, uploadCustomTexture, reload } = useTextures();
  const W = model.textureWidth, H = model.textureHeight;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [version, setVersion] = useState(0);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#5fa040");
  const [recent, setRecent] = useState<string[]>([]);
  const [size, setSize] = useState(1);
  const [zoom, setZoom] = useState(() => Math.max(2, Math.min(12, Math.floor(512 / Math.max(W, H)))));
  const [showUv, setShowUv] = useState(true);
  const [hoverCube, setHoverCube] = useState<string | null>(null);
  /** UV tool: selected island/face, the drag in progress, and whether painted pixels move along */
  const [uvSel, setUvSel] = useState<UvTarget | null>(null);
  const [uvDrag, setUvDrag] = useState<{ target: UvTarget; start: [number, number]; delta: [number, number] } | null>(null);
  const [carryPixels, setCarryPixels] = useState(true);
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  /** undo/redo stack sizes, mirrored into state for the buttons */
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
  const syncHistory = () => setHistorySize({ undo: undoStack.current.length, redo: redoStack.current.length });
  const viewport = useRef<ModelViewportHandle>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelRef = useRef(model);
  useEffect(() => { modelRef.current = model; });

  const textureUrl = model.texture ? packTextures[model.texture] : undefined;

  // Load the current texture into the working canvas (when the model/texture/size changes).
  const loadedFor = useRef<string>("");
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const key = `${modelId}|${model.texture}|${W}x${H}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.clearRect(0, 0, W, H);
    undoStack.current = [];
    redoStack.current = [];
    requestAnimationFrame(() => setHistorySize({ undo: 0, redo: 0 }));
    if (!textureUrl) { requestAnimationFrame(() => setVersion((v) => v + 1)); return; }
    const img = new Image();
    img.crossOrigin = "anonymous"; // pack textures can be GitHub URLs — keeps the canvas exportable
    img.onload = () => { ctx.clearRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H); setVersion((v) => v + 1); };
    img.src = textureUrl;
  }, [modelId, model.texture, textureUrl, W, H]);

  const ctx = () => canvasRef.current!.getContext("2d", { willReadFrequently: true })!;

  /** Saves the canvas into the model's texture: overwrite its custom texture, or create one. */
  const persist = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) return;
    const m = modelRef.current;
    if (m.texture.startsWith("custom/")) {
      await saveTexture(`pack:${m.texture}`, blob);
      // Keep the canvas as the source of truth; just refresh other views of this texture.
      loadedFor.current = `${modelId}|${m.texture}|${m.textureWidth}x${m.textureHeight}`;
      await reload();
    } else {
      const key = await uploadCustomTexture(new File([blob], `${modelId}.png`, { type: "image/png" }));
      loadedFor.current = `${modelId}|${key}|${m.textureWidth}x${m.textureHeight}`;
      onChange({ ...m, texture: key });
    }
  }, [modelId, onChange, reload, uploadCustomTexture]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { persist().catch((e) => toast.error(`Could not save skin: ${e instanceof Error ? e.message : String(e)}`)); }, 300);
  }, [persist]);
  useEffect(() => () => { if (saveTimer.current) { clearTimeout(saveTimer.current); persist().catch(() => undefined); } }, [persist]);

  const snapshot = () => {
    undoStack.current.push(ctx().getImageData(0, 0, W, H));
    if (undoStack.current.length > HISTORY) undoStack.current.shift();
    redoStack.current = [];
    syncHistory();
  };
  const restore = (from: ImageData[], to: ImageData[]) => {
    const img = from.pop();
    if (!img) return;
    to.push(ctx().getImageData(0, 0, W, H));
    ctx().putImageData(img, 0, 0);
    setVersion((v) => v + 1);
    syncHistory();
    scheduleSave();
  };
  const undo = () => restore(undoStack.current, redoStack.current);
  const redo = () => restore(redoStack.current, undoStack.current);

  const pickColor = (hex: string) => {
    setColor(hex);
    setRecent((r) => [hex, ...r.filter((c) => c !== hex)].slice(0, 8));
  };

  /** One brush dab / fill / pick at texture pixel (x, y). */
  const applyAt = (x: number, y: number) => {
    const c = ctx();
    if (tool === "picker") {
      const d = c.getImageData(x, y, 1, 1).data;
      if (d[3] > 0) { pickColor(toHex(d[0], d[1], d[2])); setTool("pencil"); }
      return;
    }
    if (tool === "fill") {
      floodFill(c, x, y, hexToRgba(color), W, H);
      return;
    }
    const off = Math.floor((size - 1) / 2);
    if (tool === "eraser") c.clearRect(x - off, y - off, size, size);
    else { c.fillStyle = color; c.fillRect(x - off, y - off, size, size); }
  };

  const last = useRef<[number, number] | null>(null);
  const stroke = (px: [number, number], phase: "start" | "move" | "end") => {
    if (phase === "end") {
      last.current = null;
      if (tool !== "picker") scheduleSave();
      return;
    }
    if (phase === "start") { if (tool !== "picker") snapshot(); applyAt(px[0], px[1]); last.current = px; }
    else if (tool === "pencil" || tool === "eraser") {
      // Connect samples so fast drags don't leave gaps.
      const [x0, y0] = last.current ?? px;
      const steps = Math.max(Math.abs(px[0] - x0), Math.abs(px[1] - y0));
      for (let i = 1; i <= steps; i++) applyAt(Math.round(x0 + ((px[0] - x0) * i) / steps), Math.round(y0 + ((px[1] - y0) * i) / steps));
      if (!steps) applyAt(px[0], px[1]);
      last.current = px;
    }
    setVersion((v) => v + 1);
  };

  // 2D canvas painting.
  const pixelFromEvent = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [Math.min(W - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * W))), Math.min(H - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * H)))] as [number, number];
  };

  // Local undo/redo — captured before the page's global Ctrl+Z (project history).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); e.stopImmediatePropagation(); redo(); return; }
      if (mod) return;
      if (e.key === "b" || e.key === "p") setTool("pencil");
      else if (e.key === "e") setTool("eraser");
      else if (e.key === "f" || e.key === "g") setTool("fill");
      else if (e.key === "i") setTool("picker");
      else if (e.key === "m") setTool("uv");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  /** Finishes a UV drag: moves the UV (one undo step) and, optionally, the painted pixels with it. */
  const commitUvDrag = () => {
    const d = uvDrag;
    setUvDrag(null);
    if (!d || (!d.delta[0] && !d.delta[1])) return;
    const cube = model.cubes.find((c) => c.id === d.target.cubeId);
    if (!cube) return;
    if (carryPixels) {
      snapshot();
      const c = ctx();
      const rects = targetRects(cube, d.target.face);
      const parts = rects.map((r) => ({ r, img: c.getImageData(r.x, r.y, r.w, r.h) }));
      for (const { r } of parts) c.clearRect(r.x, r.y, r.w, r.h);
      // putImageData replaces pixels; draw via a temp canvas so overlapping parts composite.
      for (const { r, img } of parts) {
        const tmp = document.createElement("canvas");
        tmp.width = r.w; tmp.height = r.h;
        tmp.getContext("2d")!.putImageData(img, 0, 0);
        c.drawImage(tmp, r.x + d.delta[0], r.y + d.delta[1]);
      }
      setVersion((v) => v + 1);
      scheduleSave();
    }
    onChange(moveUv(model, d.target, d.delta[0], d.delta[1]));
  };
  const selCube = uvSel ? model.cubes.find((c) => c.id === uvSel.cubeId) : undefined;

  const autoPaint = async () => {
    snapshot();
    const blob = await paintCubes(model, { defaultColor: color, noise: 0.12 }, canvasRef.current?.toDataURL());
    const img = new Image();
    img.crossOrigin = "anonymous"; // pack textures can be GitHub URLs — keeps the canvas exportable
    img.onload = () => { ctx().clearRect(0, 0, W, H); ctx().drawImage(img, 0, 0); setVersion((v) => v + 1); scheduleSave(); };
    img.src = URL.createObjectURL(blob);
  };
  /** Paints an AI skin answer: palette with shading first, then face details — one undo step. */
  const applyAiSkin = async (skin: AiSkin) => {
    let blob = await paintCubes(model, { defaultColor: skin.default_color, colors: Object.fromEntries(skin.parts.map((p) => [p.name, p.color])), noise: skin.noise }, canvasRef.current?.toDataURL());
    let skipped = 0;
    for (const f of skin.faces) {
      const cube = findCube(model, f.cube);
      if (!cube) { skipped++; continue; }
      const [u1, v1, u2, v2] = effectiveFaceUvs(cube)[f.face];
      const size: [number, number] = [Math.ceil(Math.max(u1, u2)) - Math.floor(Math.min(u1, u2)), Math.ceil(Math.max(v1, v2)) - Math.floor(Math.min(v1, v2))];
      if (size[0] <= 0 || size[1] <= 0) { skipped++; continue; }
      const url = URL.createObjectURL(blob);
      try {
        blob = await paintFace(model, cube.id, f.face, f.color || undefined, clipOps(f.ops, size), url);
      } catch {
        skipped++;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    const url = URL.createObjectURL(blob);
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // pack textures can be GitHub URLs — keeps the canvas exportable
      img.onload = () => { snapshot(); ctx().clearRect(0, 0, W, H); ctx().drawImage(img, 0, 0); setVersion((v) => v + 1); scheduleSave(); URL.revokeObjectURL(url); resolve(); };
      img.onerror = () => reject(new Error("Couldn't draw the painted texture."));
      img.src = url;
    });
    toast.success(`Skin painted: ${skin.parts.length} colours, ${skin.faces.length - skipped} face details${skipped ? ` (${skipped} skipped — unknown cube/face)` : ""}. Ctrl+Z undoes it.`);
  };
  const clearAll = () => { snapshot(); ctx().clearRect(0, 0, W, H); setVersion((v) => v + 1); scheduleSave(); };
  const importImage = (file: File) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // pack textures can be GitHub URLs — keeps the canvas exportable
    img.onload = () => { snapshot(); ctx().clearRect(0, 0, W, H); ctx().drawImage(img, 0, 0, W, H); setVersion((v) => v + 1); scheduleSave(); };
    img.src = URL.createObjectURL(file);
  };
  const importRef = useRef<HTMLInputElement>(null);

  const uvRects = useMemo(() => model.cubes.map((c) => ({ id: c.id, name: c.name, faces: c.boxUv ? boxUvRects(cubeSize(c), c.uvOffset, c.mirror) : effectiveFaceUvs(c) })), [model.cubes]);
  const toolBtn = (t: Tool, Icon: typeof Pencil, label: string, key: string) => (
    <Button variant="ghost" size="sm" title={`${label} (${key})`} aria-pressed={tool === t}
      className={`h-8 w-8 px-0 ${tool === t ? "bg-accent text-primary" : ""}`} onClick={() => setTool(t)}>
      <Icon className="h-4 w-4" />
    </Button>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1" data-testid="skin-painter">
      {/* ── tools ── */}
      <div className="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r bg-sidebar p-3 text-xs">
        <div className="font-semibold uppercase tracking-wide text-muted-foreground">Tools</div>
        <div className="flex flex-wrap gap-1">
          {toolBtn("pencil", Pencil, "Pencil", "B")}
          {toolBtn("eraser", Eraser, "Eraser", "E")}
          {toolBtn("fill", PaintBucket, "Fill", "F")}
          {toolBtn("picker", Pipette, "Pick colour", "I")}
          {toolBtn("uv", Move, "Move UV areas (drag islands/faces; overlapping = shared texture)", "M")}
          <Button variant="ghost" size="sm" className="h-8 w-8 px-0" title="Undo (Ctrl+Z)" disabled={!historySize.undo} onClick={undo}><Undo2 className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 px-0" title="Redo (Ctrl+Y)" disabled={!historySize.redo} onClick={redo}><Redo2 className="h-4 w-4" /></Button>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Brush size: {size}px</span>
          <input type="range" min={1} max={4} value={size} onChange={(e) => setSize(Number(e.target.value))} className="accent-[var(--primary)]" />
        </label>
        <div className="flex items-center gap-2">
          <input type="color" aria-label="Colour" value={color} onChange={(e) => pickColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded-sm border border-input bg-transparent p-0.5" />
          <span className="font-mono">{color}</span>
        </div>
        <div className="grid grid-cols-8 gap-0.5" data-testid="skin-palette">
          {PALETTE.map((c) => (
            <button key={c} type="button" title={c} onClick={() => pickColor(c)}
              className={`aspect-square rounded-[2px] border ${color === c ? "border-white" : "border-black/40"}`} style={{ background: c }} />
          ))}
        </div>
        {recent.length > 0 && (
          <div className="flex flex-wrap gap-0.5">
            {recent.map((c) => <button key={c} type="button" title={c} onClick={() => setColor(c)} className="h-4 w-4 rounded-[2px] border border-black/40" style={{ background: c }} />)}
          </div>
        )}
        <div className="font-semibold uppercase tracking-wide text-muted-foreground">Texture</div>
        <div className="text-muted-foreground">{W} × {H} px{model.texture ? ` · ${model.texture}` : " · not saved yet"}</div>
        <Button variant="secondary" size="sm" className="h-7 justify-start gap-1.5 text-xs" onClick={autoPaint} title="Fill every cube with the current colour and Minecraft-style shading">
          <Wand2 className="h-3.5 w-3.5" /> Auto-paint cubes
        </Button>
        <Button variant="secondary" size="sm" className="h-7 justify-start gap-1.5 text-xs" onClick={() => importRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> Import image
        </Button>
        <input ref={importRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importImage(f); }} />
        <Button variant="secondary" size="sm" className="h-7 justify-start gap-1.5 text-xs" onClick={clearAll}>
          <FilePlus2 className="h-3.5 w-3.5" /> Clear texture
        </Button>
        <SkinAiBar model={model} onApply={applyAiSkin} />
        {tool === "uv" && (
          <div className="flex flex-col gap-2 rounded-sm border border-input/70 p-2" data-testid="uv-panel">
            <div className="font-semibold uppercase tracking-wide text-muted-foreground">UV areas</div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={carryPixels} onChange={(e) => setCarryPixels(e.target.checked)} /> Move painted pixels too</label>
            {selCube ? (
              <>
                <div><span className="text-foreground">{selCube.name}</span> · {selCube.boxUv ? "box UV (whole island moves)" : uvSel?.face ? `face: ${uvSel.face}` : "all faces"}</div>
                {selCube.boxUv ? (
                  <Button variant="secondary" size="sm" className="h-7 justify-start text-xs" onClick={() => { onChange(toPerFaceUv(model, selCube.id)); setUvSel({ cubeId: selCube.id, face: "north" }); }}
                    title="Lets each side use its own texture area. Bedrock / GeckoLib / Blockbench only — NeoForge (Java) entity models support box UV.">
                    Edit faces separately
                  </Button>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-0.5">
                      {FACE_KEYS.map((f: FaceKey) => (
                        <button key={f} type="button" onClick={() => setUvSel({ cubeId: selCube.id, face: f })}
                          className={`h-6 rounded-sm border text-[10px] capitalize ${uvSel?.face === f ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"}`}>{f}</button>
                      ))}
                    </div>
                    {uvSel?.face && (
                      <Button variant="secondary" size="sm" className="h-7 justify-start text-xs" onClick={() => onChange(shareFaceOnAllSides(model, selCube.id, uvSel.face!))}>
                        Use {uvSel.face} on all sides
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 justify-start text-xs" onClick={() => { onChange(toBoxUv(model, selCube.id)); setUvSel({ cubeId: selCube.id, face: null }); }}>
                      Back to box UV
                    </Button>
                    <p className="text-[10px] leading-snug text-amber-200/90">Per-face UV works in Bedrock, GeckoLib and Blockbench; NeoForge (Java) mobs use box UV.</p>
                  </>
                )}
              </>
            ) : <div className="text-muted-foreground">Drag a UV area on the flat texture. Drop it onto another area to share that texture.</div>}
          </div>
        )}
        <p className="text-[10px] leading-snug text-muted-foreground">Paint on the 3D model with the left mouse button (right/middle drag to orbit) or on the flat texture. Strokes save automatically.</p>
      </div>

      {/* ── 3D ── */}
      <div className="relative min-w-0 flex-1">
        <ModelViewport
          ref={viewport}
          model={model}
          textureUrl={textureUrl}
          textureCanvas={canvasEl}
          textureVersion={version}
          selection={null}
          mode="translate"
          snap={1}
          rotationSnap={0}
          onSelect={() => undefined}
          onTransformEnd={() => undefined}
          onPaint={stroke}
        />
        <select aria-label="View" className="absolute right-2 top-2 h-7 rounded-sm border border-input bg-sidebar px-1 text-xs [&>option]:bg-popover" defaultValue=""
          onChange={(e) => { if (e.target.value) viewport.current?.setView(e.target.value as ViewPreset); e.target.value = ""; }}>
          <option value="" disabled>View…</option>
          {(["perspective", "front", "back", "left", "right", "top"] as ViewPreset[]).map((v) => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
        </select>
      </div>

      {/* ── flat texture ── */}
      <div className="flex w-[40%] min-w-64 max-w-[640px] shrink-0 flex-col border-l bg-sidebar">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-muted-foreground">Texture</span>
          <label className="flex items-center gap-1 text-muted-foreground">Zoom
            <input type="range" min={1} max={24} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-24 accent-[var(--primary)]" />
          </label>
          <Button variant="ghost" size="sm" className={`ml-auto h-7 w-7 px-0 ${showUv ? "text-primary" : ""}`} title="Show UV layout" aria-pressed={showUv} onClick={() => setShowUv((v) => !v)}>
            <Grid3x3 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-3">
          <div className="relative" style={{ width: W * zoom, height: H * zoom, background: "repeating-conic-gradient(#3a3a3a 0% 25%, #2e2e2e 0% 50%) 0 0 / 16px 16px" }}>
            <canvas
              ref={(el) => { canvasRef.current = el; if (el !== canvasEl) setCanvasEl(el); }}
              data-testid="skin-canvas"
              className={`absolute inset-0 h-full w-full touch-none ${tool === "uv" ? (uvDrag ? "cursor-grabbing" : "cursor-grab") : "cursor-crosshair"}`}
              style={{ imageRendering: "pixelated" }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const p = pixelFromEvent(e);
                if (tool === "uv") {
                  const hit = hitTestUv(model, p[0], p[1]);
                  // Clicking a face of an already-selected per-face cube keeps working on that cube.
                  setUvSel(hit);
                  if (hit) setUvDrag({ target: hit, start: p, delta: [0, 0] });
                  return;
                }
                stroke(p, "start");
              }}
              onPointerMove={(e) => {
                if (!(e.buttons & 1)) return;
                const p = pixelFromEvent(e);
                if (tool === "uv") { if (uvDrag) setUvDrag({ ...uvDrag, delta: [p[0] - uvDrag.start[0], p[1] - uvDrag.start[1]] }); return; }
                stroke(p, "move");
              }}
              onPointerUp={(e) => {
                if (e.button !== 0) return;
                if (tool === "uv") { commitUvDrag(); return; }
                stroke([0, 0], "end");
              }}
              data-uv-tool={tool === "uv" ? "on" : undefined}
            />
            {(showUv || tool === "uv") && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" data-testid="uv-overlay">
                {uvRects.flatMap((c) => FACE_KEYS.map((f) => {
                  const [u1, v1, u2, v2] = c.faces[f];
                  const dragged = uvDrag && uvDrag.target.cubeId === c.id && (uvDrag.target.face === null || uvDrag.target.face === f);
                  const selected = uvSel && uvSel.cubeId === c.id && (uvSel.face === null || uvSel.face === f);
                  const hot = hoverCube === c.id || selected;
                  const dx = dragged ? uvDrag!.delta[0] : 0, dy = dragged ? uvDrag!.delta[1] : 0;
                  return (
                    <rect key={`${c.id}-${f}`} x={Math.min(u1, u2) + dx} y={Math.min(v1, v2) + dy} width={Math.abs(u2 - u1)} height={Math.abs(v2 - v1)}
                      fill={dragged ? "rgba(245,179,1,0.3)" : hot ? "rgba(245,179,1,0.15)" : "none"}
                      stroke={dragged || hot ? "#f5b301" : "rgba(255,255,255,0.35)"} strokeWidth={(1 / zoom) * (hot ? 2 : 1.2)} />
                  );
                }))}
              </svg>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
            {model.cubes.map((c) => (
              <span key={c.id} onMouseEnter={() => setHoverCube(c.id)} onMouseLeave={() => setHoverCube(null)}
                className="cursor-default rounded-sm border border-input px-1 text-muted-foreground hover:text-foreground">{c.name}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 4-way flood fill of the clicked colour region (exact match, alpha included). */
function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, rgba: [number, number, number, number], W: number, H: number) {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const at = (px: number, py: number) => (py * W + px) * 4;
  const i0 = at(x, y);
  const target = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
  if (target.every((v, k) => v === rgba[k])) return;
  const stack = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop()!;
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const i = at(px, py);
    if (d[i] !== target[0] || d[i + 1] !== target[1] || d[i + 2] !== target[2] || d[i + 3] !== target[3]) continue;
    d[i] = rgba[0]; d[i + 1] = rgba[1]; d[i + 2] = rgba[2]; d[i + 3] = rgba[3];
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  ctx.putImageData(img, 0, 0);
}
