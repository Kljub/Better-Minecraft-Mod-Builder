"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Bone, Copy, Trash2, Move3d, Rotate3d, Scaling, Upload, Download, Camera, ChevronDown, ChevronRight, FileCode2,
  PenTool, Clapperboard, SlidersHorizontal, KeyRound, Palette,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import TexturePickerModal from "@/components/TexturePickerModal";
import { NumInput, TextureField, Toggle } from "@/components/SchemaFields";
import { FieldGrid } from "@/components/ElementEditor";
import ModelViewport, { type GizmoMode, type ModelViewportHandle, type Selection, type TransformResult, type ViewPreset } from "./ModelViewport";
import AnimationTimeline from "./AnimationTimeline";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import SkinPainter from "./SkinPainter";
import { useTextures } from "@/lib/TextureContext";
import { downloadBlob } from "@/lib/exportBundle";
import { FACE_KEYS, type EntityModel, type FaceKey, type Vec3 } from "@/lib/model3d/types";
import { boxUvRects, cubeSize } from "@/lib/model3d/geometry";
import {
  addBone, addCube, applyGizmo, copySelection, deleteSelection, duplicateSelection, hasClipboard, moveCubeTo, pasteClipboard,
  reparentBone, resizeCube, setBonePivot, updateBone, updateCube,
} from "@/lib/model3d/edit";
import { BBMODEL_FORMATS, fromBbmodel, fromBedrockGeo, toBbmodel, toBedrockGeo, toJavaModel, sanitizeBoneNames, type BbmodelFormat } from "@/lib/model3d/codecs";
import {
  CHANNELS, deleteKeyframe, evaluate, findKeyframe, fromBedrockAnimations, makeAnimation, playbackTime, pruneAnimations,
  sampleChannel, setKeyframe, toBedrockAnimations, toJavaAnimations, updateKeyframe, type Channel, type Interpolation, type ModelAnimation,
} from "@/lib/model3d/animation";
import { ENTITY_SETTINGS_FIELDS } from "@/lib/elements/entitySettings";
import type { FieldContext } from "@/lib/elements/types";
import type { McVersion } from "@/lib/mcVersion";
import { registerModelEditor } from "@/lib/ai/modelEditorRegistry";

const pascal = (s: string) => s.replace(/(^|[_\-\s.]+)([a-z0-9])/gi, (_, __, c: string) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, "") || "Model";

async function blobUrlToDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function Vec3Field({ label, value, onChange, step }: { label: string; value: Vec3; onChange: (v: Vec3) => void; step?: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground">{label}</span>
      <div className="grid grid-cols-3 gap-1">
        {(["X", "Y", "Z"] as const).map((axis, i) => (
          <label key={axis} className="relative">
            <span className={`pointer-events-none absolute left-1 top-1/2 z-10 -translate-y-1/2 text-[9px] font-bold ${["text-red-400", "text-green-400", "text-blue-400"][i]}`}>{axis}</span>
            <div className="[&_input]:pl-4">
              <NumInput value={Math.round(value[i] * 10000) / 10000} onChange={(n) => {
                const next = [...value] as Vec3;
                next[i] = step ? Math.round(n / step) * step : n;
                onChange(next);
              }} />
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

const sectionTitle = "font-semibold uppercase tracking-wide text-muted-foreground";

/** Editable model name (registry id) in the header; commits on Enter/blur, Escape reverts. */
function ModelNameField({ id, modId, onRename }: { id: string; modId: string; onRename?: (id: string) => boolean }) {
  const [draft, setDraft] = useState(id);
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) { setPrevId(id); setDraft(id); }
  const commit = () => {
    const v = draft.trim();
    if (!v || v === id || !onRename || !onRename(v)) setDraft(id);
  };
  return (
    <label className="ml-2 flex shrink-0 items-center gap-1 text-muted-foreground" title="Model name (registry id) — used for the entity, its texture, spawn egg and exports">
      <Box className="h-3.5 w-3.5 text-primary" />
      <span className="font-mono">{modId}:</span>
      <input
        aria-label="Model name"
        data-testid="model-name"
        className="h-6 w-36 rounded-sm border border-transparent bg-transparent px-1 font-mono text-xs text-foreground hover:border-input focus:border-ring focus:outline-none"
        value={draft}
        disabled={!onRename}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(id); e.currentTarget.blur(); }
        }}
      />
    </label>
  );
}
type Tab = "design" | "animation" | "skin" | "settings";

/**
 * Entity Model editor with three tabs:
 *  - Design: bones + cubes (Blockbench-style), GPU-rendered viewport with gizmo, UV, texture
 *  - Animation: keyframe timeline per bone; posing a bone with the gizmo writes a keyframe
 *  - Settings: what the mob is in game (stats, behaviour, damage type, spawning, egg)
 * Imports .bbmodel / geo.json / animation.json; exports .bbmodel, geo.json, animation.json and
 * Java model + animation classes for the project's Minecraft version.
 */
export default function ModelEditor({ id, model, modId, mcVersion, onChange, settings, onSettingsChange, fieldCtx, onExportBedrockAddon, onRename, variant = "entity" }: {
  id: string;
  model: EntityModel;
  modId: string;
  mcVersion: McVersion;
  onChange: (model: EntityModel) => void;
  settings: Record<string, unknown>;
  onSettingsChange: (patch: Record<string, unknown>) => void;
  fieldCtx: FieldContext;
  /** renames the model's registry id; returns false if refused (empty/taken) */
  onRename?: (id: string) => boolean;
  /** builds and downloads a Bedrock .mcaddon with this entity, or every entity of the project */
  onExportBedrockAddon?: (scope: "this" | "all") => void;
  /** "armor": a custom armor model — Design + Skin only, a see-through player to fit it to, ArmorModelAPI export */
  variant?: "entity" | "armor";
}) {
  const { packTextures, uploadCustomTexture } = useTextures();
  const [tab, setTab] = useState<Tab>("design");
  const [selection, setSelection] = useState<Selection>(null);
  const [mode, setMode] = useState<GizmoMode>("translate");
  const [snap, setSnap] = useState(1);
  const [rotationSnap, setRotationSnap] = useState(2.5);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [texPicker, setTexPicker] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [animId, setAnimId] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedKf, setSelectedKf] = useState<string | null>(null);
  const viewport = useRef<ModelViewportHandle>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const animations = useMemo(() => model.animations ?? [], [model.animations]);
  const anim = animations.find((a) => a.id === animId) ?? animations[0] ?? null;

  // Drop a selection whose element no longer exists (undo, delete, import).
  const sel: Selection = selection && (selection.type === "cube" ? model.cubes.some((c) => c.id === selection.id) : model.bones.some((b) => b.id === selection.id)) ? selection : null;
  const selectedCube = sel?.type === "cube" ? model.cubes.find((c) => c.id === sel.id) : undefined;
  const selectedBone = sel?.type === "bone" ? model.bones.find((b) => b.id === sel.id) : undefined;
  const textureUrl = model.texture ? packTextures[model.texture] : undefined;
  /** Bone the next added element goes into / the bone being animated. */
  const targetBone = selectedBone?.id ?? selectedCube?.bone ?? model.bones[0]?.id ?? null;

  /** Every model change goes through here: keeps animations free of deleted bones. */
  const commit = useCallback((next: EntityModel) => {
    onChange(next.bones.length !== model.bones.length ? { ...next, animations: pruneAnimations(next, next.animations ?? []) } : next);
  }, [onChange, model.bones.length]);
  const setAnimations = (list: ModelAnimation[]) => commit({ ...model, animations: list });
  const updateAnim = (next: ModelAnimation) => setAnimations(animations.map((a) => (a.id === next.id ? next : a)));

  // ── design actions ──
  const doAddCube = () => { const r = addCube(model, targetBone); commit(r.model); setSelection({ type: "cube", id: r.id }); };
  const doAddBone = (parent: string | null = selectedBone?.id ?? null) => { const r = addBone(model, parent); commit(r.model); setSelection({ type: "bone", id: r.id }); };
  const doDelete = (s: Selection = sel) => { if (s) { commit(deleteSelection(model, s)); setSelection(null); } };
  const doDuplicate = (s: Selection = sel) => { const r = duplicateSelection(model, s); commit(r.model); setSelection(r.selection); };
  const doCopy = (s: Selection = sel) => { if (copySelection(model, s)) toast.success("Copied."); };
  const doPaste = () => { const r = pasteClipboard(model, targetBone); if (r.selection) { commit(r.model); setSelection(r.selection); } };

  // ── animation actions ──
  const addAnimation = () => {
    const name = window.prompt("Animation name:", animations.length ? `animation${animations.length + 1}` : "idle");
    if (!name?.trim()) return;
    const a = makeAnimation(name.trim().replace(/\s+/g, "_"));
    setAnimations([...animations, a]);
    setAnimId(a.id);
    setTime(0);
  };
  /** Writes a keyframe for the current bone at the playhead (creates an animation if there is none). */
  const keyAtPlayhead = (boneId: string, channel: Channel, value: Vec3) => {
    let a = anim;
    let list = animations;
    if (!a) { a = makeAnimation("idle"); list = [...animations, a]; setAnimId(a.id); }
    const next = setKeyframe(a, boneId, channel, time, value);
    commit({ ...model, animations: list.map((x) => (x.id === next.id ? next : x)).concat(list.some((x) => x.id === next.id) ? [] : [next]) });
    const kf = next.bones[boneId][channel].find((k) => Math.abs(k.time - time) < 0.001);
    if (kf) setSelectedKf(kf.id);
  };
  const currentValue = (boneId: string, channel: Channel): Vec3 =>
    anim?.bones[boneId] ? sampleChannel(anim.bones[boneId][channel], time, channel) : channel === "scale" ? [1, 1, 1] : [0, 0, 0];

  const onTransformEnd = (s: NonNullable<Selection>, result: TransformResult) => {
    if (tab === "design") { commit(applyGizmo(model, s, result, snap)); return; }
    // Animation tab: posing a bone records a keyframe at the playhead.
    const boneId = s.type === "bone" ? s.id : model.cubes.find((c) => c.id === s.id)?.bone;
    const bone = model.bones.find((b) => b.id === boneId);
    if (!bone) return;
    const round = (v: Vec3, step: number): Vec3 => v.map((x) => Math.round(x / step) * step + 0) as Vec3;
    if (result.kind === "rotate") keyAtPlayhead(bone.id, "rotation", round([result.rotation[0] - bone.rotation[0], result.rotation[1] - bone.rotation[1], result.rotation[2] - bone.rotation[2]], 0.01));
    else if (result.kind === "translate") { const c = currentValue(bone.id, "position"); keyAtPlayhead(bone.id, "position", round([c[0] + result.delta[0], c[1] + result.delta[1], c[2] + result.delta[2]], snap || 0.01)); }
    else { const c = currentValue(bone.id, "scale"); keyAtPlayhead(bone.id, "scale", round([c[0] * result.scale[0], c[1] * result.scale[1], c[2] * result.scale[2]], 0.01)); }
  };

  // Controls for the AI bridge (screenshots, views, tabs, posing at an animation time).
  const animsRef = useRef(animations);
  useEffect(() => { animsRef.current = animations; });
  useEffect(() => registerModelEditor({
    // armor models live next to entity models of the same name — keep their AI handles apart
    modelId: variant === "armor" ? `armor:${id}` : id,
    screenshot: () => viewport.current?.screenshot() ?? "",
    setView: (v) => viewport.current?.setView(v as ViewPreset),
    setTab: (t) => { if (t === "design" || t === "animation" || t === "skin" || t === "settings") { setTab(t); setPlaying(false); } },
    pose: (name, t) => {
      if (!name) { setTab("design"); return; }
      const a = animsRef.current.find((x) => x.name === name);
      if (!a) throw new Error(`animation "${name}" not found`);
      setTab("animation");
      setPlaying(false);
      setAnimId(a.id);
      setTime(Math.max(0, t));
    },
  }), [id, variant]);

  // Pose the viewport for the animation tab; rest pose elsewhere.
  useEffect(() => {
    viewport.current?.applyPose(tab === "animation" && anim ? evaluate(anim, time) : null);
  }, [tab, anim, time]);

  // Playback loop.
  useEffect(() => {
    if (!playing || !anim || tab !== "animation") return;
    let raf = 0;
    const start = performance.now() - time * 1000;
    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;
      const t = playbackTime(anim, elapsed);
      setTime(t);
      if (anim.loop !== "loop" && elapsed >= anim.length) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, anim?.id, anim?.length, anim?.loop, tab]);

  // In the animation tab a picked cube selects its bone (only bones animate).
  const select = (s: Selection) => {
    if (tab === "animation" && s?.type === "cube") {
      const bone = model.cubes.find((c) => c.id === s.id)?.bone;
      setSelection(bone ? { type: "bone", id: bone } : null);
    } else setSelection(s);
  };

  // ── context menus ──
  const boneMenu = (s: NonNullable<Selection>): MenuItem[] => [
    { label: "Move to bone", children: [
      { label: "(root)", onClick: () => commit(s.type === "cube" ? updateCube(model, s.id, { bone: null }) : reparentBone(model, s.id, null)) },
      ...model.bones.filter((b) => !(s.type === "bone" && b.id === s.id)).map((b) => ({
        label: b.name, onClick: () => commit(s.type === "cube" ? updateCube(model, s.id, { bone: b.id }) : reparentBone(model, s.id, b.id)),
      })),
    ] },
  ];
  const openMenu = (s: Selection, x: number, y: number) => {
    if (tab === "animation") {
      const boneId = s?.type === "bone" ? s.id : s?.type === "cube" ? model.cubes.find((c) => c.id === s.id)?.bone : undefined;
      if (!boneId) return;
      setMenu({ x, y, items: [
        ...CHANNELS.map((ch) => ({ label: `Add ${ch} keyframe at ${time.toFixed(2)} s`, onClick: () => keyAtPlayhead(boneId, ch, currentValue(boneId, ch)) })),
        { label: "", separator: true },
        { label: "Delete this bone's keyframes at playhead", danger: true, disabled: !anim?.bones[boneId], onClick: () => {
          if (!anim) return;
          let next = anim;
          for (const ch of CHANNELS) for (const k of anim.bones[boneId]?.[ch] ?? []) if (Math.abs(k.time - time) < 0.001) next = deleteKeyframe(next, k.id);
          updateAnim(next);
        } },
      ] });
      return;
    }
    const items: MenuItem[] = s ? [
      { label: "Copy", shortcut: "Ctrl+C", onClick: () => doCopy(s) },
      { label: "Paste", shortcut: "Ctrl+V", disabled: !hasClipboard(), onClick: doPaste },
      { label: "Duplicate", shortcut: "Ctrl+D", onClick: () => doDuplicate(s) },
      { label: "Rename", shortcut: "F2", onClick: () => setRenaming(s.id) },
      { label: "", separator: true },
      { label: "Add cube here", onClick: doAddCube },
      ...(s.type === "bone" ? [{ label: "Add child bone", onClick: () => doAddBone(s.id) }] : []),
      ...boneMenu(s),
      { label: "", separator: true },
      { label: "Delete", shortcut: "Del", danger: true, onClick: () => doDelete(s) },
    ] : [
      { label: "Paste", shortcut: "Ctrl+V", disabled: !hasClipboard(), onClick: doPaste },
      { label: "Add cube", onClick: doAddCube },
      { label: "Add bone", onClick: () => doAddBone(null) },
    ];
    setMenu({ x, y, items });
  };

  // ── keyboard (global Ctrl+Z/Y undo is handled by the page) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.("input, textarea, select, [contenteditable='true']")) return;
      if (tab === "settings" || tab === "skin") return;
      const mod = e.ctrlKey || e.metaKey;
      if (tab === "animation") {
        if (e.key === " ") { e.preventDefault(); if (anim) setPlaying((p) => !p); return; }
        if ((e.key === "Delete" || e.key === "Backspace") && selectedKf && anim) { e.preventDefault(); updateAnim(deleteKeyframe(anim, selectedKf)); setSelectedKf(null); return; }
      } else {
        if (mod && e.key === "d") { e.preventDefault(); doDuplicate(); return; }
        if (mod && e.key === "c") { e.preventDefault(); doCopy(); return; }
        if (mod && e.key === "v") { e.preventDefault(); doPaste(); return; }
        if (!mod && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); doDelete(); return; }
        if (e.key === "F2" && sel) { e.preventDefault(); setRenaming(sel.id); return; }
      }
      if (mod) return;
      if (e.key === "g" || e.key === "v") setMode("translate");
      else if (e.key === "r") setMode("rotate");
      else if (e.key === "s") setMode("scale");
      else if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── outliner tree ──
  const tree = useMemo(() => {
    const rows: { kind: "bone" | "cube"; id: string; name: string; depth: number; hasChildren: boolean }[] = [];
    const boneIds = new Set(model.bones.map((b) => b.id));
    const visit = (parent: string | null, depth: number) => {
      for (const b of model.bones.filter((x) => (x.parent && boneIds.has(x.parent) ? x.parent : null) === parent)) {
        const kids = model.bones.some((x) => x.parent === b.id) || model.cubes.some((c) => c.bone === b.id);
        rows.push({ kind: "bone", id: b.id, name: b.name, depth, hasChildren: kids });
        if (!collapsed.has(b.id)) visit(b.id, depth + 1);
      }
      if (tab === "animation") return; // only bones animate
      for (const c of model.cubes.filter((x) => (x.bone && boneIds.has(x.bone) ? x.bone : null) === parent)) {
        rows.push({ kind: "cube", id: c.id, name: c.name, depth, hasChildren: false });
      }
    };
    visit(null, 0);
    return rows;
  }, [model, collapsed, tab]);

  // ── import / export ──
  const handleImport = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      // Animation-only file (Bedrock/GeckoLib animation.json): merge into this model's animations.
      if (json && typeof json === "object" && "animations" in json && !("meta" in json) && !("minecraft:geometry" in json)) {
        const { animations: imported, warnings } = fromBedrockAnimations(json, model);
        const names = new Set(imported.map((a) => a.name));
        setAnimations([...animations.filter((a) => !names.has(a.name)), ...imported]);
        if (imported[0]) { setAnimId(imported[0].id); setTab("animation"); }
        toast.success(`Imported ${imported.length} animation(s).`);
        for (const w of warnings.slice(0, 5)) toast.warning(w);
        return;
      }
      const result = json && typeof json === "object" && "meta" in json ? fromBbmodel(json) : fromBedrockGeo(json);
      let texture = "";
      if (result.textureDataUrl) {
        const blob = await (await fetch(result.textureDataUrl)).blob();
        texture = await uploadCustomTexture(new File([blob], result.textureName || `${id}.png`, { type: blob.type || "image/png" }));
      }
      const hasContent = model.cubes.length > 0 && !(model.cubes.length === 1 && model.bones.length === 1);
      if (hasContent && !window.confirm("Replace the current model with the imported one?")) return;
      commit({ ...result.model, texture: texture || model.texture, animations: result.model.animations ?? [] });
      setSelection(null);
      setAnimId(null);
      viewport.current?.setView("perspective");
      toast.success(`Imported ${result.model.cubes.length} cubes in ${result.model.bones.length} bones${result.model.animations?.length ? ` and ${result.model.animations.length} animations` : ""}.`);
      for (const w of result.warnings) toast.warning(w);
    } catch (err) {
      toast.error(`Could not import: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const download = (content: string, name: string, type = "application/json") => downloadBlob(new Blob([content], { type }), name);
  const exportBbmodel = async (format: BbmodelFormat) => {
    const dataUrl = textureUrl ? await blobUrlToDataUrl(textureUrl).catch(() => undefined) : undefined;
    download(JSON.stringify(toBbmodel(sanitizeBoneNames(model), { name: id, format, textureDataUrl: dataUrl, textureName: `${id}.png` })), `${id}.bbmodel`);
  };
  const exportScreenshot = () => {
    const url = viewport.current?.screenshot();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}.png`;
    a.click();
  };

  const modeBtn = (m: GizmoMode, Icon: typeof Move3d, label: string, key: string) => (
    <Button variant="ghost" size="sm" title={`${label} (${key})`} aria-pressed={mode === m}
      className={`h-7 w-7 px-0 ${mode === m ? "bg-accent text-primary" : ""}`} onClick={() => setMode(m)}>
      <Icon className="h-4 w-4" />
    </Button>
  );
  const tabBtn = (t: Tab, Icon: typeof Move3d, label: string) => (
    <button type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setPlaying(false); setMenu(null); }}
      className={`flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-3 text-xs font-medium ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );

  const uvRects = selectedCube?.boxUv ? boxUvRects(cubeSize(selectedCube), selectedCube.uvOffset, selectedCube.mirror) : null;
  const kfInfo = anim && selectedKf ? findKeyframe(anim, selectedKf) : null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-testid="model-editor">
      {/* ── tabs + toolbar ── */}
      <div className="flex h-9 min-w-0 shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b bg-sidebar pr-2 text-xs [scrollbar-width:thin]" role="tablist">
        <ModelNameField id={id} modId={modId} onRename={onRename} />
        <div className="mx-1 h-4 w-px shrink-0 bg-border" />
        {tabBtn("design", PenTool, "Design")}
        {variant === "entity" && tabBtn("animation", Clapperboard, "Animation")}
        {tabBtn("skin", Palette, "Skin")}
        {variant === "entity" && tabBtn("settings", SlidersHorizontal, "Settings")}
        <div className="mx-1 h-4 w-px bg-border" />
        {tab === "design" && (
          <>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => doAddBone()} title="Add bone"><Bone className="h-3.5 w-3.5" /> Bone</Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={doAddCube} title="Add cube"><Box className="h-3.5 w-3.5" /> Cube</Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 px-0" onClick={() => doDuplicate()} disabled={!sel} title="Duplicate (Ctrl+D)"><Copy className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 px-0" onClick={() => doDelete()} disabled={!sel} title="Delete (Del)"><Trash2 className="h-3.5 w-3.5" /></Button>
            <div className="mx-1 h-4 w-px bg-border" />
          </>
        )}
        {(tab === "design" || tab === "animation") && (
          <>
            {modeBtn("translate", Move3d, tab === "animation" ? "Move bone (keyframe)" : "Move", "G")}
            {modeBtn("rotate", Rotate3d, tab === "animation" ? "Rotate bone (keyframe)" : "Rotate", "R")}
            {modeBtn("scale", Scaling, tab === "animation" ? "Scale bone (keyframe)" : "Resize", "S")}
            <select aria-label="Snap" title="Move/resize snap" className="h-7 rounded-sm border border-input bg-transparent px-1 [&>option]:bg-popover" value={snap} onChange={(e) => setSnap(Number(e.target.value))}>
              {[1, 0.5, 0.25, 0.1, 0].map((s) => <option key={s} value={s}>{s ? `${s} px` : "no snap"}</option>)}
            </select>
            <select aria-label="Rotation snap" title="Rotation snap" className="h-7 rounded-sm border border-input bg-transparent px-1 [&>option]:bg-popover" value={rotationSnap} onChange={(e) => setRotationSnap(Number(e.target.value))}>
              {[22.5, 15, 5, 2.5, 1, 0].map((s) => <option key={s} value={s}>{s ? `${s}°` : "free"}</option>)}
            </select>
            <select aria-label="View" className="h-7 rounded-sm border border-input bg-transparent px-1 [&>option]:bg-popover" defaultValue="" onChange={(e) => { if (e.target.value) viewport.current?.setView(e.target.value as ViewPreset); e.target.value = ""; }}>
              <option value="" disabled>View…</option>
              {(["perspective", "front", "back", "left", "right", "top"] as ViewPreset[]).map((v) => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
            </select>
            <Button variant="ghost" size="sm" className="h-7 w-7 px-0" onClick={exportScreenshot} title="Save screenshot (PNG)"><Camera className="h-3.5 w-3.5" /></Button>
          </>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => importRef.current?.click()} title="Import .bbmodel, Bedrock/GeckoLib .geo.json or .animation.json">
            <Upload className="h-3.5 w-3.5" /> Import
          </Button>
          <input ref={importRef} type="file" accept=".bbmodel,.json" className="hidden" data-testid="model-import-input"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleImport(f); }} />
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-7 items-center gap-1 rounded-sm bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-64">
              {(Object.keys(BBMODEL_FORMATS) as BbmodelFormat[]).map((f) => (
                <DropdownMenuItem key={f} onClick={() => exportBbmodel(f)}>Blockbench .bbmodel — {BBMODEL_FORMATS[f]}</DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => download(JSON.stringify(toBedrockGeo(sanitizeBoneNames(model), { identifier: id }), null, 2), `${id}.geo.json`)}>{variant === "armor" ? "ArmorModelAPI / GeckoLib .geo.json" : "Bedrock / GeckoLib .geo.json"}</DropdownMenuItem>
              {variant === "entity" && (<>
              <DropdownMenuItem disabled={!animations.length} onClick={() => download(JSON.stringify(toBedrockAnimations(sanitizeBoneNames(model), animations, id), null, 2), `${id}.animation.json`)}>Bedrock / GeckoLib .animation.json</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => download(toJavaModel(sanitizeBoneNames(model), { className: `${pascal(id)}Model`, modId, layer: id, mcVersion }), `${pascal(id)}Model.java`, "text/x-java")}>
                <FileCode2 className="mr-2 h-3.5 w-3.5" />Java model class (Minecraft {mcVersion})
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!animations.length} onClick={() => download(toJavaAnimations(sanitizeBoneNames(model), animations, `${pascal(id)}Animations`), `${pascal(id)}Animations.java`, "text/x-java")}>
                <FileCode2 className="mr-2 h-3.5 w-3.5" />Java animations class
              </DropdownMenuItem>
              </>)}
              {onExportBedrockAddon && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onExportBedrockAddon("this")}>Bedrock add-on (.mcaddon) — this mob</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExportBedrockAddon("all")}>Bedrock add-on (.mcaddon) — all mobs</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {tab === "skin" ? (
        <SkinPainter modelId={id} model={model} onChange={commit} />
      ) : tab === "settings" ? (
        <div className="flex-1 overflow-y-auto" data-testid="entity-settings">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 text-xs">
            <h2 className="text-base font-semibold">Entity settings</h2>
            <p className="text-muted-foreground">What this mob is in the game. Animations below refer to the ones in the Animation tab.</p>
            <FieldGrid fields={ENTITY_SETTINGS_FIELDS} value={settings} ctx={{ ...fieldCtx, animationNames: animations.map((a) => a.name) }} onChange={onSettingsChange} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1">
          {/* ── outliner ── */}
          <div className="flex w-52 shrink-0 flex-col border-r bg-sidebar text-xs">
            <div className="flex h-8 items-center justify-between px-2 font-semibold uppercase tracking-wide text-muted-foreground">
              {tab === "animation" ? "Bones" : "Outliner"} <span className="font-normal normal-case">{model.cubes.length} cubes</span>
            </div>
            <div className="flex-1 overflow-y-auto pb-2" data-testid="model-outliner"
              onContextMenu={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); openMenu(null, e.clientX, e.clientY); } }}>
              {tree.map((row) => {
                const active = sel?.type === row.kind && sel.id === row.id;
                return (
                  <div
                    key={row.id}
                    role="treeitem"
                    aria-selected={active}
                    data-outliner={row.name}
                    onClick={() => select({ type: row.kind, id: row.id })}
                    onDoubleClick={() => setRenaming(row.id)}
                    onContextMenu={(e) => { e.preventDefault(); const s = { type: row.kind, id: row.id }; select(s); openMenu(s, e.clientX, e.clientY); }}
                    className={`group flex h-6 cursor-pointer items-center gap-1 pr-2 ${active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"}`}
                    style={{ paddingLeft: 6 + row.depth * 12 }}
                  >
                    {row.kind === "bone" ? (
                      <button type="button" className="flex h-4 w-4 items-center justify-center" onClick={(e) => {
                        e.stopPropagation();
                        setCollapsed((s) => { const n = new Set(s); if (n.has(row.id)) n.delete(row.id); else n.add(row.id); return n; });
                      }}>
                        {row.hasChildren ? (collapsed.has(row.id) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                      </button>
                    ) : <span className="w-4" />}
                    {row.kind === "bone" ? <Bone className="h-3.5 w-3.5 shrink-0 text-sky-400" /> : <Box className="h-3.5 w-3.5 shrink-0 text-primary/80" />}
                    {renaming === row.id ? (
                      <Input autoFocus defaultValue={row.name} className="h-5 px-1 text-xs"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(null); }}
                        onBlur={(e) => {
                          const v = e.currentTarget.value.trim();
                          if (v && v !== row.name) commit(row.kind === "bone" ? updateBone(model, row.id, { name: v }) : updateCube(model, row.id, { name: v }));
                          setRenaming(null);
                        }} />
                    ) : <span className="truncate">{row.name}</span>}
                  </div>
                );
              })}
              {tree.length === 0 && <div className="px-3 py-2 text-muted-foreground">Empty — add a bone, then cubes.</div>}
            </div>
          </div>

          {/* ── viewport (+ timeline) ── */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <ModelViewport
                ref={viewport}
                model={model}
                textureUrl={textureUrl}
                selection={sel}
                mode={sel?.type === "bone" && mode === "scale" && tab === "design" ? "translate" : mode}
                snap={snap}
                rotationSnap={rotationSnap}
                onSelect={select}
                onTransformEnd={onTransformEnd}
                onContextMenu={openMenu}
                reference={variant === "armor" ? "player" : undefined}
              />
            </div>
            {tab === "animation" && (
              <AnimationTimeline
                model={model}
                animations={animations}
                active={anim}
                time={time}
                playing={playing}
                selectedBone={selectedBone?.id ?? null}
                selectedKeyframe={selectedKf}
                onSelectAnimation={(aid) => { setAnimId(aid); setTime(0); setPlaying(false); setSelectedKf(null); }}
                onAddAnimation={addAnimation}
                onRenameAnimation={() => {
                  if (!anim) return;
                  const name = window.prompt("Rename animation:", anim.name);
                  if (name?.trim()) updateAnim({ ...anim, name: name.trim().replace(/\s+/g, "_") });
                }}
                onDeleteAnimation={() => { if (anim && window.confirm(`Delete animation "${anim.name}"?`)) { setAnimations(animations.filter((a) => a.id !== anim.id)); setAnimId(null); } }}
                onChangeAnimation={(patch) => anim && updateAnim({ ...anim, ...patch })}
                onTime={setTime}
                onPlay={setPlaying}
                onSelectBone={(bid) => setSelection({ type: "bone", id: bid })}
                onSelectKeyframe={setSelectedKf}
                onMoveKeyframe={(kid, t) => anim && updateAnim(updateKeyframe(anim, kid, { time: t }))}
                onKeyframeMenu={(kid, x, y) => setMenu({ x, y, items: [
                  { label: "Interpolation", children: (["linear", "catmullrom", "step"] as Interpolation[]).map((i) => ({
                    label: i === "catmullrom" ? "Smooth (Catmull-Rom)" : i === "step" ? "Step" : "Linear",
                    onClick: () => anim && updateAnim(updateKeyframe(anim, kid, { interpolation: i })),
                  })) },
                  { label: "Copy to playhead", onClick: () => { const f = anim && findKeyframe(anim, kid); if (f) keyAtPlayhead(f.boneId, f.channel, f.keyframe.value); } },
                  { label: "", separator: true },
                  { label: "Delete keyframe", shortcut: "Del", danger: true, onClick: () => { if (anim) { updateAnim(deleteKeyframe(anim, kid)); setSelectedKf(null); } } },
                ] })}
              />
            )}
          </div>

          {/* ── properties ── */}
          <div className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l bg-sidebar p-3 text-xs" data-testid="model-properties">
            {tab === "animation" ? (
              <>
                <div className={sectionTitle}>Keyframe</div>
                {kfInfo ? (
                  <>
                    <div className="text-muted-foreground">
                      <span className="capitalize text-foreground">{kfInfo.channel}</span> · {model.bones.find((b) => b.id === kfInfo.boneId)?.name}
                    </div>
                    <label className="flex flex-col gap-0.5"><span className="text-muted-foreground">Time (s)</span>
                      <NumInput value={kfInfo.keyframe.time} onChange={(n) => anim && updateAnim(updateKeyframe(anim, kfInfo.keyframe.id, { time: n }))} /></label>
                    <Vec3Field label={kfInfo.channel === "rotation" ? "Rotation (°)" : kfInfo.channel === "position" ? "Offset (px)" : "Scale"}
                      value={kfInfo.keyframe.value} onChange={(v) => anim && updateAnim(updateKeyframe(anim, kfInfo.keyframe.id, { value: v }))} />
                    <label className="flex flex-col gap-0.5"><span className="text-muted-foreground">Interpolation</span>
                      <select className="h-7 rounded-sm border border-input bg-transparent px-1.5 [&>option]:bg-popover" value={kfInfo.keyframe.interpolation}
                        onChange={(e) => anim && updateAnim(updateKeyframe(anim, kfInfo.keyframe.id, { interpolation: e.target.value as Interpolation }))}>
                        <option value="linear">Linear</option><option value="catmullrom">Smooth (Catmull-Rom)</option><option value="step">Step</option>
                      </select></label>
                    <Button variant="destructive" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => { if (anim) { updateAnim(deleteKeyframe(anim, kfInfo.keyframe.id)); setSelectedKf(null); } }}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete keyframe
                    </Button>
                  </>
                ) : <div className="text-muted-foreground">Click a diamond in the timeline to edit it.</div>}

                <div className={sectionTitle}>Bone</div>
                {selectedBone ? (
                  <>
                    <div className="text-foreground">{selectedBone.name}</div>
                    <p className="text-muted-foreground">Pose it with the gizmo — rotating/moving/scaling writes a keyframe at {time.toFixed(2)} s. Or add one:</p>
                    {CHANNELS.map((ch) => (
                      <Button key={ch} variant="secondary" size="sm" className="h-7 justify-start gap-1.5 text-xs capitalize"
                        onClick={() => keyAtPlayhead(selectedBone.id, ch, currentValue(selectedBone.id, ch))}>
                        <KeyRound className="h-3.5 w-3.5" /> Key {ch}
                      </Button>
                    ))}
                  </>
                ) : <div className="text-muted-foreground">Select a bone to animate it.</div>}
              </>
            ) : (
              <>
                {selectedCube && (
                  <>
                    <div className={sectionTitle}>Cube</div>
                    <Input className="h-7 text-xs" value={selectedCube.name} onChange={(e) => commit(updateCube(model, selectedCube.id, { name: e.target.value }))} aria-label="Cube name" />
                    <Vec3Field label="Position (from)" value={selectedCube.from} onChange={(v) => commit(moveCubeTo(model, selectedCube.id, v))} />
                    <Vec3Field label="Size" value={cubeSize(selectedCube)} onChange={(v) => commit(resizeCube(model, selectedCube.id, v))} />
                    <Vec3Field label="Pivot" value={selectedCube.origin} onChange={(v) => commit(updateCube(model, selectedCube.id, { origin: v }))} />
                    <Vec3Field label="Rotation (°)" value={selectedCube.rotation} onChange={(v) => commit(updateCube(model, selectedCube.id, { rotation: v }))} />
                    <label className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">Inflate</span>
                      <NumInput value={selectedCube.inflate} onChange={(n) => commit(updateCube(model, selectedCube.id, { inflate: n }))} />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">Bone</span>
                      <select className="h-7 rounded-sm border border-input bg-transparent px-1.5 [&>option]:bg-popover" value={selectedCube.bone ?? ""}
                        onChange={(e) => commit(updateCube(model, selectedCube.id, { bone: e.target.value || null }))}>
                        <option value="">(root)</option>
                        {model.bones.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </label>
                    <div className={sectionTitle}>UV</div>
                    <label className="flex items-center gap-2"><Toggle checked={selectedCube.boxUv} onChange={(v) => commit(updateCube(model, selectedCube.id, { boxUv: v }))} /> Box UV</label>
                    {selectedCube.boxUv ? (
                      <>
                        <div className="grid grid-cols-2 gap-1">
                          <label className="flex flex-col gap-0.5"><span className="text-muted-foreground">U</span>
                            <NumInput value={selectedCube.uvOffset[0]} onChange={(n) => commit(updateCube(model, selectedCube.id, { uvOffset: [Math.round(n), selectedCube.uvOffset[1]] }))} /></label>
                          <label className="flex flex-col gap-0.5"><span className="text-muted-foreground">V</span>
                            <NumInput value={selectedCube.uvOffset[1]} onChange={(n) => commit(updateCube(model, selectedCube.id, { uvOffset: [selectedCube.uvOffset[0], Math.round(n)] }))} /></label>
                        </div>
                        <label className="flex items-center gap-2"><Toggle checked={selectedCube.mirror} onChange={(v) => commit(updateCube(model, selectedCube.id, { mirror: v }))} /> Mirror</label>
                      </>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {FACE_KEYS.map((face: FaceKey) => {
                          const f = selectedCube.faces[face];
                          return (
                            <div key={face} className="flex flex-col gap-0.5">
                              <label className="flex items-center gap-1.5 capitalize text-muted-foreground">
                                <input type="checkbox" checked={f.enabled} onChange={(e) => commit(updateCube(model, selectedCube.id, { faces: { ...selectedCube.faces, [face]: { ...f, enabled: e.target.checked } } }))} />
                                {face}
                              </label>
                              <div className="grid grid-cols-4 gap-0.5">
                                {f.uv.map((n, i) => (
                                  <NumInput key={i} value={n} onChange={(v) => {
                                    const uv = [...f.uv] as typeof f.uv;
                                    uv[i] = v;
                                    commit(updateCube(model, selectedCube.id, { faces: { ...selectedCube.faces, [face]: { ...f, uv } } }));
                                  }} />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                {selectedBone && (
                  <>
                    <div className={sectionTitle}>Bone</div>
                    <Input className="h-7 text-xs" value={selectedBone.name} onChange={(e) => commit(updateBone(model, selectedBone.id, { name: e.target.value }))} aria-label="Bone name" />
                    <Vec3Field label="Pivot" value={selectedBone.origin} onChange={(v) => commit(setBonePivot(model, selectedBone.id, v))} />
                    <Vec3Field label="Rotation (°)" value={selectedBone.rotation} onChange={(v) => commit(updateBone(model, selectedBone.id, { rotation: v }))} />
                    <label className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">Parent</span>
                      <select className="h-7 rounded-sm border border-input bg-transparent px-1.5 [&>option]:bg-popover" value={selectedBone.parent ?? ""}
                        onChange={(e) => commit(reparentBone(model, selectedBone.id, e.target.value || null))}>
                        <option value="">(root)</option>
                        {model.bones.filter((b) => b.id !== selectedBone.id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </label>
                  </>
                )}

                {!sel && <div className="text-muted-foreground">Click a cube in the view or outliner to edit it. Right-click for more.</div>}

                <div className={`mt-1 ${sectionTitle}`}>Texture</div>
                <TextureField value={model.texture} packTextures={packTextures} onPick={() => setTexPicker(true)} />
                <TexturePickerModal open={texPicker} packTextures={packTextures} current={model.texture}
                  onSelect={(k) => {
                    setTexPicker(false);
                    const url = packTextures[k];
                    if (!url) { commit({ ...model, texture: k }); return; }
                    // Adopt the image's real size so UVs line up.
                    const img = new Image();
                    img.onload = () => commit({ ...model, texture: k, textureWidth: img.naturalWidth || model.textureWidth, textureHeight: img.naturalHeight || model.textureHeight });
                    img.onerror = () => commit({ ...model, texture: k });
                    img.src = url;
                  }}
                  onClose={() => setTexPicker(false)} onUpload={uploadCustomTexture} />
                <div className="grid grid-cols-2 gap-1">
                  <label className="flex flex-col gap-0.5"><span className="text-muted-foreground">Texture width</span>
                    <NumInput value={model.textureWidth} onChange={(n) => commit({ ...model, textureWidth: Math.max(1, Math.round(n)) })} /></label>
                  <label className="flex flex-col gap-0.5"><span className="text-muted-foreground">Texture height</span>
                    <NumInput value={model.textureHeight} onChange={(n) => commit({ ...model, textureHeight: Math.max(1, Math.round(n)) })} /></label>
                </div>
                {uvRects && (
                  <div className="relative w-full overflow-hidden rounded-sm border border-input bg-[var(--rail)]" style={{ aspectRatio: `${model.textureWidth} / ${model.textureHeight}` }} data-testid="uv-preview">
                    {textureUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={textureUrl} alt="" className="absolute inset-0 h-full w-full" style={{ imageRendering: "pixelated" }} />
                    )}
                    {Object.entries(uvRects).map(([face, [u1, v1, u2, v2]]) => (
                      <div key={face} title={face} className="absolute border border-primary/90 bg-primary/15"
                        style={{
                          left: `${(Math.min(u1, u2) / model.textureWidth) * 100}%`, top: `${(Math.min(v1, v2) / model.textureHeight) * 100}%`,
                          width: `${(Math.abs(u2 - u1) / model.textureWidth) * 100}%`, height: `${(Math.abs(v2 - v1) / model.textureHeight) * 100}%`,
                        }} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
