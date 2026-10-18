"use client";

import { useEffect, useRef, useState } from "react";
import type { Object3D } from "three";
import { Bot, Loader2, Play, Square, Wrench, Info, AlertTriangle, CheckCircle2, ImagePlus, X, Boxes, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { genId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { aiClientLabel, enabledAiClients, setAiPreferred, useAiSettings, type AiClientId } from "@/lib/aiSettings";
import { clearAgentRun, startAgentRun, stopAgentRun, useAgentRun } from "@/lib/ai/modelAgent";
import { parseReferenceModel, type ReferenceModel } from "@/lib/model3d/referenceModel";
import { buildMeshReference, defaultOrientation, loadMeshFile, meshBoxes, meshExtension, meshModelId, prepareStl, MESH_EXTENSIONS, STL_MAX_POLYGONS, type MeshOrientation, type MeshReference } from "@/lib/model3d/meshReference";

const MAX_IMAGES = 8;
/** What a reference image shows — sent along as its label. */
const VIEW_OPTIONS = ["front", "back", "left side", "right side", "side", "top", "bottom", "three-quarter view", "detail", "texture", "other"];
const MODEL_ACCEPT = [".bbmodel", ".json", ...MESH_EXTENSIONS.map((e) => `.${e}`)].join(",");

interface RefImage { id: string; dataUrl: string; name: string; view: string }
interface LoadedMesh { object: Object3D; fileName: string; orientation: MeshOrientation; ref: MeshReference; stlNote?: string }

/** View from the file name (front.png, hund_seite.jpg…), else the next one of front → side → back… not used yet. */
function guessView(name: string, taken: string[]): string {
  const n = name.toLowerCase();
  const hit = ([
    [/front|vorne|vorder/, "front"], [/back|rear|hinten|rück|rueck/, "back"], [/left|links/, "left side"], [/right|rechts/, "right side"],
    [/side|seite/, "side"], [/top|oben/, "top"], [/bottom|unten/, "bottom"], [/3.?4|three.?quarter|perspective/, "three-quarter view"],
  ] as const).find(([re]) => re.test(n));
  if (hit) return hit[1];
  return ["front", "left side", "right side", "back", "top", "three-quarter view"].find((v) => !taken.includes(v)) ?? "other";
}

const EXAMPLES = [
  "Ein Höllenhund: vierbeinig, dunkelrot mit glühenden Augen und Lava-Rissen, feindlich, 30 Leben, schnell",
  "A friendly mushroom creature, small and round, red cap with white dots, wanders in forests",
  "Stone golem with a humanoid rig, grey with moss, slow but hits hard, 40 health, hostile",
];

/** Tool names the agent calls (mcp/server.mjs) → what the user sees in the log. */
const TOOL_LABELS: Record<string, string> = {
  get_guide: "Reading the modeling guide", hold_item: "Putting the item in its hand", get_status: "Checking the editor", create_model: "Creating the model",
  add_bones: "Adding bones", add_cubes: "Adding cubes", edit_element: "Adjusting parts", move_bone: "Moving a bone",
  mirror_element: "Mirroring parts", delete_elements: "Removing parts", pack_uv: "Packing the texture layout",
  paint_cubes: "Painting", paint_texture: "Painting the texture", paint_face: "Painting details",
  create_animation: "Creating an animation", add_keyframes: "Animating", generate_animation: "Generating an animation",
  set_entity_settings: "Setting mob stats", screenshot: "Looking at the result", set_view: "Turning the camera",
  open_element: "Opening the model", get_model: "Inspecting the model", update_element: "Updating", create_element: "Creating an element",
};

/**
 * Entity Model Generator tab: describe a mob in words; Claude Code or Codex (Settings → AI) then
 * builds it live in the editor through the project's MCP tools — model, texture, animations and
 * mob settings, every step undoable. The run lives in lib/ai/modelAgent, so it keeps going while
 * the editor shows the model being built.
 */
export default function EntityModelGeneratorPanel({ activeElement, onOpenModels, runEditorTool }: {
  activeElement: { kind: string; id: string } | null;
  onOpenModels: () => void;
  /** the editor's MCP tool executor (lib/ai/editorTools) — used to build a mob from a mesh without AI */
  runEditorTool?: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
}) {
  const settings = useAiSettings();
  const run = useAgentRun();
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<RefImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const modelFileRef = useRef<HTMLInputElement>(null);
  const [refModel, setRefModel] = useState<ReferenceModel | null>(null);
  const [mesh, setMesh] = useState<LoadedMesh | null>(null);
  const [meshBusy, setMeshBusy] = useState(false);
  const [directBusy, setDirectBusy] = useState(false);
  /** Mesh → entity model without AI: one "body" bone, the voxel boxes as cubes, textured in their colours. */
  const createFromMesh = async () => {
    if (!mesh || !runEditorTool) return;
    setDirectBusy(true);
    try {
      const boxes = meshBoxes(mesh.ref);
      const base = meshModelId(mesh.ref.name);
      let id = base;
      for (let n = 2; ; n++) {
        try { await runEditorTool("create_model", { id, template: "empty" }); break; } catch (e) {
          if (!/already exists/.test(String(e)) || n > 99) throw e;
          id = `${base}_${n}`;
        }
      }
      await runEditorTool("add_bones", { model: id, bones: [{ name: "body", pivot: [0, 0, 0] }] });
      await runEditorTool("add_cubes", { model: id, cubes: boxes.map((b, i) => ({ name: `part_${i + 1}`, bone: "body", from: b.from, size: b.size })) });
      await runEditorTool("pack_uv", { model: id });
      const colors = Object.fromEntries(boxes.flatMap((b, i) => (b.color ? [[`part_${i + 1}`, b.color]] : [])));
      await runEditorTool("paint_cubes", { model: id, default_color: "#9a9a9a", colors, noise: 0.08 });
      toast.success(`Created entity model "${id}" from ${mesh.fileName}: ${boxes.length} cubes. Split it into bones (head, legs…) to animate it.`);
    } catch (e) {
      toast.error(`Couldn't create the model: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDirectBusy(false);
    }
  };
  const addImage = (img: Omit<RefImage, "id" | "view"> & { view?: string }) => setImages((list) => list.length >= MAX_IMAGES ? list : [
    ...list, { ...img, id: genId(), view: img.view ?? guessView(img.name, list.map((i) => i.view)) },
  ]);
  /** Voxelises + renders the mesh in the given orientation (heavy for big meshes — after a paint, so the spinner shows). */
  const processMesh = (object: Object3D, fileName: string, orientation: MeshOrientation, stlNote?: string) => {
    setMeshBusy(true);
    setTimeout(() => {
      try {
        setMesh({ object, fileName, orientation, stlNote, ref: buildMeshReference(object, fileName, orientation) });
        setRefModel(null);
      } catch (e) {
        setImageError(`${fileName}: ${(e as Error).message}`);
      } finally {
        setMeshBusy(false);
      }
    }, 30);
  };
  const takeModel = async (file: File | undefined) => {
    if (!file) return;
    setImageError(null);
    const ext = meshExtension(file.name);
    if (ext) {
      setMeshBusy(true);
      try {
        const loaded = await loadMeshFile(file);
        // STL: tris paired into quads, simplified to at most STL_MAX_POLYGONS polygons — never refused.
        const stl = ext === "stl" ? prepareStl(loaded) : null;
        processMesh(stl?.object ?? loaded, file.name, defaultOrientation(ext), stl?.note);
      } catch (e) {
        setMeshBusy(false);
        setImageError(`${file.name}: ${(e as Error).message}`);
      }
      return;
    }
    try {
      const ref = parseReferenceModel(await file.text(), file.name);
      setRefModel(ref);
      setMesh(null);
      // A .bbmodel's own texture goes along as one more reference image.
      if (ref.textureDataUrl) addImage({ dataUrl: ref.textureDataUrl, name: `${ref.name} texture`, view: "texture" });
    } catch (e) {
      setImageError(`${file.name}: ${(e as Error).message}`);
    }
  };
  const takeImages = (files: Iterable<File> | null | undefined) => {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setImageError(null);
    if (images.length + list.length > MAX_IMAGES) setImageError(`At most ${MAX_IMAGES} reference images.`);
    // One after another so each guessed view sees the ones before it.
    void list.reduce((p, file) => p.then(() => referenceImage(file)
      .then((dataUrl) => addImage({ dataUrl, name: file.name || "pasted image" }))
      .catch((e) => setImageError(`${file.name}: ${e.message}`))), Promise.resolve());
  };
  const logRef = useRef<HTMLDivElement>(null);
  const clients = enabledAiClients(settings).filter((c): c is "claude" | "codex" => c === "claude" || c === "codex");
  const preferred = settings.preferred;
  const provider: AiClientId | undefined = clients.includes(preferred as "claude") ? preferred as AiClientId : clients[0];
  const hasReference = images.length > 0 || !!refModel || !!mesh;

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [run.log.length]);

  const start = () => {
    if (!provider || provider === "ollama" || (!prompt.trim() && !hasReference) || meshBusy) return;
    const reference = mesh ? { name: mesh.ref.name, summary: mesh.ref.summary, kind: "mesh" }
      : refModel ? { name: refModel.name, summary: refModel.summary } : null;
    const sent = [
      ...images.map((i) => ({ data: i.dataUrl, view: i.view })),
      ...(mesh?.ref.renders ?? []).map((r) => ({ data: r.dataUrl, view: `${r.view} (render of the uploaded 3D model)` })),
    ];
    startAgentRun({
      provider, model: settings.clients[provider].model,
      prompt: prompt.trim() || (reference ? "Build a mob based on the reference model." : `Build a mob based on the reference image${images.length > 1 ? "s" : ""}.`),
      context: { activeElement, ...(reference ? { referenceModel: reference } : {}) },
      ...(sent.length ? { images: sent } : {}),
    });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--workspace)]" data-testid="model-generator">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 overflow-hidden p-4 text-sm">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold"><Bot className="h-5 w-5 text-primary" />Entity Model Generator</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Describe a mob — the AI builds it live in the editor: 3D model, texture, animations and stats. Every step can be undone
            (Ctrl+Z), and you can watch it work. Uses the Claude Code / Codex login on the machine running the dev server.
          </p>
        </div>

        {clients.length === 0 ? (
          <div className="flex items-start gap-2 rounded-sm border border-input bg-card p-3 text-xs">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Enable <b>Claude Code</b> or <b>Codex</b> under <b>Settings → AI</b> (gear at the bottom of the sidebar). Ollama can&apos;t drive the editor — it has no tool support here.</span>
          </div>
        ) : (
          <>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) start(); }}
              onPaste={(e) => { const f = [...e.clipboardData.files].filter((x) => x.type.startsWith("image/")); if (f.length) { e.preventDefault(); takeImages(f); } }}
              onDragOver={(e) => { if ([...e.dataTransfer.items].some((i) => i.type.startsWith("image/"))) e.preventDefault(); }}
              onDrop={(e) => { const f = [...e.dataTransfer.files].filter((x) => x.type.startsWith("image/")); if (f.length) { e.preventDefault(); takeImages(f); } }}
              disabled={run.running}
              rows={4}
              placeholder="z.B. Ein Höllenhund mit glühenden Augen und Lava-Rissen, feindlich, 30 Leben…"
              className="w-full resize-y rounded-sm border border-input bg-card px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
            <div className="flex flex-col gap-1.5 text-xs" data-testid="reference-image">
              <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" aria-label="Reference image file"
                onChange={(e) => { takeImages(e.target.files); e.target.value = ""; }} />
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={run.running || images.length >= MAX_IMAGES} onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="h-3.5 w-3.5" /> {images.length ? "Add images" : "Reference images"}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {images.length
                    ? `${images.length}/${MAX_IMAGES} — set which view each one shows, the AI combines them`
                    : "optional — drawings, photos or concept art, several views (front, side, back…) work best; or paste / drop into the text field"}
                </span>
                {images.length > 1 && (
                  <button type="button" disabled={run.running} onClick={() => setImages([])} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">Remove all</button>
                )}
              </div>
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((img) => (
                    <div key={img.id} className="flex w-[112px] flex-col gap-1 rounded-sm border border-input bg-card p-1" data-testid="reference-image-tile">
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.dataUrl} alt={`Reference ${img.view}`} title={img.name} className="h-[100px] w-full rounded-sm object-contain" />
                        <button type="button" aria-label={`Remove ${img.name}`} disabled={run.running}
                          onClick={() => setImages((list) => list.filter((i) => i.id !== img.id))}
                          className="absolute right-0.5 top-0.5 rounded-sm bg-background/80 p-0.5 text-muted-foreground hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="truncate text-[10px] text-muted-foreground" title={img.name}>{img.name}</span>
                      <select aria-label={`View of ${img.name}`} value={img.view} disabled={run.running}
                        onChange={(e) => setImages((list) => list.map((i) => (i.id === img.id ? { ...i, view: e.target.value } : i)))}
                        className="h-6 w-full rounded-sm border border-input bg-background px-1 text-[11px]">
                        {VIEW_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5 text-xs" data-testid="reference-model">
              <input ref={modelFileRef} type="file" accept={MODEL_ACCEPT} className="hidden" aria-label="Reference model file"
                onChange={(e) => { void takeModel(e.target.files?.[0]); e.target.value = ""; }} />
              <div className="flex items-center gap-2">
                {meshBusy ? (
                  <><Loader2 className="h-4 w-4 animate-spin text-primary" /><span className="text-muted-foreground">Reading the 3D model…</span></>
                ) : mesh ? (
                  <>
                    <Boxes className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate text-foreground">{mesh.fileName}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {mesh.ref.triangles.toLocaleString()} triangles · {mesh.ref.size.map((v) => Math.round(v)).join("×")} px · {mesh.ref.boxes} voxel boxes
                    </span>
                  </>
                ) : refModel ? (
                  <>
                    <Boxes className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate text-foreground">{refModel.name}</span>
                    <span className="text-[11px] text-muted-foreground">{refModel.bones} bones · {refModel.cubes} cubes — the AI starts from its shape and layout</span>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={run.running} onClick={() => modelFileRef.current?.click()}>
                      <Boxes className="h-3.5 w-3.5" /> Reference model
                    </Button>
                    <span className="text-[11px] text-muted-foreground">optional — a 3D model (STL — converted to quads, simplified above {STL_MAX_POLYGONS.toLocaleString()} polygons — OBJ, GLB/glTF, 3MF) or a Blockbench .bbmodel / GeckoLib .geo.json</span>
                  </>
                )}
                {(mesh || refModel) && !meshBusy && (
                  <Button type="button" variant="ghost" size="sm" className="ml-auto h-7 gap-1 text-xs" disabled={run.running} onClick={() => { setMesh(null); setRefModel(null); }}>
                    <X className="h-3.5 w-3.5" /> Remove
                  </Button>
                )}
              </div>
              {mesh && !meshBusy && (
                <div className="flex flex-col gap-1.5 rounded-sm border border-input bg-card p-2" data-testid="reference-mesh">
                  {mesh.stlNote && <span className="text-[11px] text-muted-foreground" data-testid="stl-note">STL: {mesh.stlNote}</span>}
                  {mesh.ref.renders.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {mesh.ref.renders.map((r) => (
                        <figure key={r.view} className="flex flex-col items-center gap-0.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r.dataUrl} alt={`Model ${r.view}`} className="h-[72px] w-[72px] rounded-sm border border-input bg-[var(--workspace)] object-contain" />
                          <figcaption className="text-[10px] text-muted-foreground">{r.view}</figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Front must face you in “front”:</span>
                    <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-[11px]" disabled={run.running}
                      onClick={() => processMesh(mesh.object, mesh.fileName, { ...mesh.orientation, turns: mesh.orientation.turns + 1 })}>
                      <RotateCw className="h-3 w-3" /> Turn 90°
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[11px]" disabled={run.running}
                      onClick={() => processMesh(mesh.object, mesh.fileName, { ...mesh.orientation, up: mesh.orientation.up === "y" ? "z" : "y" })}>
                      Up axis: {mesh.orientation.up.toUpperCase()}
                    </Button>
                    {runEditorTool && (
                      <Button type="button" variant="secondary" size="sm" className="ml-auto h-6 gap-1 px-2 text-[11px]" disabled={run.running || directBusy}
                        title="Builds the entity model straight from the voxel boxes — no AI, one bone, coloured like the mesh"
                        onClick={() => void createFromMesh()}>
                        {directBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Boxes className="h-3 w-3" />} Create mob directly (no AI)
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
            {imageError && <span className="text-[11px] text-destructive" role="alert">{imageError}</span>}
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={run.running}
                  onClick={() => setPrompt(ex)}
                  className="max-w-full truncate rounded-sm border border-input px-2 py-0.5 text-[11px] text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
                  title={ex}
                >
                  {ex.length > 60 ? `${ex.slice(0, 60)}…` : ex}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {clients.length > 1 && (
                <select
                  aria-label="AI client"
                  value={provider}
                  disabled={run.running}
                  onChange={(e) => setAiPreferred(e.target.value as AiClientId)}
                  className="h-8 rounded-sm border border-input bg-background px-2 text-xs"
                >
                  {clients.map((c) => <option key={c} value={c}>{aiClientLabel(c)}</option>)}
                </select>
              )}
              {run.running ? (
                <Button size="sm" variant="destructive" className="h-8 gap-1.5" onClick={stopAgentRun}>
                  <Square className="h-3.5 w-3.5" /> Stop
                </Button>
              ) : (
                <Button size="sm" className="h-8 gap-1.5" disabled={(!prompt.trim() && !hasReference) || meshBusy} onClick={start}>
                  <Play className="h-3.5 w-3.5" /> Generate with {provider ? aiClientLabel(provider) : "AI"}
                </Button>
              )}
              <span className="text-[11px] text-muted-foreground">Ctrl+Enter</span>
              {!run.running && run.log.length > 0 && (
                <button type="button" onClick={clearAgentRun} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">Clear log</button>
              )}
            </div>
          </>
        )}

        {(run.running || run.log.length > 0) && (
          <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-input bg-card p-2 font-mono text-[11px]" data-testid="model-generator-log">
            {run.log.map((l, i) => (
              <div key={i} className="flex items-start gap-1.5 py-0.5">
                {l.kind === "tool" ? <Wrench className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  : l.kind === "error" ? <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                  : <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />}
                <span className={`min-w-0 whitespace-pre-wrap break-words ${l.kind === "error" ? "text-destructive" : l.kind === "text" ? "text-foreground" : "text-muted-foreground"}`}>
                  {l.kind === "tool" ? (TOOL_LABELS[l.text] ?? l.text) : l.text}
                  {l.kind === "tool" && l.detail && l.detail !== "{}" && <span className="opacity-60"> {l.detail}</span>}
                </span>
              </div>
            ))}
            {run.running && (
              <div className="flex items-center gap-1.5 py-0.5 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {run.port ? "Working… (the editor switches to the model while it's being built)" : "Starting…"}
              </div>
            )}
            {run.result && (
              <div className={`mt-1 flex items-start gap-1.5 border-t border-input pt-1.5 ${run.result.ok ? "text-foreground" : "text-destructive"}`}>
                {run.result.ok ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-600 dark:text-green-400" /> : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
                <span className="whitespace-pre-wrap break-words">{run.result.text || (run.result.ok ? "Done." : "Failed.")}</span>
              </div>
            )}
          </div>
        )}
        {run.result?.ok && (
          <Button variant="secondary" size="sm" className="h-8 w-fit" onClick={onOpenModels}>Show Entity Models</Button>
        )}
      </div>
    </div>
  );
}

/** Reads an image file as a data URL, scaled down to at most 1024 px (less upload, fewer tokens). */
async function referenceImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That's not an image.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    // Photos as JPEG, everything else (pixel art, transparency) as PNG.
    return file.type === "image/jpeg" ? c.toDataURL("image/jpeg", 0.9) : c.toDataURL("image/png");
  } catch {
    throw new Error("Couldn't read that image.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
