"use client";

import type { ElementKindDef, ElementSpec, ElementsByKind } from "@/lib/elements/types";
import type { EntityModel, FaceKey, Vec3 } from "@/lib/model3d/types";
import type { McVersion } from "@/lib/mcVersion";
import {
  addBones, addCubes, deleteTargets, describeModel, describeMotion, editTarget, findBone, generateAnimation, holdItem, mirrorTarget, moveBone, packUv, templateModel,
  type BoneInput, type CubeInput,
} from "@/lib/model3d/aiOps";
import { emptyModel } from "@/lib/model3d/geometry";
import { makeAnimation, setKeyframe, pruneAnimations, type Channel, type Interpolation, type LoopMode } from "@/lib/model3d/animation";
import { toBbmodel, toBedrockGeo, toJavaModel, sanitizeBoneNames } from "@/lib/model3d/codecs";
import { toBedrockAnimations, toJavaAnimations } from "@/lib/model3d/animation";
import { defaultEntitySettings } from "@/lib/elements/entitySettings";
import { paintCubes, paintFace, paintTexture, type PaintOp } from "./texturePaint";
import { activeModelEditor } from "./modelEditorRegistry";

/** What the tools need from the editor page — rebuilt every render, read through a ref. */
export interface EditorApi {
  projectName: string;
  modId: string;
  mcVersion: McVersion;
  elements: ElementsByKind;
  kinds: ElementKindDef[];
  activeDoc: string;
  activeElement: { kind: string; id: string } | null;
  counts: Record<string, number>;
  packTextures: Record<string, string>;
  /** replace a kind's list (one undo step); `open` = index to open afterwards */
  setElements: (kind: string, list: ElementSpec[], open?: number) => void;
  openElement: (kind: string, index: number) => void;
  uploadTexture: (file: File) => Promise<string>;
}

const MODEL_KIND = "entityModel";
const pascal = (s: string) => s.replace(/(^|[_\-\s.]+)([a-z0-9])/gi, (_, __, c: string) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, "") || "Model";
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** Where each rotated limb's tip goes — lets the AI catch sign mistakes without a screenshot. */
function motionReport(model: EntityModel, animation: string): { motion?: string[] } {
  const anim = (model.animations ?? []).find((x) => x.name === animation);
  const motion = anim ? describeMotion(model, anim) : [];
  return motion.length ? { motion: [...motion, "Check: an attack/raised arm must move FORWARD (-Z). If a tip goes the wrong way, flip that rotation's sign."] } : {};
}

/** Executes one bridge command against the current editor state. */
export async function runTool(api: () => EditorApi, tool: string, args: Record<string, unknown>): Promise<unknown> {
  const a = args as Record<string, never>;
  const kindDef = (kind: string) => {
    const def = api().kinds.find((k) => k.kind === kind);
    if (!def) throw new Error(`unknown kind "${kind}" — see list_element_kinds`);
    return def;
  };
  const list = (kind: string) => api().elements[kind] ?? [];
  const indexOf = (kind: string, id: string) => {
    const i = list(kind).findIndex((e) => e.id === id);
    if (i < 0) throw new Error(`${kind} "${id}" not found`);
    return i;
  };
  const getModel = (id: string): EntityModel => list(MODEL_KIND)[indexOf(MODEL_KIND, id)] as unknown as EntityModel;
  /** Saves a changed model (one undo step) and keeps it open. */
  const saveModel = async (id: string, next: EntityModel) => {
    const i = indexOf(MODEL_KIND, id);
    const cur = list(MODEL_KIND);
    const pruned = { ...next, animations: pruneAnimations(next, next.animations ?? []) };
    api().setElements(MODEL_KIND, cur.map((e, j) => (j === i ? ({ ...e, ...pruned } as unknown as ElementSpec) : e)), i);
    await nextFrame();
  };
  const withModel = async (fn: (m: EntityModel) => EntityModel | Promise<EntityModel>) => {
    const id = String(a.model);
    const next = await fn(getModel(id));
    await saveModel(id, next);
    return { ok: true, model: id, bones: next.bones.length, cubes: next.cubes.length, texture: `${next.textureWidth}x${next.textureHeight}` };
  };
  const setTexture = async (id: string, blob: Blob) => {
    const key = await api().uploadTexture(new File([blob], `${id}.png`, { type: "image/png" }));
    const m = getModel(id);
    await saveModel(id, { ...m, texture: key });
    return key;
  };

  switch (tool) {
    case "get_status": {
      const s = api();
      return {
        project: s.projectName, modId: s.modId, minecraftVersion: s.mcVersion, open: s.activeElement ?? s.activeDoc,
        counts: s.counts, modelEditorOpen: !!activeModelEditor(),
      };
    }
    case "list_elements": {
      const kinds = a.kind ? [String(a.kind)] : api().kinds.map((k) => k.kind);
      return Object.fromEntries(kinds.map((k) => [k, list(k).map((e) => e.id)]));
    }
    case "list_element_kinds":
      return api().kinds.map((k) => ({
        kind: k.kind, label: k.label, description: k.description,
        fields: k.customEditor ? "use the model tools (create_model, add_cubes, …)" : k.fields.map((f) => ({
          key: f.key, type: f.type, label: f.label,
          ...("options" in f ? { options: f.options.map((o) => o.value) } : {}),
          ...(f.type === "list" ? { itemFields: f.fields.map((x) => ({ key: x.key, type: x.type })) } : {}),
        })),
        defaults: k.customEditor ? undefined : k.defaults(),
      }));
    case "create_element": {
      const kind = String(a.kind), id = String(a.id);
      const def = kindDef(kind);
      if (def.customEditor) throw new Error("use create_model for entity models");
      if (list(kind).some((e) => e.id === id)) throw new Error(`${kind} "${id}" already exists`);
      const spec = { ...def.defaults(), ...((a.fields as Record<string, unknown>) ?? {}), id } as ElementSpec;
      api().setElements(kind, [...list(kind), spec], list(kind).length);
      await nextFrame();
      return { ok: true, kind, id, problems: def.validate?.(spec, { modId: api().modId, mcVersion: api().mcVersion }) ?? [] };
    }
    case "update_element": {
      const kind = String(a.kind), id = String(a.id);
      const def = kindDef(kind);
      const i = indexOf(kind, id);
      const next = { ...list(kind)[i], ...((a.fields as Record<string, unknown>) ?? {}), id };
      api().setElements(kind, list(kind).map((e, j) => (j === i ? next : e)), i);
      await nextFrame();
      return { ok: true, problems: def.validate?.(next, { modId: api().modId, mcVersion: api().mcVersion }) ?? [] };
    }
    case "open_element":
      api().openElement(String(a.kind), indexOf(String(a.kind), String(a.id)));
      await nextFrame();
      return { ok: true };

    case "create_model": {
      const id = String(a.id);
      if (list(MODEL_KIND).some((e) => e.id === id)) throw new Error(`model "${id}" already exists`);
      const template = String(a.template ?? "empty");
      const base: EntityModel = template === "humanoid" || template === "quadruped"
        ? templateModel(template)
        : { ...emptyModel(), bones: [], cubes: [], animations: [] };
      const model = { ...base, textureWidth: Number(a.texture_width) || base.textureWidth, textureHeight: Number(a.texture_height) || base.textureHeight };
      api().setElements(MODEL_KIND, [...list(MODEL_KIND), { ...model, id, entity: defaultEntitySettings() } as unknown as ElementSpec], list(MODEL_KIND).length);
      await nextFrame();
      return { ok: true, id, ...describeModel(model) };
    }
    case "get_model":
      return describeModel(getModel(String(a.model)));
    case "add_bones":
      return withModel((m) => addBones(m, a.bones as unknown as BoneInput[]));
    case "add_cubes":
      return withModel((m) => addCubes(m, a.cubes as unknown as CubeInput[]));
    case "edit_element":
      return withModel((m) => editTarget(m, String(a.target), (a.changes as Record<string, unknown>) ?? {}));
    case "move_bone":
      return withModel((m) => moveBone(m, String(a.bone), a.offset as unknown as Vec3));
    case "hold_item": {
      let placed: { hand: Vec3 } | null = null;
      const res = await withModel((m) => {
        const r = holdItem(m, String(a.item), String(a.hand), { direction: a.direction, grip: a.grip });
        placed = r;
        return r.model;
      });
      return { ...res, hand: placed!.hand, note: "item bone pivot = hand, parented to the arm; take a side screenshot to check" };
    }
    case "delete_elements":
      return withModel((m) => deleteTargets(m, a.targets as unknown as string[]));
    case "mirror_element":
      return withModel((m) => mirrorTarget(m, String(a.target)));
    case "pack_uv":
      return withModel((m) => packUv(m));

    case "paint_cubes": {
      const id = String(a.model);
      const m = getModel(id);
      const blob = await paintCubes(m, { defaultColor: a.default_color, colors: a.colors, noise: a.noise }, undefined);
      const key = await setTexture(id, blob);
      return { ok: true, texture: key, size: `${m.textureWidth}x${m.textureHeight}` };
    }
    case "paint_texture": {
      const id = String(a.model);
      const m = getModel(id);
      const blob = await paintTexture(m, a.ops as unknown as PaintOp[], m.texture ? api().packTextures[m.texture] : undefined);
      return { ok: true, texture: await setTexture(id, blob) };
    }
    case "paint_face": {
      const id = String(a.model);
      const m = getModel(id);
      const blob = await paintFace(m, String(a.cube), a.face as unknown as FaceKey, a.color, a.ops as unknown as PaintOp[] | undefined, m.texture ? api().packTextures[m.texture] : undefined);
      return { ok: true, texture: await setTexture(id, blob) };
    }

    case "create_animation":
      return withModel((m) => {
        const name = String(a.name);
        const anim = makeAnimation(name, { length: Number(a.length), loop: (a.loop as LoopMode) ?? "loop" });
        return { ...m, animations: [...(m.animations ?? []).filter((x) => x.name !== name), anim] };
      });
    case "add_keyframes": {
      const res = await withModel((m) => {
        const anims = m.animations ?? [];
        const idx = anims.findIndex((x) => x.name === String(a.animation));
        if (idx < 0) throw new Error(`animation "${a.animation}" not found — create_animation first`);
        let anim = anims[idx];
        for (const k of a.keyframes as unknown as { bone: string; channel: Channel; time: number; value: Vec3; interpolation?: Interpolation }[]) {
          const bone = findBone(m, k.bone);
          if (!bone) throw new Error(`bone "${k.bone}" not found`);
          anim = setKeyframe(anim, bone.id, k.channel, k.time, k.value, k.interpolation ?? "linear");
        }
        return { ...m, animations: anims.map((x, j) => (j === idx ? anim : x)) };
      });
      return { ...res, ...motionReport(getModel(String(a.model)), String(a.animation)) };
    }
    case "generate_animation": {
      let name = "";
      const res = await withModel((m) => {
        const anim = generateAnimation(m, a.kind as unknown as "walk" | "idle" | "attack" | "fly", { name: a.name, speed: a.speed, intensity: a.intensity });
        name = anim.name;
        return { ...m, animations: [...(m.animations ?? []).filter((x) => x.name !== anim.name), anim] };
      });
      return { ...res, ...motionReport(getModel(String(a.model)), name) };
    }
    case "set_entity_settings": {
      const id = String(a.model);
      const i = indexOf(MODEL_KIND, id);
      const cur = list(MODEL_KIND)[i];
      const known = new Set(Object.keys(defaultEntitySettings()));
      const settings = (a.settings as Record<string, unknown>) ?? {};
      const unknown = Object.keys(settings).filter((k) => !known.has(k));
      if (unknown.length) throw new Error(`unknown setting(s): ${unknown.join(", ")}`);
      const entity = { ...defaultEntitySettings(), ...((cur.entity as Record<string, unknown>) ?? {}), ...settings };
      api().setElements(MODEL_KIND, list(MODEL_KIND).map((e, j) => (j === i ? { ...e, entity } : e)), i);
      await nextFrame();
      const def = kindDef(MODEL_KIND);
      return { ok: true, problems: def.validate?.({ ...cur, entity }, { modId: api().modId, mcVersion: api().mcVersion }) ?? [] };
    }

    case "set_view": {
      const ed = activeModelEditor();
      if (!ed) throw new Error("no entity model is open — open_element(entityModel, id) first");
      if (a.tab) ed.setTab(a.tab);
      if (a.animation !== undefined || a.time !== undefined) ed.pose(a.animation, Number(a.time ?? 0));
      if (a.view) ed.setView(a.view);
      await nextFrame();
      return { ok: true };
    }
    case "screenshot": {
      const ed = activeModelEditor();
      if (!ed) throw new Error("no entity model is open — open_element(entityModel, id) first");
      if (a.animation !== undefined) ed.pose(a.animation, Number(a.time ?? 0));
      const views = (a.views as unknown as string[] | undefined)?.length ? (a.views as unknown as string[]) : ["perspective"];
      const images: { label: string; data: string }[] = [];
      for (const v of views) {
        ed.setView(v);
        await nextFrame();
        images.push({ label: `${ed.modelId} — ${v}${a.animation ? ` @ ${a.animation} ${Number(a.time ?? 0)}s` : ""}`, data: ed.screenshot() });
      }
      return { images };
    }
    case "export_model": {
      const id = String(a.model);
      const m = sanitizeBoneNames(getModel(id));
      switch (String(a.format)) {
        case "bbmodel": return JSON.stringify(toBbmodel(m, { name: id, format: "bedrock" }));
        case "geo": return JSON.stringify(toBedrockGeo(m, { identifier: id }), null, 2);
        case "animations": return JSON.stringify(toBedrockAnimations(m, m.animations ?? [], id), null, 2);
        case "java": return toJavaModel(m, { className: `${pascal(id)}Model`, modId: api().modId, layer: id, mcVersion: api().mcVersion });
        case "java_animations": return toJavaAnimations(m, m.animations ?? [], `${pascal(id)}Animations`);
      }
      throw new Error(`unknown format ${a.format}`);
    }
  }
  throw new Error(`unknown tool "${tool}"`);
}
