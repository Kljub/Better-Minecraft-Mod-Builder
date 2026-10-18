"use client";

import { useEffect, useRef, useState } from "react";
import { Bone, Loader2, RotateCw, Sparkles, Upload } from "lucide-react";
import type { Object3D, AnimationClip } from "three";
import { Button } from "@/components/ui/button";
import MeshRigViewer3D from "@/components/MeshRigViewer3D";
import { aiClientLabel, aiGenerate, enabledAiClients, useAiSettings, type AiClientId } from "@/lib/aiSettings";
import { buildMeshReference, defaultOrientation, loadMeshAsset, meshExtension, prepareStl, MESH_EXTENSIONS } from "@/lib/model3d/meshReference";
import { buildMeshPack, type BuiltMesh } from "@/lib/model3d/meshPack";
import { cacheMeshPack, MESH_PACK_SUFFIX } from "@/lib/model3d/meshPackStore";
import type { AiRig } from "@/lib/model3d/aiRig";
import { aiToAnimation, animationContext, type AiAnimation } from "@/lib/model3d/aiAnimation";
import { makeBone, makeCube } from "@/lib/model3d/geometry";
import type { EntityModel, Vec3 } from "@/lib/model3d/types";
import { deleteStructureFile, loadStructureFile, saveStructureFile } from "@/lib/structureStore";
import { meshBuildSignature, meshValue, type MeshModelValue } from "@/lib/elements/meshKind";

const ACCEPT = MESH_EXTENSIONS.map((e) => `.${e}`).join(",");

/** Animations the AI makes for an AI rig, with what each should look like. */
const AI_ANIMATIONS: { name: string; brief: string }[] = [
  { name: "idle", brief: "a looping idle: subtle breathing / swaying, 2–3 s, small angles" },
  { name: "walk", brief: "a looping walk cycle, ~1 s: legs (or whatever it moves with — wings flap for flyers) in alternating phase" },
  { name: "attack", brief: "a one-shot melee attack, 0.4–0.7 s (loop \"once\"): wind-up, strike towards the front (-Z), recover" },
];

interface Loaded { source: string; object: Object3D; animations: AnimationClip[]; note?: string }

/**
 * Mesh Models: upload a mesh, pick item / block / entity, orient it, and — for entities — get bones
 * (the file's skeleton, or Claude / Codex rig it from renders + voxel boxes) and animations. Every
 * change rebuilds the mesh pack (stored in IndexedDB) the export writes as OBJ models.
 */
export default function MeshModelField({ value, onChange }: { value: unknown; onChange: (v: MeshModelValue) => void }) {
  const v = meshValue({ id: "", mesh: value });
  const latest = useRef(v);
  useEffect(() => { latest.current = v; });
  const update = (patch: Partial<MeshModelValue>) => onChange({ ...latest.current, ...patch });

  const inputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [built, setBuilt] = useState<(BuiltMesh & { sig: string }) | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anim, setAnim] = useState("");
  const [showBones, setShowBones] = useState(true);
  const [hint, setHint] = useState("");
  const settings = useAiSettings();
  const clients = enabledAiClients(settings);
  const [client, setClient] = useState<AiClientId | null>(null);
  const ai = client && clients.includes(client) ? client : settings.preferred !== "all" && clients.includes(settings.preferred) ? settings.preferred : clients[0];

  // Load the stored file (after a reload, or when another element is opened).
  useEffect(() => {
    if (!v.source || loaded?.source === v.source) return;
    let cancelled = false;
    (async () => {
      const blob = await loadStructureFile(v.source);
      if (!blob) throw new Error("The model file isn't stored in this browser any more — upload it again.");
      const asset = await loadMeshAsset(new File([blob], v.fileName || "model.glb"));
      const stl = meshExtension(v.fileName) === "stl" ? prepareStl(asset.object) : null;
      if (!cancelled) setLoaded({ source: v.source, object: stl?.object ?? asset.object, animations: asset.animations, note: stl?.note });
    })().catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [v.source, v.fileName, loaded?.source]);

  // Build the pack (and the preview) whenever its inputs change; store it when they differ from the stored one.
  const sig = meshBuildSignature(v);
  useEffect(() => {
    if (!loaded || loaded.source !== v.source) return;
    let cancelled = false;
    const cur = latest.current;
    buildMeshPack(loaded, {
      target: cur.target, orientation: { up: cur.up, turns: cur.turns }, height: cur.height,
      rig: cur.rig, aiRig: cur.aiRig, aiRigHeight: cur.aiRigHeight, aiAnimations: cur.aiAnimations,
    }).then(async (b) => {
      if (cancelled) return;
      setBuilt({ ...b, sig });
      setError(null);
      if (cur.built === sig && cur.pack) {
        cacheMeshPack(cur.pack, b.pack);
        return;
      }
      const key = await saveStructureFile(new Blob([JSON.stringify(b.pack)], { type: "application/json" }), `${(cur.fileName || "model").replace(/\.[^.]+$/, "")}${MESH_PACK_SUFFIX}`);
      cacheMeshPack(key, b.pack);
      const old = latest.current.pack;
      if (!cancelled) update({ pack: key, built: sig });
      if (old && old !== key) void deleteStructureFile(old).catch(() => {});
    }).catch((e) => { if (!cancelled) setError(`Couldn't convert the model: ${e instanceof Error ? e.message : String(e)}`); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sig covers every build input
  }, [loaded, sig]);

  const upload = async (file: File) => {
    setError(null);
    setBusy("Reading the model…");
    try {
      const ext = meshExtension(file.name);
      if (!ext) throw new Error("Use STL, OBJ, GLB/glTF, FBX or 3MF.");
      const asset = await loadMeshAsset(file);
      let skeleton = false;
      asset.object.traverse((o) => { if ((o as { isSkinnedMesh?: boolean }).isSkinnedMesh) skeleton = true; });
      const stl = ext === "stl" ? prepareStl(asset.object) : null;
      const key = await saveStructureFile(file, file.name);
      const old = latest.current;
      setLoaded({ source: key, object: stl?.object ?? asset.object, animations: asset.animations, note: stl?.note });
      onChange({
        ...old, source: key, fileName: file.name, pack: "", built: "", ...defaultOrientation(ext),
        rig: skeleton ? "file" : "none", skeleton, aiRig: undefined, aiRigHeight: undefined, aiAnimations: undefined,
      });
      for (const k of [old.source, old.pack]) if (k) void deleteStructureFile(k).catch(() => {});
      setAnim("");
    } catch (e) {
      setError(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  /** Claude / Codex set the bones from renders + the voxel approximation at the mob's size. */
  const rigWithAi = async () => {
    if (!loaded || !ai) return;
    setError(null);
    setBusy(`${aiClientLabel(ai)} is setting the bones…`);
    try {
      const ref = buildMeshReference(loaded.object, v.fileName, { up: v.up, turns: v.turns }, true, { mode: "height", px: v.height * 16 });
      const boxes = (JSON.parse(ref.summary) as { boxes: { from: Vec3; size: Vec3 }[] }).boxes.map(({ from, size }) => ({ from, size }));
      const rig = await aiGenerate<AiRig>(ai, "rig", hint.trim() || "Rig this model as a Minecraft mob so it can idle, walk and attack.",
        { size: ref.size, boxes }, ref.renders.map((r) => ({ data: r.dataUrl, label: `${r.view} view` })));
      update({ rig: "ai", aiRig: rig, aiRigHeight: v.height, aiAnimations: undefined });
      setAnim("");
    } catch (e) {
      setError(`Rigging failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  /** idle / walk / attack for the AI rig, one AI call each (the editor's animation task). */
  const animateWithAi = async () => {
    if (!v.aiRig || !ai) return;
    setError(null);
    const scale = v.height / Math.max(0.1, v.aiRigHeight ?? v.height);
    const rigModel: EntityModel = {
      textureWidth: 16, textureHeight: 16, texture: "",
      bones: v.aiRig.bones.map((b) => makeBone({ id: b.name, name: b.name, parent: b.parent || null, origin: b.pivot.map((x) => x * scale) as Vec3 })),
      cubes: v.aiRig.bones.map((b) => makeCube({
        name: b.name, bone: b.name, from: b.region.from.map((x) => x * scale) as Vec3,
        to: b.region.from.map((x, i) => (x + b.region.size[i]) * scale) as Vec3,
      })),
    };
    const out = [];
    try {
      for (const a of AI_ANIMATIONS) {
        setBusy(`${aiClientLabel(ai)} is animating: ${a.name}…`);
        const answer = await aiGenerate<AiAnimation>(ai, "animation",
          `Create the "${a.name}" animation: ${a.brief}.${hint.trim() ? ` About the model: ${hint.trim()}` : ""}`,
          animationContext(rigModel, null) as unknown as Record<string, unknown>);
        out.push({ ...aiToAnimation(rigModel, answer, null), name: a.name });
      }
      update({ aiAnimations: out });
      setAnim("walk");
    } catch (e) {
      setError(`Animating failed: ${e instanceof Error ? e.message : String(e)}`);
      if (out.length) update({ aiAnimations: out });
    } finally {
      setBusy(null);
    }
  };

  const entity = v.target === "entity";
  const converting = !!loaded && loaded.source === v.source && built?.sig !== sig && !error;
  const current = built?.animations.find((a) => a.name === anim) ?? null;
  const seg = (active: boolean) => `h-6 rounded-sm border px-2 text-[11px] ${active ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="flex flex-col gap-2" data-testid="mesh-model-field">
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" aria-label="Mesh file"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={!!busy} onClick={() => inputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> {v.source ? "Replace model" : "Upload 3D model"}
        </Button>
        <span className="truncate text-[11px] text-muted-foreground">
          {v.source ? v.fileName : "STL, OBJ, GLB/glTF, FBX or 3MF — GLB/FBX may bring a skeleton and animations"}
        </span>
      </div>

      {v.source && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground">Use as</span>
            {(["entity", "item", "block"] as const).map((t) => (
              <button key={t} type="button" className={seg(v.target === t)} onClick={() => update({ target: t })}>{t === "entity" ? "Entity (mob)" : t === "item" ? "Item" : "Block"}</button>
            ))}
            {entity && (
              <label className="ml-2 flex items-center gap-1 text-muted-foreground">
                Height
                <input type="number" min={0.25} max={16} step={0.25} value={v.height} aria-label="Height in blocks"
                  onChange={(e) => { const n = Number(e.target.value); if (n > 0) update({ height: Math.min(16, n) }); }}
                  className="h-6 w-14 rounded-sm border border-input bg-background px-1 text-[11px]" />
                blocks
              </label>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground">Front faces you in the preview?</span>
            <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={() => update({ turns: v.turns + 1 })}>
              <RotateCw className="h-3 w-3" /> Turn 90°
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => update({ up: v.up === "y" ? "z" : "y" })}>
              Up axis: {v.up.toUpperCase()}
            </Button>
          </div>

          {entity && (
            <div className="flex flex-col gap-1.5 rounded-sm border border-input bg-card p-2 text-[11px]" data-testid="mesh-rig">
              <div className="flex flex-wrap items-center gap-1.5">
                <Bone className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">Bones</span>
                {v.skeleton && <button type="button" className={seg(v.rig === "file")} onClick={() => update({ rig: "file" })}>From the file</button>}
                <button type="button" className={seg(v.rig === "ai")} disabled={!v.aiRig} onClick={() => update({ rig: "ai" })}>AI rig{v.aiRig ? ` (${v.aiRig.bones.length})` : ""}</button>
                <button type="button" className={seg(v.rig === "none")} onClick={() => update({ rig: "none" })}>None (rigid)</button>
              </div>
              {clients.length === 0 ? (
                <span className="text-muted-foreground">Enable Claude Code, Codex or Ollama in Settings → AI to let the AI set the bones.</span>
              ) : (
                <>
                  <textarea rows={2} value={hint} onChange={(e) => setHint(e.target.value)} aria-label="Rig hint"
                    placeholder="optional — tell the AI what it is, e.g. „Engel mit 4 Spinnenbeinen, 2 Flügelpaaren, Stab in der rechten Hand“"
                    className="resize-y rounded-sm border border-input bg-background px-2 py-1 text-[11px]" />
                  <div className="flex flex-wrap items-center gap-1.5">
                    {clients.length > 1 && (
                      <select aria-label="AI client" value={ai} onChange={(e) => setClient(e.target.value as AiClientId)} className="h-6 rounded-sm border border-input bg-background px-1 text-[11px]">
                        {clients.map((c) => <option key={c} value={c}>{aiClientLabel(c)}</option>)}
                      </select>
                    )}
                    <Button type="button" size="sm" className="h-6 gap-1 px-2 text-[11px]" disabled={!!busy || !loaded} onClick={() => void rigWithAi()}>
                      <Sparkles className="h-3 w-3" /> {v.aiRig ? "Rig again with" : "Set bones with"} {ai ? aiClientLabel(ai) : "AI"}
                    </Button>
                    {v.rig === "ai" && v.aiRig && (
                      <Button type="button" size="sm" variant="secondary" className="h-6 gap-1 px-2 text-[11px]" disabled={!!busy} onClick={() => void animateWithAi()}>
                        <Sparkles className="h-3 w-3" /> {v.aiAnimations?.length ? "Re-animate" : "Animate"} (idle, walk, attack)
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {(busy || converting || error || loaded?.note) && (
            <div className="flex flex-col gap-0.5 text-[11px]">
              {(busy || converting) && <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{busy ?? "Converting…"}</span>}
              {loaded?.note && <span className="text-muted-foreground" data-testid="mesh-note">STL: {loaded.note}</span>}
              {error && <span className="text-destructive" role="alert">{error}</span>}
            </div>
          )}

          {built && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground" data-testid="mesh-stats">
                <span>{built.pack.triangles.toLocaleString()} triangles</span>
                <span>{built.pack.size.map((s) => s.toFixed(2)).join(" × ")} blocks</span>
                {entity && <span>{built.bones.length} bones · {built.preview.length} parts</span>}
                {entity && built.animations.length > 0 && (
                  <select aria-label="Preview animation" value={anim} onChange={(e) => setAnim(e.target.value)} className="h-6 rounded-sm border border-input bg-background px-1 text-[11px]">
                    <option value="">Rest pose</option>
                    {built.animations.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                  </select>
                )}
                {entity && (
                  <label className="flex items-center gap-1"><input type="checkbox" checked={showBones} onChange={(e) => setShowBones(e.target.checked)} /> bones</label>
                )}
              </div>
              <MeshRigViewer3D parts={built.preview} bones={built.bones} animation={current} showBones={entity && showBones}
                className="h-80 w-full overflow-hidden rounded-sm border border-input bg-[var(--workspace)]" />
              {entity && <p className="text-[10px] text-muted-foreground">Each colour is one rigid part (one bone). The mob faces away from the grid&apos;s far side — its front is −Z.</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}
